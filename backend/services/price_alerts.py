"""Email users when a stock they've pinned moves a lot in a day.

Run by a scheduled GitHub Actions job (send_price_alerts.py) rather than the Flask API, because
Render's free server sleeps when nobody is using the site. Each run:

1. reads everyone's pinned stocks and alert settings from Supabase,
2. works out each pinned stock's move today, as a % change from the previous close,
3. emails each user one message listing the stocks that moved at least their threshold,
   skipping any stock they've already been alerted about today.

A user without saved settings gets alerts at DEFAULT_THRESHOLD_PERCENT. When `owner_id` is given
(demo mode, for an email provider that may only send to the site owner), only that user is
emailed. Supabase is reached with
the service role key, which can read every user's rows, so this only ever runs server-side.
"""
import html
import logging
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from services.market_data import daily_move, get_history

logger = logging.getLogger(__name__)

DEFAULT_THRESHOLD_PERCENT = 5.0

# Trading days follow New York time, so "today" for an alert does too
MARKET_TIMEZONE = ZoneInfo("America/New_York")

PAGE_SIZE = 1000


def market_today():
    return datetime.now(MARKET_TIMEZONE).date()


def todays_change(ticker, today):
    """Today's % change for `ticker`, or None when there's no bar for today (weekend, holiday)."""
    move = daily_move(get_history(ticker, period="5d", interval="1d", cache_seconds=60))
    if move is None:
        return None
    _, change, bar_date = move
    return change if bar_date == today else None


class SupabaseStore:
    """The tables the alerts need, through Supabase's REST and auth admin APIs."""

    def __init__(self, url, service_key, session):
        self.url = url.rstrip("/")
        self.session = session
        self.headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

    def _get_all(self, table, select):
        rows = []
        while True:
            response = self.session.get(
                f"{self.url}/rest/v1/{table}",
                params={"select": select, "limit": PAGE_SIZE, "offset": len(rows)},
                headers=self.headers, timeout=20)
            response.raise_for_status()
            page = response.json()
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows

    def favorites(self):
        return self._get_all("favorites", "user_id,symbol")

    def settings(self):
        """{user_id: (alerts enabled, threshold %)} for users who've saved settings."""
        rows = self._get_all("alert_settings", "user_id,enabled,threshold_percent")
        return {row["user_id"]: (row["enabled"], float(row["threshold_percent"])) for row in rows}

    def already_sent(self, alert_date):
        """{(user_id, symbol)} already alerted on `alert_date`."""
        response = self.session.get(
            f"{self.url}/rest/v1/alerts_sent",
            params={"select": "user_id,symbol", "alert_date": f"eq.{alert_date.isoformat()}"},
            headers=self.headers, timeout=20)
        response.raise_for_status()
        return {(row["user_id"], row["symbol"]) for row in response.json()}

    def record_sent(self, user_id, alert_date, moves):
        rows = [{"user_id": user_id, "symbol": symbol, "alert_date": alert_date.isoformat(),
                 "change_percent": round(change, 2)} for symbol, change in moves]
        response = self.session.post(
            f"{self.url}/rest/v1/alerts_sent",
            params={"on_conflict": "user_id,symbol,alert_date"},
            json=rows,
            headers={**self.headers, "Prefer": "resolution=ignore-duplicates"},
            timeout=20)
        response.raise_for_status()

    def email(self, user_id):
        response = self.session.get(f"{self.url}/auth/v1/admin/users/{user_id}",
                                    headers=self.headers, timeout=20)
        response.raise_for_status()
        return response.json().get("email")


class ResendSender:
    """Sends email through Resend's API (https://resend.com)."""

    def __init__(self, api_key, from_address, session):
        self.api_key = api_key
        self.from_address = from_address
        self.session = session

    def send(self, to, subject, text, html_body):
        response = self.session.post(
            "https://api.resend.com/emails",
            json={"from": self.from_address, "to": [to], "subject": subject,
                  "text": text, "html": html_body},
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=20)
        response.raise_for_status()


def compose_email(moves, threshold, site_url=None):
    """(subject, plain text, HTML) for a list of (symbol, % change), biggest move first."""
    moves = sorted(moves, key=lambda move: abs(move[1]), reverse=True)
    if len(moves) == 1:
        symbol, change = moves[0]
        subject = f"{symbol} is {'up' if change > 0 else 'down'} {abs(change):.1f}% today"
    else:
        subject = f"{len(moves)} of your pinned stocks moved more than {threshold:g}% today"

    lines = [f"{symbol}: {change:+.2f}%" for symbol, change in moves]
    intro = f"These pinned stocks have moved at least {threshold:g}% since yesterday's close:"
    footer = "You can change your alert threshold or turn alerts off on the settings page."
    text = "\n".join([intro, "", *lines, "", footer] + ([site_url] if site_url else []))

    items = "".join(f"<li><strong>{html.escape(symbol)}</strong>: {change:+.2f}%</li>"
                    for symbol, change in moves)
    settings = (f'<a href="{html.escape(site_url)}">settings page</a>' if site_url
                else "settings page")
    html_body = (f"<p>{intro}</p><ul>{items}</ul>"
                 f"<p>You can change your alert threshold or turn alerts off on the {settings}.</p>")
    return subject, text, html_body


def run(store, sender, today, get_change=todays_change, site_url=None, owner_id=None):
    """Send today's alerts, only to `owner_id` if it's given. Returns how many emails were sent."""
    pinned = defaultdict(set)
    for row in store.favorites():
        if owner_id and row["user_id"] != owner_id:
            continue
        pinned[row["user_id"]].add(row["symbol"].upper())

    settings = store.settings()
    sent_today = store.already_sent(today)

    changes = {}  # each stock is looked up once, however many users pinned it
    emails_sent = 0
    for user_id, symbols in pinned.items():
        enabled, threshold = settings.get(user_id, (True, DEFAULT_THRESHOLD_PERCENT))
        if not enabled:
            continue

        moves = []
        for symbol in sorted(symbols):
            if (user_id, symbol) in sent_today:
                continue
            if symbol not in changes:
                try:
                    changes[symbol] = get_change(symbol, today)
                except Exception:
                    logger.exception("Couldn't get today's price for %s", symbol)
                    changes[symbol] = None
            change = changes[symbol]
            if change is not None and abs(change) >= threshold:
                moves.append((symbol, change))
        if not moves:
            continue

        try:
            address = store.email(user_id)
            if not address:
                continue
            sender.send(address, *compose_email(moves, threshold, site_url))
        except Exception:
            # One failure (a bad address, a provider hiccup) shouldn't stop everyone else's alerts;
            # nothing is recorded, so the next run tries again.
            logger.exception("Couldn't send price alert to user %s", user_id)
            continue
        store.record_sent(user_id, today, moves)
        emails_sent += 1
    return emails_sent
