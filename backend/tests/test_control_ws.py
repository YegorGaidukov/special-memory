"""WebSocket joystick integration (TestClient): single-driver relay to displays."""
import pytest
from fastapi.testclient import TestClient

from backend import app as app_module
from backend.control import Controller, DriveCode


@pytest.fixture
def client(monkeypatch):
    # Fresh controller + display set per test (module singletons otherwise persist).
    # Legacy (no presence gate) — the pre-existing first-come-wins behaviour.
    monkeypatch.setattr(app_module, "_controller", Controller(idle_timeout=8.0))
    monkeypatch.setattr(app_module, "_displays", set())
    return TestClient(app_module.app)


@pytest.fixture
def gated_client(monkeypatch):
    # A presence-gated controller: the projector shows a rotating drive code and a phone
    # must submit it to take control.
    monkeypatch.setattr(
        app_module, "_controller", Controller(idle_timeout=8.0, presence=DriveCode(rotate_s=60))
    )
    monkeypatch.setattr(app_module, "_displays", set())
    return TestClient(app_module.app)


def test_state_relays_to_display(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        snap = disp.receive_json()
        assert snap["type"] == "control"
        assert snap["driver"] is False

        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json({"type": "state", "move": {"x": 1, "y": 0}, "look": {"x": 0, "y": 0}})
            status = ctl.receive_json()
            assert status == {"type": "status", "driving": True}

            msg = disp.receive_json()
            assert msg["type"] == "control"
            assert msg["move"]["x"] == 1.0
            assert msg["driver"] is True


def test_second_controller_is_denied(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as a:
            a.send_json({"type": "request"})
            assert a.receive_json()["driving"] is True
            with client.websocket_connect("/ws/control?role=controller&clientId=b") as b:
                b.send_json({"type": "request"})
                assert b.receive_json()["driving"] is False


def test_jump_is_broadcast(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json({"type": "state", "move": {"x": 0, "y": 0}, "look": {"x": 0, "y": 0}, "jump": "random"})
            ctl.receive_json()  # status
            control_msg = disp.receive_json()
            jump_msg = disp.receive_json()
            assert control_msg["type"] == "control"
            assert jump_msg == {"type": "jump", "target": "random"}


def test_filter_is_broadcast(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as ctl:
            ctl.send_json(
                {"type": "state", "move": {"x": 0, "y": 0}, "look": {"x": 0, "y": 0},
                 "filter": {"from": 2012, "to": 2026}}
            )
            ctl.receive_json()  # status
            control_msg = disp.receive_json()
            filter_msg = disp.receive_json()
            assert control_msg["type"] == "control"
            assert filter_msg == {"type": "filter", "from": 2012.0, "to": 2026.0}


def test_presence_gate_sends_code_and_refuses_uncoded_claim(gated_client):
    with gated_client.websocket_connect("/ws/control?role=display") as disp:
        assert disp.receive_json()["type"] == "control"  # snapshot
        pres = disp.receive_json()
        assert pres["type"] == "presence"
        code = pres["code"]
        assert isinstance(code, str) and code

        with gated_client.websocket_connect("/ws/control?role=controller&clientId=a") as a:
            a.send_json({"type": "request"})  # no code -> refused
            assert a.receive_json()["driving"] is False
            a.send_json({"type": "request", "code": code})  # current code -> granted
            assert a.receive_json()["driving"] is True
            disp.receive_json()  # control broadcast after the successful claim


def test_present_phone_preempts_with_code(gated_client):
    with gated_client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()  # control snapshot
        code = disp.receive_json()["code"]  # presence
        with gated_client.websocket_connect("/ws/control?role=controller&clientId=a") as a:
            a.send_json({"type": "request", "code": code})
            assert a.receive_json()["driving"] is True
            disp.receive_json()  # control (a driving)
            # A second present phone submits the same on-screen code and takes over.
            with gated_client.websocket_connect("/ws/control?role=controller&clientId=b") as b:
                b.send_json({"type": "request", "code": code})
                assert b.receive_json()["driving"] is True
                disp.receive_json()  # control (b driving)
                # a's streaming no longer affects the view — it's been preempted.
                a.send_json({"type": "state", "move": {"x": 1, "y": 0}, "look": {"x": 0, "y": 0}})
                assert a.receive_json()["driving"] is False


def test_release_zeroes_and_frees(client):
    with client.websocket_connect("/ws/control?role=display") as disp:
        disp.receive_json()
        with client.websocket_connect("/ws/control?role=controller&clientId=a") as a:
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
