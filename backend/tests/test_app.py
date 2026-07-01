"""FastAPI route integration tests (TestClient). Reconstruction is stubbed so no
GPU/Node runs; the routes + store/manifest wiring are exercised end-to-end."""
import json

import pytest
from fastapi.testclient import TestClient

from backend import app as app_module
from backend import config, services


@pytest.fixture
def client(tmp_path, monkeypatch):
    public = tmp_path / "public"
    public.mkdir()
    monkeypatch.setattr(config, "PUBLIC_MEMORIES_DIR", public)
    monkeypatch.setattr(config, "STORE_PATH", tmp_path / "data" / "memories.json")
    monkeypatch.setattr(config, "UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr(config, "RECON_INBOX", tmp_path / "inbox")
    # Stub the inline reconstruction (background task) so SHARP/Node never run.
    monkeypatch.setattr(services, "process_upload", lambda *a, **k: None)
    return TestClient(app_module.app), public


def test_list_empty(client):
    c, _ = client
    assert c.get("/api/memories").json() == {"records": []}


def test_post_creates_processing_record(client):
    c, _ = client
    r = c.post("/api/memories", files={"photo": ("IMG_1.jpg", b"\xff\xd8\xff", "image/jpeg")})
    assert r.status_code == 201
    rec = r.json()["record"]
    assert rec["status"] == "processing"
    assert rec["splat_url"] == ""
    # listed in the store
    ids = [m["id"] for m in c.get("/api/memories").json()["records"]]
    assert rec["id"] in ids


def test_post_rejects_missing_photo(client):
    c, _ = client
    r = c.post("/api/memories", files={"photo": ("empty.jpg", b"", "image/jpeg")})
    assert r.status_code == 400


def test_get_one_and_404(client):
    c, _ = client
    rec = c.post("/api/memories", files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")}).json()["record"]
    assert c.get(f"/api/memories/{rec['id']}").json()["record"]["id"] == rec["id"]
    assert c.get("/api/memories/nope").status_code == 404


def test_patch_transform_validation_and_store(client):
    c, _ = client
    rec = c.post("/api/memories", files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")}).json()["record"]
    bad = c.patch(f"/api/memories/{rec['id']}/transform", json={"transform": {"position": [0, 0]}})
    assert bad.status_code == 400
    good = c.patch(
        f"/api/memories/{rec['id']}/transform",
        json={"transform": {"position": [1, 2, 3], "quaternion": [0, 0, 0, 1], "scale": 2}},
    )
    assert good.status_code == 200
    assert good.json()["record"]["transform"]["position"] == [1, 2, 3]


def test_patch_transform_404_when_unknown(client):
    c, _ = client
    r = c.patch("/api/memories/ghost/transform", json={"transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": 1}})
    assert r.status_code == 404


def test_fail_marks_failed(client):
    c, _ = client
    rec = c.post("/api/memories", files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")}).json()["record"]
    r = c.post(f"/api/memories/{rec['id']}/fail", json={"error": "boom"})
    assert r.json()["record"]["status"] == "failed"
    assert r.json()["record"]["error"] == "boom"


def test_asset_serving_and_guards(client):
    c, public = client
    (public / "manifest.json").write_text(json.dumps({"city": config.CITY, "memories": []}))
    ok = c.get("/assets/manifest.json")
    assert ok.status_code == 200
    assert ok.json()["city"] == config.CITY
    assert c.get("/assets/nope.sog").status_code == 404
    assert c.get("/assets/..%2f..%2fsecret").status_code in (400, 404)


def test_post_with_audio_saves_and_sets_url(client):
    c, public = client
    r = c.post(
        "/api/memories",
        files={
            "photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg"),
            "audio": ("note.webm", b"OpusOpus", "audio/webm"),
        },
    )
    rec = r.json()["record"]
    assert rec["audio_url"] == f"{rec['id']}.webm"
    assert (public / f"{rec['id']}.webm").read_bytes() == b"OpusOpus"


def test_post_with_name_persists(client):
    c, _ = client
    rec = c.post(
        "/api/memories",
        data={"name": "  The Pier  "},
        files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")},
    ).json()["record"]
    assert rec["name"] == "The Pier"  # trimmed


def test_post_without_name_omits_field(client):
    c, _ = client
    rec = c.post(
        "/api/memories",
        data={"name": "   "},
        files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")},
    ).json()["record"]
    assert "name" not in rec


def test_name_round_trips_through_publish(client):
    c, public = client
    rec = c.post(
        "/api/memories",
        data={"name": "First snow"},
        files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")},
    ).json()["record"]
    (public / f"{rec['id']}.sog").write_bytes(b"sog")
    c.post(f"/api/memories/{rec['id']}/ingest")
    manifest = json.loads((public / "manifest.json").read_text())
    mem = next(m for m in manifest["memories"] if m["id"] == rec["id"])
    assert mem["name"] == "First snow"


def test_post_with_manual_date(client):
    c, _ = client
    r = c.post(
        "/api/memories",
        data={"captured_at": "2026-06-15"},
        files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")},
    )
    assert r.json()["record"]["captured_at"] == "2026-06-15T00:00:00.000Z"


def test_post_scatter_placement_grounds_near_origin(client):
    c, _ = client
    rec = c.post(
        "/api/memories",
        data={"placement": "scatter"},
        files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")},
    ).json()["record"]
    pos = rec["transform"]["position"]
    assert len(pos) == 3 and pos[1] == 0.0
    # empty city -> scattered within empty_radius (40) of origin
    assert (pos[0] ** 2 + pos[2] ** 2) ** 0.5 <= 40 + 1e-6


def test_audio_url_round_trips_through_publish(client):
    c, public = client
    rec = c.post(
        "/api/memories",
        files={
            "photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg"),
            "audio": ("note.webm", b"snd", "audio/webm"),
        },
    ).json()["record"]
    (public / f"{rec['id']}.sog").write_bytes(b"sog")
    c.post(f"/api/memories/{rec['id']}/ingest")
    manifest = json.loads((public / "manifest.json").read_text())
    mem = next(m for m in manifest["memories"] if m["id"] == rec["id"])
    assert mem["audio_url"] == f"{rec['id']}.webm"


def test_ingest_after_assets_present(client):
    c, public = client
    rec = c.post("/api/memories", files={"photo": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")}).json()["record"]
    # No splat yet -> 409
    assert c.post(f"/api/memories/{rec['id']}/ingest").status_code == 409
    (public / f"{rec['id']}.sog").write_bytes(b"sog")
    (public / f"{rec['id']}.jpg").write_bytes(b"jpg")
    out = c.post(f"/api/memories/{rec['id']}/ingest")
    assert out.status_code == 200
    assert out.json()["record"]["status"] == "approved"
    manifest = json.loads((public / "manifest.json").read_text())
    assert [m["id"] for m in manifest["memories"]] == [rec["id"]]
