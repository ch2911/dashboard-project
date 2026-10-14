import pytest

from fakes import FakeResponse

SUPABASE = "https://eircetcgxjhrtoxluapp.supabase.co"


@pytest.fixture
def supabase(monkeypatch):
    """Fake Supabase: one valid token, and a record of every delete request."""
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    class Fake:
        deletes = []
        delete_status = 200

    def fake_get(url, headers, timeout):
        assert url == f"{SUPABASE}/auth/v1/user"
        assert headers["apikey"] == "service-key"
        if headers["Authorization"] == "Bearer good-token":
            return FakeResponse({"id": "user-123", "email": "a@example.com"})
        return FakeResponse({"msg": "invalid JWT"}, status_code=401)

    def fake_delete(url, headers, timeout, params=None):
        assert headers == {"apikey": "service-key", "Authorization": "Bearer service-key"}
        Fake.deletes.append((url, params))
        return FakeResponse({}, status_code=Fake.delete_status)

    monkeypatch.setattr("requests.get", fake_get)
    monkeypatch.setattr("requests.delete", fake_delete)
    return Fake


def test_deletes_pinned_stocks_then_login(client, supabase):
    response = client.delete("/account", headers={"Authorization": "Bearer good-token"})

    assert response.status_code == 200
    assert response.get_json() == {"deleted": True}
    assert supabase.deletes == [
        (f"{SUPABASE}/rest/v1/favorites", {"user_id": "eq.user-123"}),
        (f"{SUPABASE}/auth/v1/admin/users/user-123", None),
    ]


def test_rejects_an_invalid_token(client, supabase):
    response = client.delete("/account", headers={"Authorization": "Bearer stolen-or-expired"})

    assert response.status_code == 401
    assert supabase.deletes == []


def test_rejects_a_request_without_a_token(client, supabase):
    response = client.delete("/account")

    assert response.status_code == 401
    assert supabase.deletes == []


def test_says_so_when_the_service_key_is_missing(client, monkeypatch):
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    response = client.delete("/account", headers={"Authorization": "Bearer good-token"})

    assert response.status_code == 503
    assert "isn't set up" in response.get_json()["error"]


def test_reports_an_error_if_supabase_refuses(client, supabase):
    supabase.delete_status = 500

    response = client.delete("/account", headers={"Authorization": "Bearer good-token"})

    assert response.status_code == 500
    assert "error" in response.get_json()


def test_supabase_url_can_be_overridden(client, supabase, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://other.supabase.co/")
    seen = []
    monkeypatch.setattr("requests.get", lambda url, headers, timeout: seen.append(url) or FakeResponse({}, 401))

    client.delete("/account", headers={"Authorization": "Bearer good-token"})

    assert seen == ["https://other.supabase.co/auth/v1/user"]
