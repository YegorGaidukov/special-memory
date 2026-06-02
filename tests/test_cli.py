import json
from pathlib import Path
from PIL import Image
from pipeline.cli import reconstruct


def test_reconstruct_end_to_end_with_fake_runner(tmp_path):
    img_dir = tmp_path / "imgs"; img_dir.mkdir()
    Image.new("RGB", (800, 600)).save(img_dir / "scene1.jpg")
    out_dir = tmp_path / "out"

    def fake_runner(input_dir, splat_dir, **kwargs):
        ply = Path(splat_dir) / "scene1.ply"
        ply.write_text("ply")
        return [ply]

    records = reconstruct(img_dir, out_dir, runner=fake_runner)

    assert (out_dir / "splats" / "scene1.ply").exists()
    assert (out_dir / "thumbs" / "scene1.jpg").exists()
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest == records
    assert records[0]["id"] == "scene1"
    assert records[0]["status"] == "ready"
