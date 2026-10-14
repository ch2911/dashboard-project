import logging

import requests

import app as app_module
from fakes import FakeResponse


def test_empty_query_returns_empty_list(client):
    response = client.get("/search_stock?q=")
    assert response.status_code == 200
    assert response.get_json() == []


def test_finds_stock_by_symbol(client):
    results = client.get("/search_stock?q=msft").get_json()
    assert {"symbol": "MSFT", "name": "Microsoft Corporation"} in results


def test_finds_stock_by_company_name_ignoring_case(client):
    results = client.get("/search_stock?q=ApPlE").get_json()
    assert any(stock["symbol"] == "AAPL" for stock in results)
    assert all("apple" in (stock["symbol"] + stock["name"]).lower() for stock in results)


def test_local_results_are_capped_at_10(client):
    results = client.get("/search_stock?q=a").get_json()
    assert len(results) == 10


def test_falls_back_to_alpha_vantage_when_no_local_match(client, monkeypatch):
    seen = {}

    def fake_get(url, timeout, params=None):
        seen["url"] = url
        seen["params"] = params
        return FakeResponse({
            "bestMatches": [
                {"1. symbol": "ASML", "2. name": "ASML Holding NV"},
                {"1. symbol": None, "2. name": "Incomplete result"},
            ]
        })

    monkeypatch.setattr("requests.get", fake_get)

    results = client.get("/search_stock?q=asml").get_json()

    assert results == [{"symbol": "ASML", "name": "ASML Holding NV"}]
    assert seen["params"]["function"] == "SYMBOL_SEARCH"
    assert seen["params"]["keywords"] == "asml"


def test_alpha_vantage_failure_returns_500(client, monkeypatch):
    def failing_get(url, timeout, params=None):
        raise requests.ConnectionError("Alpha Vantage is down")

    monkeypatch.setattr("requests.get", failing_get)

    response = client.get("/search_stock?q=asml")

    assert response.status_code == 500
    assert response.get_json() == []


def test_alpha_vantage_results_are_cached(client, monkeypatch):
    requests_made = []

    def fake_get(url, timeout, params=None):
        requests_made.append(params)
        return FakeResponse({"bestMatches": [{"1. symbol": "ASML", "2. name": "ASML Holding NV"}]})

    monkeypatch.setattr("requests.get", fake_get)

    client.get("/search_stock?q=asml")
    results = client.get("/search_stock?q=ASML").get_json()  # same search, different case

    assert results == [{"symbol": "ASML", "name": "ASML Holding NV"}]
    assert len(requests_made) == 1


def test_alpha_vantage_limit_message_is_logged_and_not_cached(client, monkeypatch, caplog):
    requests_made = []

    def fake_get(url, timeout, params=None):
        requests_made.append(params)
        return FakeResponse({"Information": "You have reached the 25 requests per day limit."})

    monkeypatch.setattr("requests.get", fake_get)

    with caplog.at_level(logging.WARNING):
        first = client.get("/search_stock?q=asml").get_json()
        client.get("/search_stock?q=asml")

    assert first == []
    assert "25 requests per day" in caplog.text
    assert len(requests_made) == 2


def test_connection_errors_do_not_log_the_api_key(client, monkeypatch, caplog):
    monkeypatch.setattr(app_module, "ALPHAVANTAGE_KEY", "secret-key-123")

    def failing_get(url, timeout, params=None):
        raise requests.ConnectionError(f"Max retries exceeded with url: {url}")

    monkeypatch.setattr("requests.get", failing_get)

    with caplog.at_level(logging.WARNING):
        client.get("/search_stock?q=asml")

    assert "ConnectionError" in caplog.text
    assert "secret-key-123" not in caplog.text


def test_search_text_cannot_add_its_own_alpha_vantage_parameters(client, monkeypatch):
    seen = {}

    def fake_get(url, timeout, params=None):
        seen["url"] = url
        seen["params"] = params
        return FakeResponse({"bestMatches": []})

    monkeypatch.setattr("requests.get", fake_get)

    client.get("/search_stock?q=" + requests.utils.quote("zzz&function=LISTING_STATUS"))

    # The whole search goes in "keywords" for requests to encode, not pasted into the URL
    assert seen["url"] == "https://www.alphavantage.co/query"
    assert seen["params"]["function"] == "SYMBOL_SEARCH"
    assert seen["params"]["keywords"] == "zzz&function=listing_status"


def test_overlong_search_is_refused_without_calling_alpha_vantage(client):
    # The autouse fixture fails the test if Alpha Vantage is called
    response = client.get("/search_stock?q=" + "x" * 51)

    assert response.status_code == 400
