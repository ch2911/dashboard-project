"""A small in-memory cache whose entries expire after a fixed number of seconds.

Used to avoid repeating slow or rate-limited work: forecasts, news and stock searches.
"""
import threading
import time

_all_caches = []


def clear_all():
    """Empty every cache (used by the tests)."""
    for cache in _all_caches:
        cache.clear()


class TTLCache:
    def __init__(self, seconds, max_entries=500):
        self.seconds = seconds
        self.max_entries = max_entries
        self._entries = {}  # key -> (time it expires, value)
        self._lock = threading.Lock()  # gunicorn serves requests from several threads
        _all_caches.append(self)

    def get(self, key):
        """Return the saved value, or None if there isn't one that's still fresh."""
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.monotonic() >= expires_at:
                del self._entries[key]
                return None
            return value

    def set(self, key, value, seconds=None):
        """Save a value for `seconds` (by default the cache's own lifetime)."""
        lifetime = self.seconds if seconds is None else seconds
        with self._lock:
            if key not in self._entries and len(self._entries) >= self.max_entries:
                # Full: drop the entry that expires soonest to make room
                soonest = min(self._entries, key=lambda k: self._entries[k][0])
                del self._entries[soonest]
            self._entries[key] = (time.monotonic() + lifetime, value)

    def clear(self):
        with self._lock:
            self._entries.clear()

    def __len__(self):
        return len(self._entries)
