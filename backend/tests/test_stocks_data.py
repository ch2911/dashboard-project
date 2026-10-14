import json
import os

STOCKS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "stocks.json")


def load_stocks():
    with open(STOCKS_FILE) as f:
        return json.load(f)


def test_every_stock_has_a_symbol_and_name():
    for stock in load_stocks():
        assert stock["symbol"].strip()
        assert stock["name"].strip()


def test_no_stock_is_listed_twice():
    symbols = [stock["symbol"] for stock in load_stocks()]
    duplicates = sorted({s for s in symbols if symbols.count(s) > 1})
    assert duplicates == []
