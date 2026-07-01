"""WebSocket joystick integration (TestClient): newest-grab-wins relay to displays."""
import pytest
from fastapi.testclient import TestClient

from backend import app as app_module
from backend.control import Controller


@pytest.fixture
def client(monkeypatch):
    # Fresh controller + display set per test (module singletons otherwise persist).
    monkeypatch.setattr(app_module, "_controller", Controller(idle_timeout=8.0))
    monkeypatch.setattr(app_module, "_displays", set())
    monkeypatch.setattr(app_module.config, "DRIVE_PRESENCE_CIDRS", [])  # gating off
    return TestClient(app_module.app)


def test_state_relays_to_display(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        snap = disp.receive_json()
        assert snap["type"] == "control"
        assert snap["driver"] is False

        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json({"type": "request"})
            assert ctl.receive_json() == {"type": "status", "driving": True}
            disp.receive_json()  # control broadcast on the successful claim

            ctl.send_json({"type": "state", "move": {"x": 1, "y": 0}, "look": {"x": 0, "y": 0}})
            assert ctl.receive_json() == {"type": "status", "driving": True}
            msg = disp.receive_json()
            assert msg["type"] == "control"
            assert msg["move"]["x"] == 1.0
            assert msg["driver"] is True


def test_newest_controller_preempts(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as a:
            a.send_json({"type": "request"})
            assert a.receive_json()["driving"] is True
            disp.receive_json()  # control (a driving)
            # A newer phone requests and takes over (walk-up handoff).
            with client.websocket_connect("/ws/control?role=controller&clientId=b") as b:
                b.send_json({"type": "request"})
                assert b.receive_json()["driving"] is True
                disp.receive_json()  # control (b driving)
                # a's streaming is now refused — it was preempted.
                a.send_json({"type": "state", "move": {"x": 1, "y": 0}, "look": {"x": 0, "y": 0}})
                assert a.receive_json()["driving"] is False


def test_remote_phone_refused_when_gated(client, monkeypatch):
    # With an allowlist set, the TestClient's non-IP host falls outside it -> "remote".
    monkeypatch.setattr(app_module.config, "DRIVE_PRESENCE_CIDRS", ["192.168.1.0/24"])
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json({"type": "request"})
            assert ctl.receive_json() == {"type": "status", "driving": False, "reason": "remote"}


def test_jump_from_non_driver_is_broadcast(client):
    # Explore's "tap a name to travel" sends a jump WITHOUT holding the driver token —
    # a one-shot view command, not driving — so it must broadcast even when not driving.
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json({"type": "state", "move": {"x": 0, "y": 0}, "look": {"x": 0, "y": 0}, "jump": "random"})
            assert ctl.receive_json() == {"type": "status", "driving": False}  # not the driver
            assert disp.receive_json() == {"type": "jump", "target": "random"}  # ...but jump still fires


def test_filter_from_non_driver_is_broadcast(client):
    # The timeline filter is a shared-view command too — works without driving.
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json(
                {"type": "state", "move": {"x": 0, "y": 0}, "look": {"x": 0, "y": 0},
                 "filter": {"from": 2012, "to": 2026}}
            )
            assert ctl.receive_json() == {"type": "status", "driving": False}
            assert disp.receive_json() == {"type": "filter", "from": 2012.0, "to": 2026.0}


def test_release_zeroes_and_frees(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as a:
            a.send_json({"type": "request"})
            a.receive_json()  # status
            disp.receive_json()  # control on claim
            a.send_json({"type": "state", "move": {"x": 1, "y": 1}, "look": {"x": 0, "y": 0}})
            a.receive_json()
            disp.receive_json()  # control with movement
            a.send_json({"type": "release"})
            assert a.receive_json()["driving"] is False
            zeroed = disp.receive_json()
            assert zeroed["move"] == {"x": 0.0, "y": 0.0}
            assert zeroed["driver"] is False
        # after a releases, b can drive
        with client.websocket_connect("/ws/control?role=controller&clientId=b") as b:
            b.send_json({"type": "request"})
            assert b.receive_json()["driving"] is True
