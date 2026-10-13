from app import extract_symbols


def test_finds_known_tickers_in_headline():
    found = extract_symbols("AAPL and MSFT rally while TSLA slips")
    assert sorted(found) == ["AAPL", "MSFT", "TSLA"]


def test_ignores_capitalised_words_that_are_not_tracked_stocks():
    assert extract_symbols("CEO says US GDP growth beat forecasts") == []


def test_ignores_lowercase_company_names():
    assert extract_symbols("apple and microsoft shares rise") == []


def test_returns_at_most_five_symbols():
    found = extract_symbols("AAPL MSFT TSLA NVDA AMZN META NFLX all moved today")
    assert len(found) == 5
