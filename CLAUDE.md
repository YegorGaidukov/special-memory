# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Collective Memory City** — a solo university art installation (tight, ~weeks timeline; the working
web piece *is* the deliverable). People upload photos of **one chosen city**; each photo becomes a
**photorealistic 3D Gaussian-splat "memory"** placed at its real-world location; visitors fly
through a **dark-void world** where memories glow as photoreal islands. The city emerges from
collective memory — dense where remembered, dreamlike at the edges.

**Source of truth (read these first):**
- Design/spec: `docs/superpowers/specs/2026-06-02-collective-memory-city-design.md`
- S1 implementation plan: `docs/superpowers/plans/2026-06-02-s1-reconstruction-pipeline.md`

**Current state:** pre-implementation. Only the spec and plan docs exist; no application code yet.
Build order is **S1 → S2 → S3** (below). Each subsystem gets its own plan under
`docs/superpowers/plans/`.

## Architecture (big picture)

The reconstruction keystone is **Apple SHARP** (`github.com/apple/ml-sharp`): a feedforward model
that turns a **single image** into a **metric-scaled** 3D Gaussian splat (`.ply`) in ~1s on a CUDA
GPU, with no per-scene training. Metric scale is what lets each memory drop into one shared
real-world coordinate space. The system is three loosely-coupled subsystems linked by a JSON
**manifest** of memory records:

- **S1 — Reconstruction (Python).** A `pipeline/` package wrapping the `sharp predict` CLI. Input
  image(s) → `.ply` splat + thumbnail + `manifest.json`. The heavy GPU call is isolated behind a
  single seam (`pipeline/sharp_runner.run_sharp`) so all other logic is unit-tested without a GPU.
- **S2 — Explorer (web).** Next.js + Three.js + `@mkkellogg/gaussian-splats-3d`. Renders the
  dark-void world and loads memory splats from the manifest by their stored transform. Free-fly +
  click-a-memory-to-travel; light LOD (load on approach, photo billboard when far).
- **S3 — Contribution (web).** Upload form → EXIF parse → MapLibre map pin + facing-arrow placement
  → enqueue to S1 → approve flag → memory appears in the explorer.

**Memory record (the contract between subsystems):** `id, status, source_image, splat_path,
thumbnail_path, captured_at, geo{lat,lon}, heading_deg, transform{position[x,y,z], quaternion,
scale}`. S1 emits reconstruction-time fields; S3 adds geo/transform. City config carries
`{name, origin_lat, origin_lon}`.

**Geo placement:** memory lat/lon → local meters via equirectangular approximation relative to the
city origin; user-set heading → yaw; SHARP's metric scale → real size.

## Constraints that drive design decisions

- A single-image splat is a **peek-around volume**, not a 360° walkable block — geometry thins past
  the original viewpoint. This is embraced as the "dreamlike edges" aesthetic, not fixed.
- SHARP gives metric **scale** but not world **orientation** → orientation comes from the
  contributor's facing-arrow (EXIF compass is unreliable).
- SHARP **auto-detects** its device (CUDA when available). This already satisfies the
  laptop↔server portability goal; don't add a device flag unless forcing CPU/MPS, via the
  `--sharp-arg` passthrough.
- **Compute split:** all dev/prototyping runs on a Windows + NVIDIA-GPU laptop; the 96 GB-VRAM
  Windows server is for the **exhibition only**. Keep the pipeline runnable on both unchanged.
- **YAGNI for the MVP** — explicitly deferred: thousands-scale streaming/clustering, crowd
  densification, `.spz` compression, real OSM street lines, user accounts, job-queue service.

## Commands

SHARP and the S1 pipeline share one conda env (Python 3.13). SHARP is checked out separately
(e.g. `C:\Work\GitHub\ml-sharp`).

```powershell
# One-time env + SHARP install
conda create -n sharp python=3.13 -y
conda activate sharp
pip install -r C:\Work\GitHub\ml-sharp\requirements.txt   # SHARP deps
pip install -r requirements-pipeline.txt                  # our deps (pillow, pytest)

# Run the reconstruction pipeline (once pipeline/ exists)
python -m pipeline -i samples\input -o samples\output

# Run SHARP directly
sharp predict -i <input_image_dir> -o <output_dir>

# Tests
pytest                                  # full suite
pytest tests/test_thumbnails.py -v      # one file
pytest tests/test_cli.py::test_reconstruct_end_to_end_with_fake_runner -v   # one test
```

The first SHARP run auto-downloads a ~1.2 GB checkpoint to `~/.cache/torch/hub/checkpoints/`.

## Conventions

- **TDD, with the GPU isolated.** Test the logic we write (command construction, thumbnails,
  manifest, orchestration) with the SHARP subprocess mocked/injected; prove the real model with one
  manual integration smoke test, not a unit test.
- Small, single-responsibility modules in `pipeline/` (`thumbnails`, `sharp_runner`, `manifest`,
  `cli`). Files that change together live together.
- This project follows the **superpowers** workflow: specs live in `docs/superpowers/specs/`, plans
  in `docs/superpowers/plans/`. Brainstorm → spec → plan → implement; commit frequently.
- Splat/binary outputs (`*.ply`, `*.ksplat`, `outputs/`, `samples/`) are git-ignored — keep them
  local.
