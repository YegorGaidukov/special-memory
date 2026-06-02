import json
from pathlib import Path
from PIL import Image
from pipeline.manifest import build_records, write_manifest


def _make_img(path):
    Image.new("RGB", (10, 10)).save(path)


def test_build_records_marks_ready_and_failed(tmp_path):
    img_dir = tmp_path / "imgs"; img_dir.mkdir()
    splat_dir = tmp_path / "splats"; splat_dir.mkdir()
    thumb_dir = tmp_path / "thumbs"; thumb_dir.mkdir()

    _make_img(img_dir / "ok.png")
    _make_img(img_dir / "missing.png")
    (img_dir / "notes.txt").write_text("ignore me")
    (splat_dir / "ok.ply").write_text("ply")
    (thumb_dir / "ok.jpg").write_text("jpg")

    records = build_records(img_dir, splat_dir, thumb_dir)

    by_id = {r["id"]: r for r in records}
    assert set(by_id) == {"ok", "missing"}  # .txt ignored
    assert by_id["ok"]["status"] == "ready"
    assert by_id["ok"]["splat_path"].endswith("ok.ply")
    assert by_id["ok"]["thumbnail_path"].endswith("ok.jpg")
    assert by_id["missing"]["status"] == "failed"
    assert by_id["missing"]["splat_path"] is None


def test_write_manifest_roundtrips(tmp_path):
    records = [{"id": "x", "status": "ready"}]
    path = write_manifest(records, tmp_path / "manifest.json")
    assert json.loads(Path(path).read_text()) == records
