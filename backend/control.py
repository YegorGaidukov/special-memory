"""Single-driver joystick control — the pure core of the real-time link.

One phone "drives" the projected view at a time; others wait. The driver holds a
token until it releases or goes idle (no input for ``idle_timeout`` seconds). The
clock is injected (``now`` passed in) so this is fully unit-tested without sockets or
real time. The WebSocket plumbing (connections, broadcast) lives in :mod:`backend.app`.
"""
from __future__ import annotations

from typing import Optional


def _zero_state() -> dict:
    return {"move": {"x": 0.0, "y": 0.0}, "look": {"x": 0.0, "y": 0.0}}


def _clamp(v, lo: float = -1.0, hi: float = 1.0) -> float:
    if not isinstance(v, (int, float)) or isinstance(v, bool) or v != v:  # reject bool/NaN
        return 0.0
    return max(lo, min(hi, float(v)))


def _clamp_axis(raw) -> dict:
    if not isinstance(raw, dict):
        return {"x": 0.0, "y": 0.0}
    return {"x": _clamp(raw.get("x", 0)), "y": _clamp(raw.get("y", 0))}


def parse_control_state(raw) -> dict:
    """Validate + clamp an untrusted control message into ``{move, look, jump?}``.

    move/look axes are clamped to [-1, 1] (missing -> 0). ``jump`` is kept only when
    it's a non-empty string (``"random"`` or a memory id); otherwise omitted.
    """
    if not isinstance(raw, dict):
        return _zero_state()
    state = {"move": _clamp_axis(raw.get("move")), "look": _clamp_axis(raw.get("look"))}
    jump = raw.get("jump")
    if isinstance(jump, str) and jump.strip():
        state["jump"] = jump.strip()
    return state


class Controller:
    """The single-driver token + latest move/look state. Not thread-safe; intended to
    run inside one uvicorn worker's event loop (mutations are synchronous)."""

    def __init__(self, idle_timeout: float = 8.0):
        self.idle_timeout = idle_timeout
        self._driver: Optional[str] = None
        self._last_input: float = 0.0
        self._state: dict = _zero_state()

    def _expire(self, now: float) -> None:
        if self._driver is not None and now - self._last_input > self.idle_timeout:
            self._driver = None
            self._state = _zero_state()

    def request(self, client_id: str, now: float) -> bool:
        """Claim control if free (or already held by this client). False if taken."""
        self._expire(now)
        if self._driver is None:
            self._driver = client_id
            self._last_input = now
            return True
        return self._driver == client_id

    def release(self, client_id: str) -> bool:
        """Give up control. False if this client wasn't the driver."""
        if self._driver == client_id:
            self._driver = None
            self._state = _zero_state()
            return True
        return False

    def set_state(self, client_id: str, state: dict, now: float) -> bool:
        """Update move/look. Auto-claims control when free. False if another client
        is currently driving. ``jump`` (an event) is not stored here."""
        self._expire(now)
        if self._driver is None:
            self._driver = client_id
        if self._driver != client_id:
            return False
        self._last_input = now
        self._state = {"move": state.get("move", {"x": 0.0, "y": 0.0}),
                       "look": state.get("look", {"x": 0.0, "y": 0.0})}
        return True

    def current_driver(self, now: float) -> Optional[str]:
        self._expire(now)
        return self._driver

    def state(self) -> dict:
        return self._state
