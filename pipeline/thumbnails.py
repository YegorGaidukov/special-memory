from pathlib import Path
from PIL import Image


def make_thumbnail(image_path, out_dir, max_size=512):
    """Write a downscaled JPEG thumbnail; return its Path."""
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(image_path).convert("RGB")
    img.thumbnail((max_size, max_size))

    out_path = out_dir / f"{image_path.stem}.jpg"
    img.save(out_path, "JPEG", quality=85)
    return out_path
