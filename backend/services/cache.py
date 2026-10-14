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
        self._entries = {}  # key -> (time saved, value)
        self._lock = threading.Lock()  # gunicorn serves requests from several threads
        _all_caches.append(self)

    def get(self, key):
        """Return the saved value, or None if there isn't one from the last `seconds`."""
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            saved_at, value = entry
            if time.monotonic() - saved_at >= self.seconds:
                del self._entries[key]
                return None
            return value

    def set(self, key, value):
        with self._lock:
            if key not in self._entries and len(self._entries) >= self.max_entries:
                # Full: drop the oldest entry to make room
                oldest = min(self._entries, key=lambda k: self._entries[k][0])
                del self._entries[oldest]
            self._entries[key] = (time.monotonic(), value)

    def clear(self):
        with self._lock:
            self._entries.clear()

    def __len__(self):
        return len(self._entries)
