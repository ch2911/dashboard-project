import pytest

from app import news_query, short_company_name


@pytest.mark.parametrize(
    "name, short",
    [
        ("Apple Inc.", "Apple"),
        ("Goldman Sachs Group Inc.", "Goldman Sachs"),
        ("Merck & Co. Inc.", "Merck"),
        ("Amazon.com Inc.", "Amazon"),
        ("Alibaba Group Holding Limited", "Alibaba"),
        ("Mastercard Incorporated Class A", "Mastercard"),
        ("Build-A-Bear Workshop, Inc.", "Build-A-Bear Workshop"),
        ("Johnson & Johnson", "Johnson & Johnson"),
    ],
)
def test_short_company_name(name, short):
    assert short_company_name(name) == short


def test_query_uses_ticker_and_company_name():
    assert news_query("AAPL") == 'AAPL OR "Apple"'


def test_short_tickers_use_only_the_company_name():
    # "T" or "GE" on their own would match far too many headlines
    assert news_query("T") == '"AT&T"'
    assert news_query("GE") == '"General Electric"'


def test_tickers_with_an_exchange_suffix_use_only_the_company_name():
    assert news_query("RR.L") == '"Rolls-Royce"'


def test_unknown_ticker_searches_for_the_ticker():
    assert news_query("ASML") == "ASML"
