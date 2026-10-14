from datetime import date

import pandas as pd
import pytest

import send_price_alerts
from services import price_alerts
from services.price_alerts import ResendSender, SupabaseStore, compose_email, run, todays_change
from tests.fakes import FakeResponse, empty_prices

TODAY = date(2026, 10, 14)


class FakeStore:
    def __init__(self, favorites, settings=None, sent=(), emails=None):
        self._favorites = [{"user_id": user, "symbol": symbol} for user, symbol in favorites]
        self._settings = settings or {}
        self.sent = set(sent)
        self.emails = emails if emails is not None else {}
        self.recorded = []

    def favorites(self):
        return self._favorites

    def settings(self):
        return self._settings

    def already_sent(self, alert_date):
        assert alert_date == TODAY
        return self.sent

    def record_sent(self, user_id, alert_date, moves):
        self.recorded.append((user_id, alert_date, moves))
        self.sent.update((user_id, symbol) for symbol, _ in moves)

    def email(self, user_id):
        return self.emails.get(user_id, f"{user_id}@example.com")


class FakeSender:
    def __init__(self, fail_for=()):
        self.messages = []
        self.fail_for = set(fail_for)

    def send(self, to, subject, text, html_body):
        if to in self.fail_for:
            raise RuntimeError("provider down")
        self.messages.append({"to": to, "subject": subject, "text": text, "html": html_body})


def changes(**moves):
    """A get_change function returning fixed moves, which records every lookup."""
    def get_change(symbol, today):
        get_change.calls.append(symbol)
        return moves.get(symbol)
    get_change.calls = []
    return get_change


def test_emails_a_user_when_a_pinned_stock_moves_past_the_default_threshold():
    store = FakeStore([("u1", "AAPL"), ("u1", "MSFT")])
    sender = FakeSender()

    assert run(store, sender, TODAY, changes(AAPL=-6.2, MSFT=1.0)) == 1

    assert len(sender.messages) == 1
    message = sender.messages[0]
    assert message["to"] == "u1@example.com"
    assert message["subject"] == "AAPL is down 6.2% today"
    assert "AAPL: -6.20%" in message["text"]
    assert "MSFT" not in message["text"]
    assert store.recorded == [("u1", TODAY, [("AAPL", -6.2)])]


def test_uses_each_users_own_threshold_and_skips_users_who_turned_alerts_off():
    store = FakeStore([("low", "TSLA"), ("high", "TSLA"), ("off", "TSLA")],
                      settings={"low": (True, 2.0), "high": (True, 10.0), "off": (False, 1.0)})
    sender = FakeSender()

    run(store, sender, TODAY, changes(TSLA=3.5))

    assert [m["to"] for m in sender.messages] == ["low@example.com"]


def test_sends_at_most_one_alert_per_stock_per_day():
    store = FakeStore([("u1", "AAPL"), ("u1", "NVDA")], sent={("u1", "AAPL")})
    sender = FakeSender()
    get_change = changes(AAPL=8.0, NVDA=7.0)

    run(store, sender, TODAY, get_change)
    assert "AAPL" not in sender.messages[0]["text"]
    assert "NVDA: +7.00%" in sender.messages[0]["text"]

    # A later run the same day finds nothing new to send
    assert run(store, sender, TODAY, get_change) == 0
    assert len(sender.messages) == 1


def test_groups_several_moves_into_one_email_biggest_first():
    store = FakeStore([("u1", "AAPL"), ("u1", "NVDA"), ("u1", "BP")])
    sender = FakeSender()

    run(store, sender, TODAY, changes(AAPL=5.5, NVDA=-9.0, BP=6.0))

    message = sender.messages[0]
    assert message["subject"] == "3 of your pinned stocks moved more than 5% today"
    assert message["text"].index("NVDA") < message["text"].index("BP") < message["text"].index("AAPL")


def test_looks_up_each_stock_once_however_many_users_pinned_it():
    store = FakeStore([("u1", "AAPL"), ("u2", "aapl"), ("u3", "AAPL")])
    get_change = changes(AAPL=0.5)

    run(store, FakeSender(), TODAY, get_change)

    assert get_change.calls == ["AAPL"]


def test_a_failed_email_is_not_recorded_and_doesnt_stop_other_users():
    store = FakeStore([("u1", "AAPL"), ("u2", "AAPL")])
    sender = FakeSender(fail_for={"u1@example.com"})

    assert run(store, sender, TODAY, changes(AAPL=12.0)) == 1

    assert [m["to"] for m in sender.messages] == ["u2@example.com"]
    assert [user for user, _, _ in store.recorded] == ["u2"]


def test_skips_stocks_without_a_price_today_or_whose_lookup_fails():
    store = FakeStore([("u1", "AAPL"), ("u1", "GONE")])
    sender = FakeSender()

    def get_change(symbol, today):
        if symbol == "GONE":
            raise RuntimeError("Yahoo is down")
        return None

    assert run(store, sender, TODAY, get_change) == 0
    assert sender.messages == []


def test_demo_mode_only_emails_the_owner():
    store = FakeStore([("owner", "AAPL"), ("someone", "AAPL")])
    sender = FakeSender()
    get_change = changes(AAPL=9.0)

    assert run(store, sender, TODAY, get_change, owner_id="owner") == 1

    assert [m["to"] for m in sender.messages] == ["owner@example.com"]
    assert [user for user, _, _ in store.recorded] == ["owner"]


def test_skips_users_without_an_email_address():
    store = FakeStore([("u1", "AAPL")], emails={"u1": None})
    sender = FakeSender()

    assert run(store, sender, TODAY, changes(AAPL=10.0)) == 0
    assert store.recorded == []


def test_email_links_to_the_settings_page_and_escapes_html():
    subject, text, html_body = compose_email([("A&B", 5.0)], 5.0, site_url="https://example.com/settings/")

    assert subject == "A&B is up 5.0% today"
    assert "https://example.com/settings/" in text
    assert "<strong>A&amp;B</strong>: +5.00%" in html_body
    assert 'href="https://example.com/settings/"' in html_body


# todays_change: reads Yahoo Finance through the shared market data helper

def daily_bars(closes, last_day):
    index = pd.bdate_range(end=last_day, periods=len(closes), tz="America/New_York")
    return pd.DataFrame({"Close": closes}, index=index)


def test_todays_change_is_the_move_from_yesterdays_close(fake_yfinance):
    fake_yfinance(daily_bars([100.0, 110.0], TODAY))

    assert todays_change("AAPL", TODAY) == pytest.approx(10.0)


def test_todays_change_is_none_when_the_market_hasnt_traded_today(fake_yfinance):
    fake_yfinance(daily_bars([100.0, 110.0], date(2026, 10, 13)))

    assert todays_change("AAPL", TODAY) is None


def test_todays_change_is_none_without_data(fake_yfinance):
    fake_yfinance(empty_prices())

    assert todays_change("AAPL", TODAY) is None


# The Supabase and Resend clients, with a fake HTTP session

class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def _respond(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        return self.responses.pop(0)

    def get(self, url, **kwargs):
        return self._respond("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._respond("POST", url, **kwargs)


def test_store_pages_through_favorites(monkeypatch):
    monkeypatch.setattr(price_alerts, "PAGE_SIZE", 2)
    session = FakeSession([
        FakeResponse([{"user_id": "u1", "symbol": "A"}, {"user_id": "u1", "symbol": "B"}]),
        FakeResponse([{"user_id": "u2", "symbol": "C"}]),
    ])
    store = SupabaseStore("https://proj.supabase.co/", "service-key", session)

    assert [row["symbol"] for row in store.favorites()] == ["A", "B", "C"]
    assert session.calls[0]["url"] == "https://proj.supabase.co/rest/v1/favorites"
    assert session.calls[1]["params"]["offset"] == 2
    assert session.calls[0]["headers"]["Authorization"] == "Bearer service-key"


def test_store_reads_settings_sent_alerts_and_emails():
    session = FakeSession([
        FakeResponse([{"user_id": "u1", "enabled": False, "threshold_percent": "7.50"}]),
        FakeResponse([{"user_id": "u1", "symbol": "AAPL"}]),
        FakeResponse({"id": "u1", "email": "u1@example.com"}),
    ])
    store = SupabaseStore("https://proj.supabase.co", "service-key", session)

    assert store.settings() == {"u1": (False, 7.5)}
    assert store.already_sent(TODAY) == {("u1", "AAPL")}
    assert session.calls[1]["params"]["alert_date"] == "eq.2026-10-14"
    assert store.email("u1") == "u1@example.com"
    assert session.calls[2]["url"] == "https://proj.supabase.co/auth/v1/admin/users/u1"


def test_store_records_sent_alerts_ignoring_duplicates():
    session = FakeSession([FakeResponse([], status_code=201)])
    store = SupabaseStore("https://proj.supabase.co", "service-key", session)

    store.record_sent("u1", TODAY, [("AAPL", 6.234)])

    call = session.calls[0]
    assert call["json"] == [{"user_id": "u1", "symbol": "AAPL", "alert_date": "2026-10-14", "change_percent": 6.23}]
    assert call["headers"]["Prefer"] == "resolution=ignore-duplicates"


def test_store_raises_on_http_errors():
    store = SupabaseStore("https://proj.supabase.co", "service-key", FakeSession([FakeResponse({}, status_code=401)]))

    with pytest.raises(RuntimeError):
        store.favorites()


def test_resend_sender_posts_the_email():
    session = FakeSession([FakeResponse({"id": "email-1"})])

    ResendSender("resend-key", "Alerts <alerts@example.com>", session).send("u@example.com", "Hi", "text", "<p>html</p>")

    call = session.calls[0]
    assert call["url"] == "https://api.resend.com/emails"
    assert call["json"]["to"] == ["u@example.com"]
    assert call["headers"]["Authorization"] == "Bearer resend-key"


# The scheduled job's entry point

def test_job_stops_when_keys_are_missing(monkeypatch, capsys):
    for name in send_price_alerts.REQUIRED:
        monkeypatch.delenv(name, raising=False)

    assert send_price_alerts.main() == 1
    assert "SUPABASE_SERVICE_ROLE_KEY" in capsys.readouterr().err


def test_job_runs_with_keys_from_the_environment(monkeypatch):
    for name in send_price_alerts.REQUIRED:
        monkeypatch.setenv(name, "x")
    monkeypatch.setenv("SITE_URL", "https://example.com/settings/")
    seen = {}

    monkeypatch.setenv("ALERT_OWNER_ID", "owner-uuid")

    def fake_run(store, sender, today, site_url=None, owner_id=None):
        seen.update(store=store, sender=sender, site_url=site_url, owner_id=owner_id)
        return 0

    monkeypatch.setattr(send_price_alerts, "run", fake_run)

    assert send_price_alerts.main() == 0
    assert isinstance(seen["store"], SupabaseStore)
    assert isinstance(seen["sender"], ResendSender)
    assert seen["site_url"] == "https://example.com/settings/"
    assert seen["owner_id"] == "owner-uuid"
