"""In-memory failure limits (login, locker pickup codes).

Kept per process: with several workers each one counts on its own, so the real limit is a multiple of these numbers.
That still turns an online guessing attack from millions of tries into a handful per window.
"""
import time
from threading import Lock


class FailureLimiter:
    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window = window_seconds
        self._fails: dict[str, list[float]] = {}
        self._lock = Lock()

    def _recent(self, key: str, now: float) -> list[float]:
        times = [t for t in self._fails.get(key, []) if now - t < self.window]
        if times:
            self._fails[key] = times
        else:
            self._fails.pop(key, None)
        return times

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= self.max_failures

    def fail(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._fails) > 50_000:  # bound memory under a spray of distinct keys
                for k in list(self._fails):
                    self._recent(k, now)
            self._fails.setdefault(key, []).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._fails.clear()
