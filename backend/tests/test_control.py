from backend.control import Controller, parse_control_state


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
