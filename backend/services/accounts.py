"""Deleting a user's profile through Supabase's admin API.

Needs SUPABASE_SERVICE_ROLE_KEY, which can do anything in the Supabase project, so it is only
ever read from the server's environment and never sent to the browser.
"""
import os

import requests

# The project URL is public (the frontend uses it too), so it has a default
DEFAULT_SUPABASE_URL = "https://eircetcgxjhrtoxluapp.supabase.co"

TIMEOUT_SECONDS = 10


def _url():
    return (os.getenv("SUPABASE_URL") or DEFAULT_SUPABASE_URL).rstrip("/")


def _service_key():
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def is_configured():
    return bool(_service_key())


def _admin_headers():
    key = _service_key()
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def user_id_for_token(token):
    """The id of the user a Supabase access token belongs to, or None if it isn't valid."""
    response = requests.get(
        f"{_url()}/auth/v1/user",
        headers={"apikey": _service_key(), "Authorization": f"Bearer {token}"},
        timeout=TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        return None
    return response.json().get("id")


def delete_user(user_id):
    """Remove the user's pinned stocks, then their login. Raises if Supabase refuses either."""
    favorites = requests.delete(
        f"{_url()}/rest/v1/favorites",
        params={"user_id": f"eq.{user_id}"},
        headers=_admin_headers(),
        timeout=TIMEOUT_SECONDS,
    )
    favorites.raise_for_status()

    login = requests.delete(
        f"{_url()}/auth/v1/admin/users/{user_id}",
        headers=_admin_headers(),
        timeout=TIMEOUT_SECONDS,
    )
    login.raise_for_status()
