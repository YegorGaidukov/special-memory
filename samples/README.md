# S1 smoke-test — sample set & metrics

Binaries (`samples/input/*`, `samples/output/*`) are git-ignored; keep them local. Only this
note is tracked.

## Run 1 — environment & plumbing validation (2026-06-02)

This first run validated the **toolchain and pipeline plumbing end-to-end on the NVIDIA laptop**,
not yet the aesthetic quality of real city photos (those come in a later run).

**Environment**
- Miniconda env `sharp`, Python 3.13.
- SHARP installed from `C:\Work\GitHub\ml-sharp` via `pip install -r requirements.txt` (pulls
  `-e .`, `torch==2.8.0`, `gsplat==1.5.3`, `timm`, etc.).
- **torch reinstalled as CUDA build** `2.8.0+cu128` (PyPI default on Windows is CPU-only).
  `torch.cuda.is_available() == True`, device = **NVIDIA GeForce RTX 4060 Laptop GPU (8 GB)**.
- Pipeline deps (`pillow`, `pytest`) installed into the same env.

**Input**
- `teaser.jpg` (Apple SHARP repo `data/teaser.jpg`) — a montage, used purely to exercise the
  pipeline. **Not** a representative single-scene city photo.

**Command**
```powershell
conda activate sharp   # or prepend ...\envs\sharp\Scripts to PATH so `sharp` resolves
python -m pipeline -i samples\input -o samples\output
```

**Result:** `Done: 1/1 memories reconstructed -> samples\output/manifest.json`

| Metric | Value |
|---|---|
| Checkpoint download (one-time) | 2.62 GB, ~4m19s @ ~11 MB/s → `~/.cache/torch/hub/checkpoints/` |
| Inference (steady state, GPU) | ~8 s / image; full cycle incl. pre/post + save ~12–15 s |
| Output `.ply` | `teaser.ply`, 63 MB, **1,179,648 Gaussians**, binary 3DGS |
| Thumbnail | `teaser.jpg`, 44 KB |

## Confirmed assumptions / findings

- ✅ **`.ply` naming = input stem.** SHARP wrote `teaser.ply` for input `teaser.jpg`. The
  stem-matching in `pipeline/manifest.py` is correct — **no code change needed** (this was the one
  external assumption flagged in the S1 plan).
- ✅ `sharp predict` flags match `build_command`: `-i/-o/-c/--render`; also a `--device` flag
  (`cpu|mps|cuda`) reachable via our `--sharp-arg` passthrough if we ever need to force it.
- ℹ️ **Per-image ~8 s on the RTX 4060 laptop**, not the spec's "~1 s" (that figure is for higher-end
  GPUs; the 96 GB exhibition server should be much faster). Fine for batch pre-generation.
- ℹ️ The `.ply` carries **extra non-standard PLY elements** (`extrinsic` 4×4, `intrinsic` 3×3,
  `image_size`, `disparity`, `color_space`, `version`) alongside the standard Gaussian `vertex`
  element. Useful metric camera data for S2 placement, but strict 3DGS parsers that assume only
  `vertex` may need these tolerated/stripped.
- ⚠️ SHARP logs `Did not find focallength in exif ... Setting to 30mm` — focal length affects metric
  scale, so for real photos prefer images with EXIF focal length, or plan to set/normalize it.
- ⚠️ **Model license is research-only** (`ml-sharp/LICENSE_MODEL`): non-commercial scientific
  research / academic development. A non-commercial university exhibition fits; no commercial use.

## Still pending (needs a human)

- [ ] Drop 5–10 **real city photos** (outdoor, depth, EXIF focal length) into `samples/input/` and
      re-run for the actual quality verdict.
- [ ] Eyeball a `.ply` in a viewer — drag into <https://playcanvas.com/supersplat/editor> or
      <https://antimatter15.com/splat/> — confirm recognizable scene + parallax; note the
      "dreamlike edges" where geometry thins past the original viewpoint.
