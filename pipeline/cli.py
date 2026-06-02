import argparse
from pathlib import Path

from pipeline.sharp_runner import run_sharp
from pipeline.thumbnails import make_thumbnail
from pipeline.manifest import build_records, write_manifest, IMAGE_EXTS


def reconstruct(input_dir, output_dir, max_thumb=512, runner=run_sharp, sharp_args=None):
    """image dir -> splats + thumbnails + manifest.json. Returns the records list."""
    input_dir, output_dir = Path(input_dir), Path(output_dir)
    splat_dir = output_dir / "splats"
    thumb_dir = output_dir / "thumbs"
    splat_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    runner(input_dir, splat_dir, extra_args=sharp_args)

    for img in sorted(input_dir.iterdir()):
        if img.suffix.lower() in IMAGE_EXTS:
            make_thumbnail(img, thumb_dir, max_thumb)

    records = build_records(input_dir, splat_dir, thumb_dir)
    write_manifest(records, output_dir / "manifest.json")
    return records


def main(argv=None):
    parser = argparse.ArgumentParser(prog="pipeline", description="SHARP reconstruction pipeline")
    parser.add_argument("-i", "--input", required=True, help="folder of input images")
    parser.add_argument("-o", "--output", required=True, help="output folder")
    parser.add_argument("--max-thumb", type=int, default=512, help="max thumbnail dimension")
    parser.add_argument(
        "--sharp-arg", action="append", dest="sharp_args", default=None,
        help="extra flag passed through to `sharp predict` (repeatable)",
    )
    args = parser.parse_args(argv)
    records = reconstruct(args.input, args.output, args.max_thumb, sharp_args=args.sharp_args)
    ready = sum(1 for r in records if r["status"] == "ready")
    print(f"Done: {ready}/{len(records)} memories reconstructed -> {args.output}/manifest.json")


if __name__ == "__main__":
    main()
