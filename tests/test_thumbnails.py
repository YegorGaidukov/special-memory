from pathlib import Path
from PIL import Image
from pipeline.thumbnails import make_thumbnail


def test_make_thumbnail_downscales_and_saves(tmp_path):
    src = tmp_path / "photo.png"
    Image.new("RGB", (2000, 1000), color=(120, 30, 200)).save(src)
    out_dir = tmp_path / "thumbs"

    result = make_thumbnail(src, out_dir, max_size=512)

    assert result == out_dir / "photo.jpg"
    assert result.exists()
    w, h = Image.open(result).size
    assert max(w, h) <= 512
    assert (w, h) == (512, 256)  # aspect ratio preserved
