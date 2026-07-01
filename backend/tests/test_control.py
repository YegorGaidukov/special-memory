from backend.control import Controller, DriveCode, parse_control_state, parse_place


class TestParseControlState:
    def test_clamps_axes(self):
        s = parse_control_state({"move": {"x": 5, "y": -9}, "look": {"x": -2, "y": 0.5}})
        assert s["move"] == {"x": 1.0, "y": -1.0}
        assert s["look"] == {"x": -1.0, "y": 0.5}

    def test_defaults_missing_axes_to_zero(self):
        assert parse_control_state({}) == {"move": {"x": 0.0, "y": 0.0}, "look": {"x": 0.0, "y": 0.0}}

    def test_rejects_bool_and_nan(self):
        s = parse_control_state({"move": {"x": True, "y": float("nan")}})
        assert s["move"] == {"x": 0.0, "y": 0.0}

    def test_keeps_jump_string(self):
        assert parse_control_state({"jump": "random"})["jump"] == "random"
        assert parse_control_state({"jump": "  mem-01 "})["jump"] == "mem-01"

    def test_drops_invalid_jump(self):
        assert "jump" not in parse_control_state({"jump": ""})
        assert "jump" not in parse_control_state({"jump": 5})

    def test_non_dict_is_zero(self):
        assert parse_control_state(None) == {"move": {"x": 0.0, "y": 0.0}, "look": {"x": 0.0, "y": 0.0}}

    def test_keeps_valid_aim(self):
        s = parse_control_state({"aim": {"yaw": 1.2, "pitch": -0.5}})
        assert s["aim"] == {"yaw": 1.2, "pitch": -0.5}

    def test_aim_omitted_when_absent(self):
        assert "aim" not in parse_control_state({"move": {"x": 0, "y": 0}})

    def test_aim_rejects_bool_and_nan(self):
        # Any non-finite/bool axis makes the whole aim invalid (dropped) — a half-valid
        # absolute orientation would point the camera somewhere bogus.
        assert "aim" not in parse_control_state({"aim": {"yaw": True, "pitch": 0.2}})
        assert "aim" not in parse_control_state({"aim": {"yaw": 0.1, "pitch": float("nan")}})
        assert "aim" not in parse_control_state({"aim": {"yaw": float("inf"), "pitch": 0.0}})
        assert "aim" not in parse_control_state({"aim": "nope"})

    def test_aim_wraps_yaw_to_pi(self):
        # Yaw is an angle: 3π wraps to π (within float tolerance).
        import math

        s = parse_control_state({"aim": {"yaw": 3 * math.pi, "pitch": 0}})
        assert abs(s["aim"]["yaw"] - math.pi) < 1e-9 or abs(s["aim"]["yaw"] + math.pi) < 1e-9

    def test_aim_clamps_pitch(self):
        assert parse_control_state({"aim": {"yaw": 0, "pitch": 5}})["aim"]["pitch"] == 1.45
        assert parse_control_state({"aim": {"yaw": 0, "pitch": -5}})["aim"]["pitch"] == -1.45

    def test_keeps_valid_filter(self):
        assert parse_control_state({"filter": {"from": 2012, "to": 2026}})["filter"] == {
            "from": 2012.0,
            "to": 2026.0,
        }

    def test_normalizes_reversed_filter(self):
        # from/to are normalised so from <= to.
        assert parse_control_state({"filter": {"from": 2026, "to": 2012}})["filter"] == {
            "from": 2012.0,
            "to": 2026.0,
        }

    def test_drops_invalid_filter(self):
        assert "filter" not in parse_control_state({"filter": {"from": 2012}})
        assert "filter" not in parse_control_state({"filter": {"from": float("nan"), "to": 2026}})
        assert "filter" not in parse_control_state({"filter": "nope"})
        assert "filter" not in parse_control_state({})

    def test_keeps_recenter_flag(self):
        assert parse_control_state({"recenter": True})["recenter"] is True

    def test_drops_falsey_recenter(self):
        assert "recenter" not in parse_control_state({"recenter": False})
        assert "recenter" not in parse_control_state({})

    def test_set_state_stores_aim(self):
        c = Controller()
        c.set_state("a", {"aim": {"yaw": 0.3, "pitch": 0.1}}, now=0)
        assert c.state()["aim"] == {"yaw": 0.3, "pitch": 0.1}

    def test_set_state_clears_stale_aim_on_stick(self):
        # Switching back to the rate stick (no aim) must drop the absolute orientation
        # so the projector leaves magic-window mode.
        c = Controller()
        c.set_state("a", {"aim": {"yaw": 0.3, "pitch": 0.1}}, now=0)
        c.set_state("a", {"move": {"x": 0.2, "y": 0}}, now=1)
        assert c.state().get("aim") is None


class TestController:
    def test_request_grants_when_free(self):
        c = Controller()
        assert c.request("a", now=0) is True
        assert c.current_driver(now=0) == "a"

    def test_request_denies_second_client(self):
        c = Controller()
        c.request("a", now=0)
        assert c.request("b", now=0) is False
        assert c.current_driver(now=0) == "a"

    def test_same_driver_can_re_request(self):
        c = Controller()
        c.request("a", now=0)
        assert c.request("a", now=1) is True

    def test_release_by_driver_frees(self):
        c = Controller()
        c.request("a", now=0)
        assert c.release("a") is True
        assert c.current_driver(now=0) is None

    def test_release_by_non_driver_noop(self):
        c = Controller()
        c.request("a", now=0)
        assert c.release("b") is False
        assert c.current_driver(now=0) == "a"

    def test_set_state_auto_claims_when_free(self):
        c = Controller()
        assert c.set_state("a", {"move": {"x": 0.5, "y": 0}}, now=0) is True
        assert c.current_driver(now=0) == "a"
        assert c.state()["move"]["x"] == 0.5

    def test_set_state_denied_for_non_driver(self):
        c = Controller()
        c.request("a", now=0)
        assert c.set_state("b", {"move": {"x": 1, "y": 0}}, now=1) is False
        assert c.state()["move"]["x"] == 0  # unchanged

    def test_idle_timeout_frees_driver(self):
        c = Controller(idle_timeout=8)
        c.request("a", now=0)
        c.set_state("a", {"move": {"x": 1, "y": 0}}, now=1)
        # After > idle_timeout since last input, the driver is released.
        assert c.current_driver(now=10) is None
        # ...so another client can claim it.
        assert c.request("b", now=10) is True

    def test_active_driver_not_expired_within_timeout(self):
        c = Controller(idle_timeout=8)
        c.set_state("a", {"move": {"x": 1, "y": 0}}, now=0)
        c.set_state("a", {"move": {"x": 0.2, "y": 0}}, now=5)
        assert c.current_driver(now=7) == "a"


class TestDriveCode:
    def test_current_is_stable_within_an_epoch(self):
        dc = DriveCode(rotate_s=60)
        c = dc.current(now=0)
        assert dc.current(now=30) == c  # same epoch -> same code
        assert len(c) == 4 and c.isdigit()

    def test_code_rotates_on_new_epoch(self):
        # Codes are random; retry a few epochs to avoid a 1/10000 same-code fluke.
        dc = DriveCode(rotate_s=60)
        first = dc.current(now=0)
        assert any(dc.current(now=60 * (i + 1)) != first for i in range(5))

    def test_current_code_is_valid(self):
        dc = DriveCode(rotate_s=60)
        c = dc.current(now=10)
        assert dc.valid(c, now=10) is True

    def test_previous_code_still_accepted_after_one_rotation(self):
        dc = DriveCode(rotate_s=60)
        old = dc.current(now=0)
        dc.current(now=60)  # rotate once (old becomes "previous")
        assert dc.valid(old, now=70) is True

    def test_code_rejected_after_two_rotations(self):
        dc = DriveCode(rotate_s=60)
        old = dc.current(now=0)
        dc.current(now=120)  # jumped two epochs -> overlap dropped
        assert dc.valid(old, now=120) is False

    def test_rejects_missing_or_non_string(self):
        dc = DriveCode(rotate_s=60)
        dc.current(now=0)
        assert dc.valid(None, now=0) is False
        assert dc.valid("", now=0) is False
        assert dc.valid(1234, now=0) is False
        assert dc.valid("0000nope", now=0) is False


class TestPresenceGatedController:
    def _gated(self):
        c = Controller(idle_timeout=8, presence=DriveCode(rotate_s=60))
        return c, c.presence.current(now=0)

    def test_claim_requires_valid_code(self):
        c, _ = self._gated()
        assert c.request("a", now=0) is False  # no code
        assert c.request("a", now=0, code="9999x") is False  # wrong code
        assert c.current_driver(now=0) is None

    def test_valid_code_claims(self):
        c, code = self._gated()
        assert c.request("a", now=0, code=code) is True
        assert c.current_driver(now=0) == "a"

    def test_valid_code_preempts_current_driver(self):
        c, code = self._gated()
        c.request("a", now=0, code=code)
        # A present phone B submits the current code and takes over instantly.
        assert c.request("b", now=1, code=code) is True
        assert c.current_driver(now=1) == "b"

    def test_preemption_clears_previous_driver_vector(self):
        c, code = self._gated()
        c.request("a", now=0, code=code)
        c.set_state("a", {"move": {"x": 1, "y": 0}}, now=0)
        c.request("b", now=1, code=code)  # takeover zeroes the held vector
        assert c.state()["move"] == {"x": 0.0, "y": 0.0}

    def test_set_state_does_not_auto_claim(self):
        c, _ = self._gated()
        # Streaming state without a granted code cannot grab a free token.
        assert c.set_state("a", {"move": {"x": 1, "y": 0}}, now=0) is False
        assert c.current_driver(now=0) is None

    def test_preempted_phone_cannot_regrab_by_streaming(self):
        c, code = self._gated()
        c.request("a", now=0, code=code)
        c.request("b", now=1, code=code)  # b preempts
        # a keeps streaming but is no longer the driver and can't reclaim the token.
        assert c.set_state("a", {"move": {"x": 1, "y": 0}}, now=2) is False
        assert c.current_driver(now=2) == "b"

    def test_idle_timeout_still_frees(self):
        c, code = self._gated()
        c.request("a", now=0, code=code)
        assert c.current_driver(now=20) is None  # > idle_timeout, no input

    def test_release_still_works(self):
        c, code = self._gated()
        c.request("a", now=0, code=code)
        assert c.release("a") is True
        assert c.current_driver(now=0) is None


class TestParsePlace:
    def test_keeps_valid_move(self):
        assert parse_place({"id": " mem-01 ", "x": 12.5, "z": -3}) == {
            "id": "mem-01",
            "x": 12.5,
            "z": -3.0,
        }

    def test_drops_empty_or_non_string_id(self):
        assert parse_place({"id": "", "x": 1, "z": 2}) is None
        assert parse_place({"id": 5, "x": 1, "z": 2}) is None
        assert parse_place({"x": 1, "z": 2}) is None

    def test_drops_non_finite_coords(self):
        assert parse_place({"id": "m", "x": float("nan"), "z": 0}) is None
        assert parse_place({"id": "m", "x": 0, "z": float("inf")}) is None
        assert parse_place({"id": "m", "x": True, "z": 0}) is None
        assert parse_place({"id": "m", "z": 0}) is None

    def test_non_dict_is_none(self):
        assert parse_place(None) is None
        assert parse_place([1, 2, 3]) is None
