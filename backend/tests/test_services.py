"""Inline-reconstruction orchestration, with SHARP + convert injected as fakes."""
import json

import pytest

from backend import config, services
from backend.store import add_record, empty_store, find_by_id, save_store


@pytest.fixture
def env(tmp_path, monkeypatch):
    public = tmp_path / "public"
    public.mkdir()
    store_path = tmp_path / "data" / "memories.json"
    inbox = tmp_path / "inbox"
    monkeypatch.setattr(config, "PUBLIC_MEMORIES_DIR", public)
    monkeypatch.setattr(config, "STORE_PATH", store_path)
    monkeypatch.setattr(config, "RECON_INBOX", inbox)
    return tmp_path, public, store_path


def _seed_processing(store_path, record_id):
    store = add_record(empty_store(), {
        "id": record_id,
        "status": "processing",
        "source_image": f"{record_id}.jpg",
        "thumbnail_url": "",
        "splat_url": "",
        "transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
    })
    save_store(store, store_path)


def test_process_upload_reconstructs_and_publishes(env, tmp_path):
    _, public, store_path = env
    record_id = "mem-01"
    _seed_processing(store_path, record_id)
    image = tmp_path / f"{record_id}.jpg"
    image.write_bytes(b"fake")

    def fake_reconstruct(in_dir, out_dir):
        (out_dir / "splats").mkdir(parents=True)
        (out_dir / "splats" / f"{record_id}.ply").write_bytes(b"ply")
        (out_dir / "thumbs").mkdir(parents=True)
        (out_dir / "thumbs" / f"{record_id}.jpg").write_bytes(b"jpg")

    def fake_convert(splats_dir, public_dir):
        (public_dir / f"{record_id}.sog").write_bytes(b"sog")
        (public_dir / f"{record_id}.preview.ply").write_bytes(b"prev")

    services.process_upload(record_id, image, reconstruct=fake_reconstruct, convert=fake_convert)

    store = json.loads(store_path.read_text())
    rec = find_by_id(store, record_id)
    assert rec["status"] == "approved"
    assert rec["splat_url"] == f"{record_id}.sog"
    assert rec["thumbnail_url"] == f"{record_id}.jpg"
    assert (public / f"{record_id}.jpg").exists()

    manifest = json.loads((public / "manifest.json").read_text())
    assert [m["id"] for m in manifest["memories"]] == [record_id]
    assert manifest["city"] == config.CITY


def test_process_upload_marks_failed_on_error(env, tmp_path):
    _, public, store_path = env
    record_id = "mem-bad"
    _seed_processing(store_path, record_id)
    image = tmp_path / f"{record_id}.jpg"
    image.write_bytes(b"fake")

    def boom(in_dir, out_dir):
        raise RuntimeError("sharp exploded")

    services.process_upload(record_id, image, reconstruct=boom, convert=lambda *a: None)

    rec = find_by_id(json.loads(store_path.read_text()), record_id)
    assert rec["status"] == "failed"
    assert "sharp exploded" in rec["error"]
    # input quarantined
    assert (config.RECON_INBOX / "failed" / image.name).exists()
    assert not (public / "manifest.json").exists()


def test_approve_and_publish_returns_none_without_splat(env, tmp_path):
    _, public, store_path = env
    _seed_processing(store_path, "mem-x")
    assert services.approve_and_publish("mem-x") is None
