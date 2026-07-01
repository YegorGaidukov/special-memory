"""Single-driver joystick control — the pure core of the real-time link.

One phone "drives" the projected view at a time; others wait. The driver holds a
token until it releases or goes idle (no input for ``idle_timeout`` seconds). The
clock is injected (``now`` passed in) so this is fully unit-tested without sockets or
real time. The WebSocket plumbing (connections, broadcast) lives in :mod:`backend.app`.
"""
from __future__ import annotations

import math
import random
from typing import Optional

# Absolute "magic window" look: phone reports its orientation as yaw (wrapped to
# [-pi, pi]) + pitch (clamped to PITCH_LIMIT, matching the projector's pole guard).
PITCH_LIMIT = 1.45


def _zero_state() -> dict:
    return {"move": {"x": 0.0, "y": 0.0}, "look": {"x": 0.0, "y": 0.0}}


def _clamp(v, lo: float = -1.0, hi: float = 1.0) -> float:
    if not _finite(v):  # reject bool/NaN/inf
        return 0.0
    return max(lo, min(hi, float(v)))


def _finite(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _clamp_axis(raw) -> dict:
    if not isinstance(raw, dict):
        return {"x": 0.0, "y": 0.0}
    return {"x": _clamp(raw.get("x", 0)), "y": _clamp(raw.get("y", 0))}


def _wrap_pi(a: float) -> float:
    """Wrap an angle into [-pi, pi] (exact no-op when already in range)."""
    if -math.pi <= a <= math.pi:
        return a
    return (a + math.pi) % (2 * math.pi) - math.pi


def _parse_aim(raw):
    """Validate an absolute orientation ``{yaw, pitch}`` (radians). Both axes must be
    finite numbers or the whole aim is dropped — a half-valid orientation would point
    the camera somewhere bogus. yaw is wrapped to [-pi, pi]; pitch clamped to PITCH_LIMIT.
    """
    if not isinstance(raw, dict) or not _finite(raw.get("yaw")) or not _finite(raw.get("pitch")):
        return None
    pitch = max(-PITCH_LIMIT, min(PITCH_LIMIT, float(raw["pitch"])))
    return {"yaw": _wrap_pi(float(raw["yaw"])), "pitch": pitch}


def _parse_filter(raw):
    """Validate a timeline year-range ``{from, to}`` (numbers). Both bounds must be
    finite or the whole filter is dropped. Reversed bounds are normalised so
    ``from <= to``. Broadcast to the projector to show/hide memories by capture year."""
    if not isinstance(raw, dict) or not _finite(raw.get("from")) or not _finite(raw.get("to")):
        return None
    lo, hi = float(raw["from"]), float(raw["to"])
    if lo > hi:
        lo, hi = hi, lo
    return {"from": lo, "to": hi}


def parse_place(raw):
    """Validate a memory-move event ``{id, x, z}`` (id a non-empty string, x/z
    finite numbers). Returns ``{"id", "x", "z"}`` or ``None`` if anything is
    missing/invalid — a half-valid move would drop the memory at a bogus ground
    position. Handled as a standalone event, independent of the drive token."""
    if not isinstance(raw, dict):
        return None
    mid = raw.get("id")
    if not isinstance(mid, str) or not mid.strip():
        return None
    if not _finite(raw.get("x")) or not _finite(raw.get("z")):
        return None
    return {"id": mid.strip(), "x": float(raw["x"]), "z": float(raw["z"])}


def parse_control_state(raw) -> dict:
    """Validate an untrusted control message into ``{move, look, aim?, jump?, recenter?, filter?}``.

    move/look axes are clamped to [-1, 1] (missing -> 0). ``aim`` (absolute orientation)
    is kept only when both axes are finite. ``jump`` is kept only when it's a non-empty
    string (``"random"`` or a memory id). ``recenter`` is kept only when truthy. ``filter``
    (a timeline year-range) is kept only when both bounds are finite. Each optional field
    is omitted when absent/invalid.
    """
    if not isinstance(raw, dict):
        return _zero_state()
    state = {"move": _clamp_axis(raw.get("move")), "look": _clamp_axis(raw.get("look"))}
    aim = _parse_aim(raw.get("aim"))
    if aim is not None:
        state["aim"] = aim
    jump = raw.get("jump")
    if isinstance(jump, str) and jump.strip():
        state["jump"] = jump.strip()
    if raw.get("recenter") is True:
        state["recenter"] = True
    filt = _parse_filter(raw.get("filter"))
    if filt is not None:
        state["filter"] = filt
    return state


class DriveCode:
    """A short "you're in the room" presence code shown on the projector.

    The code rotates every ``rotate_s`` seconds; a phone must submit the current (or
    just-previous) code to take control, proving it can read the projected screen — a
    visitor who left the venue can't, so they can't drive. Rotation is *lazy*: the code
    is keyed to a monotonic-clock epoch (``now // rotate_s``) and regenerated when the
    epoch advances, mirroring :meth:`Controller._expire` — no background timer needed to
    keep the pure core valid. The previous epoch's code stays accepted (a one-epoch
    overlap) so a rotation mid-entry never rejects a present visitor. The clock is
    injected (``now`` passed in) so this is fully unit-tested without real time.
    """

    def __init__(self, rotate_s: float = 60.0, *, digits: int = 4):
        self.rotate_s = rotate_s
        self.digits = digits
        self._rng = random.Random()
        self._epoch: Optional[int] = None
        self._current: Optional[str] = None
        self._previous: Optional[str] = None

    def _mint(self) -> str:
        return f"{self._rng.randrange(10 ** self.digits):0{self.digits}d}"

    def _roll(self, now: float) -> None:
        epoch = int(now // self.rotate_s)
        if self._epoch is None:
            self._epoch, self._current, self._previous = epoch, self._mint(), None
        elif epoch != self._epoch:
            # Only the immediately-preceding epoch's code stays valid; jumping more than
            # one epoch (idle projector) drops the overlap entirely.
            self._previous = self._current if epoch == self._epoch + 1 else None
            self._epoch, self._current = epoch, self._mint()

    def current(self, now: float) -> str:
        """The code to show on the projector right now (rotating it if the epoch turned)."""
        self._roll(now)
        assert self._current is not None
        return self._current

    def valid(self, code, now: float) -> bool:
        """True if ``code`` matches the current or just-previous code (a present visitor)."""
        if not isinstance(code, str) or not code:
            return False
        self._roll(now)
        return code == self._current or (self._previous is not None and code == self._previous)


class Controller:
    """The single-driver token + latest move/look state. Not thread-safe; intended to
    run inside one uvicorn worker's event loop (mutations are synchronous).

    With a :class:`DriveCode` ``presence`` gate, a claim requires the current projector
    code and *preempts* whoever holds the token (latest present visitor wins), and
    ``set_state`` no longer auto-claims — so a phone that lost control (or left the
    venue) can't silently re-grab a free token by streaming. Without ``presence`` the
    legacy first-come-wins behaviour is kept (for a display-less dev box)."""

    def __init__(self, idle_timeout: float = 8.0, presence: Optional[DriveCode] = None):
        self.idle_timeout = idle_timeout
        self.presence = presence
        self._driver: Optional[str] = None
        self._last_input: float = 0.0
        self._state: dict = _zero_state()

    def _expire(self, now: float) -> None:
        if self._driver is not None and now - self._last_input > self.idle_timeout:
            self._driver = None
            self._state = _zero_state()

    def request(self, client_id: str, now: float, code=None) -> bool:
        """Claim control. With a presence gate, a valid ``code`` *preempts* the current
        driver (latest present visitor wins); a bad/absent code is refused. Without a
        gate: claim if free (or already held by this client), else False."""
        self._expire(now)
        if self.presence is not None:
            if not self.presence.valid(code, now):
                return False
            if self._driver != client_id:
                # Taking over from someone else: clear their held vector so the view
                # doesn't keep drifting on the previous driver's last input.
                self._state = _zero_state()
            self._driver = client_id
            self._last_input = now
            return True
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
        """Update move/look. Without a presence gate, auto-claims control when free.
        With a gate, only the current driver may push (you must ``request`` a code
        first) — this is what makes preemption stick. False if not the driver.
        ``jump`` (an event) is not stored here."""
        self._expire(now)
        if self.presence is None and self._driver is None:
            self._driver = client_id
        if self._driver != client_id:
            return False
        self._last_input = now
        # ``aim`` is always set (None when the driver is on the rate stick) so switching
        # back from gyro clears the stale absolute orientation on the next broadcast.
        self._state = {"move": state.get("move", {"x": 0.0, "y": 0.0}),
                       "look": state.get("look", {"x": 0.0, "y": 0.0}),
                       "aim": state.get("aim")}
        return True

    def current_driver(self, now: float) -> Optional[str]:
        self._expire(now)
        return self._driver

    def state(self) -> dict:
        return self._state
