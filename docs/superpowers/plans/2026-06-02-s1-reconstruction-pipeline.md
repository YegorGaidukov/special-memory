# S1 — Reconstruction Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested Python CLI that turns input photo(s) into web-ready 3D Gaussian splats using Apple SHARP, plus a thumbnail and a JSON manifest per run, so later subsystems (explorer, upload flow) have data to consume.

**Architecture:** A small Python package `pipeline/` wraps the `sharp predict` CLI. The heavy GPU call lives behind a single seam (`sharp_runner.run_sharp`) so all of *our* logic — command construction, thumbnail generation, manifest building, orchestration — is unit-tested fast with the SHARP subprocess mocked. One manual integration step runs the real model on the laptop's NVIDIA GPU to prove quality and pre-generate a sample set for S2/S3.

**Tech Stack:** Python 3.13, Apple SHARP (`sharp` CLI, conda env), Pillow (thumbnails), pytest. Runs on the Windows + NVIDIA laptop (CUDA auto-detected by SHARP); identical code targets the 96 GB server for the show.

---

## Context

This is subsystem **S1** of the Collective Memory City project (full spec:
`docs/superpowers/specs/2026-06-02-collective-memory-city-design.md`). It is the first thing built
because it de-risks everything: if SHARP can't produce acceptable splats from real city photos on
the laptop, the whole concept needs rethinking. S1 ships a standalone CLI and a folder of sample
splats — no web app yet.

**SHARP interface (verified from the repo):**
- Install: `conda create -n sharp python=3.13`, then `pip install -r requirements.txt`.
- Run: `sharp predict -i <input_image_dir> -o <output_dir>` → writes `.ply` files to `<output_dir>`.
- Optional flags: `-c <checkpoint.pt>`, `--render` (video, CUDA only).
- Checkpoint (~1.2 GB) auto-downloads to `~/.cache/torch/hub/checkpoints/` on first run.
- Device is **auto-detected** (uses CUDA when available) — no flag needed on the NVIDIA laptop. The
  spec's "portable laptop↔server" goal is satisfied by auto-detect; an optional `--sharp-arg`
  passthrough (Task 4) lets us force flags later without guessing SHARP's exact device flag now.

## File Structure

All paths relative to repo root `C:\Work\GitHub\special-memory`.

- Create: `pipeline/__init__.py` — marks the package.
- Create: `pipeline/thumbnails.py` — `make_thumbnail()`: downscale an image to a JPEG thumbnail.
- Create: `pipeline/sharp_runner.py` — `build_command()` (pure) + `run_sharp()` (subprocess seam).
- Create: `pipeline/manifest.py` — `build_records()` + `write_manifest()`: map images → splats/thumbs → JSON.
- Create: `pipeline/cli.py` — `reconstruct()` orchestration + argparse `main()`.
- Create: `pipeline/__main__.py` — `from pipeline.cli import main; main()` so `python -m pipeline` works.
- Create: `tests/test_thumbnails.py`, `tests/test_sharp_runner.py`, `tests/test_manifest.py`, `tests/test_cli.py`.
- Create: `requirements-pipeline.txt` — our extra deps (`pillow`, `pytest`).
- Create: `pytest.ini` — point pytest at `tests/`.
- Create: `.gitignore` — ignore `outputs/`, `__pycache__/`, sample data, conda noise.

Each module has one responsibility and is small enough to hold in context. The GPU dependency is
confined to `sharp_runner.run_sharp`; everything else is pure/fast and fully tested.

---

## Task 1: Environment & package skeleton

**Files:**
- Create: `requirements-pipeline.txt`
- Create: `pytest.ini`
- Create: `.gitignore`
- Create: `pipeline/__init__.py`

- [ ] **Step 1: Create the conda env and install SHARP**

In PowerShell (one-time setup; SHARP lives in its own repo/checkout — clone it adjacent, e.g. `C:\Work\GitHub\ml-sharp`):

```powershell
conda create -n sharp python=3.13 -y
conda activate sharp
git clone https://github.com/apple/ml-sharp C:\Work\GitHub\ml-sharp
pip install -r C:\Work\GitHub\ml-sharp\requirements.txt
sharp --help
```

Expected: `sharp --help` prints usage including the `predict` subcommand. Also record the available
flags for later: `sharp predict --help` (note any device flag for future server use).

- [ ] **Step 2: Add our pipeline deps**

Create `requirements-pipeline.txt`:

```text
pillow>=10.0
pytest>=8.0
```

Install into the same env:

```powershell
conda activate sharp
pip install -r requirements-pipeline.txt
```

- [ ] **Step 3: Create pytest config**

Create `pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
```

- [ ] **Step 4: Create .gitignore**

Create `.gitignore`:

```gitignore
__pycache__/
*.pyc
outputs/
samples/
.pytest_cache/
*.ply
*.ksplat
```

- [ ] **Step 5: Create the package marker**

Create `pipeline/__init__.py`:

```python
"""Collective Memory City — S1 reconstruction pipeline."""
```

- [ ] **Step 6: Verify pytest runs (no tests yet)**

Run: `conda activate sharp; pytest`
Expected: exits 0 with "no tests ran" (collected 0 items).

- [ ] **Step 7: Commit**

```powershell
git add requirements-pipeline.txt pytest.ini .gitignore pipeline/__init__.py
git commit -m "chore: scaffold S1 reconstruction pipeline package"
```

---

## Task 2: Thumbnail generation

**Files:**
- Create: `pipeline/thumbnails.py`
- Test: `tests/test_thumbnails.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_thumbnails.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_thumbnails.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.thumbnails'`.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/thumbnails.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_thumbnails.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pipeline/thumbnails.py tests/test_thumbnails.py
git commit -m "feat: add thumbnail generation"
```

---

## Task 3: SHARP command construction & runner seam

**Files:**
- Create: `pipeline/sharp_runner.py`
- Test: `tests/test_sharp_runner.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_sharp_runner.py`:

```python
from pathlib import Path
from pipeline import sharp_runner


def test_build_command_basic():
    cmd = sharp_runner.build_command("in_dir", "out_dir")
    assert cmd == ["sharp", "predict", "-i", "in_dir", "-o", "out_dir"]


def test_build_command_with_checkpoint_and_extra():
    cmd = sharp_runner.build_command(
        "in_dir", "out_dir", checkpoint="ckpt.pt", extra_args=["--foo", "bar"]
    )
    assert cmd == [
        "sharp", "predict", "-i", "in_dir", "-o", "out_dir",
        "-c", "ckpt.pt", "--foo", "bar",
    ]


def test_run_sharp_invokes_subprocess_and_returns_ply(tmp_path, monkeypatch):
    out_dir = tmp_path / "out"
    calls = {}

    def fake_run(cmd, check):
        calls["cmd"] = cmd
        calls["check"] = check
        # simulate SHARP writing one .ply
        (out_dir / "a.ply").write_text("ply")

    monkeypatch.setattr(sharp_runner.subprocess, "run", fake_run)

    result = sharp_runner.run_sharp(tmp_path / "imgs", out_dir)

    assert calls["check"] is True
    assert calls["cmd"][:2] == ["sharp", "predict"]
    assert result == [out_dir / "a.ply"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_sharp_runner.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.sharp_runner'`.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/sharp_runner.py`:

```python
import subprocess
from pathlib import Path


def build_command(input_dir, output_dir, checkpoint=None, render=False, extra_args=None):
    """Build the `sharp predict` argv list."""
    cmd = ["sharp", "predict", "-i", str(input_dir), "-o", str(output_dir)]
    if checkpoint:
        cmd += ["-c", str(checkpoint)]
    if render:
        cmd += ["--render"]
    if extra_args:
        cmd += list(extra_args)
    return cmd


def run_sharp(input_dir, output_dir, checkpoint=None, render=False, extra_args=None):
    """Run SHARP on a folder of images; return sorted list of produced .ply paths."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = build_command(input_dir, output_dir, checkpoint, render, extra_args)
    subprocess.run(cmd, check=True)
    return sorted(output_dir.glob("*.ply"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_sharp_runner.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
git add pipeline/sharp_runner.py tests/test_sharp_runner.py
git commit -m "feat: add SHARP command builder and runner seam"
```

---

## Task 4: Manifest builder

**Files:**
- Create: `pipeline/manifest.py`
- Test: `tests/test_manifest.py`

The manifest is a JSON list of memory records — the contract S2/S3 consume. Records match input
images to outputs by filename stem. Fields mirror the spec's data model (geo/transform are added
later by S3; here we emit reconstruction-time fields only).

- [ ] **Step 1: Write the failing test**

Create `tests/test_manifest.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_manifest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.manifest'`.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/manifest.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_manifest.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add pipeline/manifest.py tests/test_manifest.py
git commit -m "feat: add reconstruction manifest builder"
```

---

## Task 5: CLI orchestration

**Files:**
- Create: `pipeline/cli.py`
- Create: `pipeline/__main__.py`
- Test: `tests/test_cli.py`

`reconstruct()` ties the pieces together and accepts an injectable `runner` so the test runs without
a GPU (the fake runner writes dummy `.ply` files). The argparse `main()` wires the real runner.

- [ ] **Step 1: Write the failing test**

Create `tests/test_cli.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.cli'`.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/cli.py`:

```python
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
```

Create `pipeline/__main__.py`:

```python
from pipeline.cli import main

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_cli.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `pytest -v`
Expected: all tests across the four test files PASS.

- [ ] **Step 6: Commit**

```powershell
git add pipeline/cli.py pipeline/__main__.py tests/test_cli.py
git commit -m "feat: add reconstruction CLI orchestration"
```

---

## Task 6: Real-model integration smoke test (manual verify)

This is the actual de-risking step — it needs the GPU and the real model, so it is a manual
verification, not a fast unit test.

**Files:**
- Create: `samples/input/` (5–10 real city photos — outdoor, decent lighting, single clear subject)

- [ ] **Step 1: Gather sample photos**

Put 5–10 real photos of the chosen city into `samples/input/` (jpg/png). Prefer outdoor street
scenes with depth; avoid heavy motion blur.

- [ ] **Step 2: Run the real pipeline**

```powershell
conda activate sharp
python -m pipeline -i samples\input -o samples\output
```

Expected: first run downloads the ~1.2 GB checkpoint, then prints
`Done: N/N memories reconstructed -> samples\output/manifest.json`. Note wall-clock time per image.

- [ ] **Step 3: Inspect outputs**

Confirm `samples\output\splats\*.ply`, `samples\output\thumbs\*.jpg`, and `manifest.json` exist and
that `manifest.json` marks reconstructed images as `"status": "ready"`. Record each `.ply` file size.

- [ ] **Step 4: Eyeball splat quality**

Open one or two `.ply` files in a public viewer to judge quality, e.g. drag-drop into
<https://playcanvas.com/supersplat/editor> or <https://antimatter15.com/splat/>. Confirm the scene
is recognizably the photo with believable parallax when orbiting; note where geometry thins past the
original viewpoint (expected — this is the "dreamlike edges" the design embraces).

- [ ] **Step 5: Record findings and keep the sample set**

Write a short note in the PR/commit message: per-image time, file sizes, and a one-line quality
verdict. These sample splats become the fixtures for S2 (explorer). Keep them outside git (already
in `.gitignore`); back them up locally.

- [ ] **Step 6: Commit the sample input list / notes (optional)**

If you want the input filenames tracked (not the binaries), commit a `samples/README.md` listing the
photos and the recorded metrics:

```powershell
git add samples/README.md
git commit -m "docs: record S1 smoke-test sample set and metrics"
```

---

## Self-Review

**Spec coverage (S1 portion of the spec):**
- "image → memory.ply (metric-scaled)" → Tasks 3 + 6 (real run). ✓
- "downscaled thumbnail" → Task 2. ✓
- "device-agnostic / `--device` flag" → satisfied by SHARP auto-detect; `--sharp-arg` passthrough
  (Task 5) covers forcing flags later. Documented in Context. ✓
- "manual/CLI trigger acceptable" → Task 5 CLI. ✓
- "pre-generate a small set of splats for S2/S3" → Task 6. ✓
- "verify on 5–10 real photos; note time + file size" → Task 6 Steps 2–5. ✓
- `.ply`→`.ksplat` is marked OPTIONAL in the spec and deferred (Node tool lives in the S2 explorer
  repo) — intentionally out of S1 scope.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected
output. ✓

**Type/name consistency:** `make_thumbnail`, `build_command`, `run_sharp`, `build_records`,
`write_manifest`, `reconstruct`, `IMAGE_EXTS` are defined once and referenced with identical names
across tasks. The `runner` injected in Task 5's test matches `run_sharp`'s signature
(`input_dir, splat_dir, **kwargs`). Manifest record keys (`id`, `status`, `splat_path`,
`thumbnail_path`, `source_image`) are consistent between Task 4 and Task 5. ✓

## Notes / open items
- Confirm SHARP's actual `.ply` filename convention matches the input stem during Task 6; if SHARP
  names outputs differently, adjust the stem-matching in `manifest.py` (single-line change) and its
  test. This is the one external assumption flagged for early verification.
- Which specific city to photograph for samples is still open (spec open item) but does not block S1.
