from services import cache
from services.cache import TTLCache


def test_returns_saved_value_until_it_expires(clock):
    store = TTLCache(seconds=60)
    store.set("AAPL", [1, 2, 3])

    clock.advance(59)
    assert store.get("AAPL") == [1, 2, 3]

    clock.advance(1)
    assert store.get("AAPL") is None


def test_missing_key_returns_none():
    assert TTLCache(seconds=60).get("nothing here") is None


def test_drops_the_oldest_entry_when_full(clock):
    store = TTLCache(seconds=60, max_entries=2)
    store.set("first", 1)
    clock.advance(1)
    store.set("second", 2)
    clock.advance(1)
    store.set("third", 3)

    assert store.get("first") is None
    assert store.get("second") == 2
    assert store.get("third") == 3
    assert len(store) == 2


def test_clear_all_empties_every_cache():
    one, two = TTLCache(seconds=60), TTLCache(seconds=60)
    one.set("a", 1)
    two.set("b", 2)

    cache.clear_all()

    assert one.get("a") is None
    assert two.get("b") is None
