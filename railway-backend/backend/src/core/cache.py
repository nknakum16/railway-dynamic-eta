import asyncio
import time
from typing import Any, Dict, Optional, Tuple


class InMemoryTTLCache:
    """Thread-safe / async-friendly In-Memory Cache with TTL expiration."""

    def __init__(self) -> None:
        # Key -> (value, expiry_timestamp)
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        """Retrieve a value from the cache if not expired."""
        async with self._lock:
            if key not in self._cache:
                return None
            value, expires_at = self._cache[key]
            if time.time() > expires_at:
                del self._cache[key]
                return None
            return value

    async def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Store a value with a TTL in seconds."""
        async with self._lock:
            expires_at = time.time() + ttl_seconds
            self._cache[key] = (value, expires_at)

    async def delete(self, key: str) -> bool:
        """Delete an item from cache."""
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    async def clear(self) -> None:
        """Clear all entries."""
        async with self._lock:
            self._cache.clear()

    async def size(self) -> int:
        """Return count of active (non-expired) entries."""
        async with self._lock:
            now = time.time()
            # Clean up expired keys on probe
            expired = [k for k, (_, exp) in self._cache.items() if now > exp]
            for k in expired:
                del self._cache[k]
            return len(self._cache)


cache = InMemoryTTLCache()
