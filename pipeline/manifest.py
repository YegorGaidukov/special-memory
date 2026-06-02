import json
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def build_records(input_dir, splat_dir, thumb_dir):
    """One record per input image, matched to outputs by filename stem."""
    input_dir, splat_dir, thumb_dir = Path(input_dir), Path(splat_dir), Path(thumb_dir)
    records = []
    for img in sorted(input_dir.iterdir()):
        if img.suffix.lower() not in IMAGE_EXTS:
            continue
        ply = splat_dir / f"{img.stem}.ply"
        thumb = thumb_dir / f"{img.stem}.jpg"
        ply_ok = ply.exists()
        records.append({
            "id": img.stem,
            "status": "ready" if ply_ok else "failed",
            "source_image": str(img),
            "splat_path": str(ply) if ply_ok else None,
            "thumbnail_path": str(thumb) if thumb.exists() else None,
        })
    return records


def write_manifest(records, path):
    """Write records as pretty JSON; return the path."""
    path = Path(path)
    path.write_text(json.dumps(records, indent=2))
    return path
