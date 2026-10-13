import requests

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

    def fake_get(url, timeout):
        seen["url"] = url
        return FakeResponse({
            "bestMatches": [
                {"1. symbol": "ASML", "2. name": "ASML Holding NV"},
                {"1. symbol": None, "2. name": "Incomplete result"},
            ]
        })

    monkeypatch.setattr("requests.get", fake_get)

    results = client.get("/search_stock?q=asml").get_json()

    assert results == [{"symbol": "ASML", "name": "ASML Holding NV"}]
    assert "function=SYMBOL_SEARCH" in seen["url"]
    assert "keywords=asml" in seen["url"]


def test_alpha_vantage_failure_returns_500(client, monkeypatch):
    def failing_get(url, timeout):
        raise requests.ConnectionError("Alpha Vantage is down")

    monkeypatch.setattr("requests.get", failing_get)

    response = client.get("/search_stock?q=asml")

    assert response.status_code == 500
    assert response.get_json() == []
