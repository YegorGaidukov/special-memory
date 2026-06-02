# Collective Memory City — Design & Build Plan (Uni MVP)

## Context

A **university art project** (solo, **a few weeks**, the working installation *is* the deliverable):
an interactive web piece where people upload photos of **one chosen city**, each photo becomes a
**photorealistic 3D Gaussian-splat "memory"**, placed at its real-world location. Visitors fly
through a **dark-void world** where memories glow as photoreal islands over faint street lines —
the city **emerging from collective memory**, dense where remembered, dreamlike at the edges.

The keystone making "photorealistic, from a single user photo, geo-placed" feasible is
**Apple SHARP** (`github.com/apple/ml-sharp`): feedforward **single image → metric-scaled 3D
Gaussian splat (`.ply`) in ~1s** on a CUDA GPU, **no per-scene training**. Metric scale is what
lets memories drop into a shared real-world coordinate space.

### Decisions locked during brainstorming
- Aesthetic: photorealistic places via SHARP (single image → 3DGS).
- City model: geo-placed memories in a shared world; base world is **dark void / starfield** with
  faint implied streets (memories glow as islands).
- Geo-placement: auto from **EXIF GPS** when present, then **manual pin + facing-arrow** adjust.
- Scope: **one specific city**.
- **Compute split:** prototype/dev on the user's **Windows + NVIDIA-GPU laptop** (CUDA locally,
  native or WSL2); the **96 GB-VRAM / 128 GB-RAM Windows server is only for the exhibition**
  (throughput/batching). The pipeline is built device-agnostic (a `--device` flag) so the same code
  runs both places — laptop for building, server for the show.
- Project context: **uni, solo, tight (weeks), app-only** → MVP-focused, YAGNI hard.

### Honest constraints (designed-around)
- A single-image splat is a **peek-around volume**, not a 360° walkable block; past the original
  viewpoint geometry thins/hallucinates → embraced as the "dreamlike edges" aesthetic.
- SHARP gives metric **scale** but not world **orientation** → heading comes from the
  contributor's facing-arrow (EXIF compass is unreliable).
- SHARP is Python 3.13 + CUDA and often Linux-tested; on **Windows** run natively or via
  **WSL2** — confirm in S1.
- Quality varies with the photo (lighting/indoor/crowds); allow rejection via an approve flag.
- Glance at SHARP `LICENSE_MODEL` — research/educational use is expected to be fine.

## MVP scope (what ships in weeks)

Three lean parts. Everything else is explicitly deferred (see below).

### S1 — Reconstruction (prove the magic FIRST)
On the **laptop** (CUDA): `image → splat`.
- Stand up `apple/ml-sharp` (Python 3.13 + CUDA) on the Windows+NVIDIA laptop — native first, WSL2
  if native is painful; auto-download checkpoint. Same setup later targets the server unchanged.
- Script with a `--device` flag: image → `memory.ply` (metric-scaled) + a downscaled **thumbnail**
  (the original photo, used for far-away billboards/UI).
- Optional: convert `.ply` → `.ksplat` (mkkellogg's included tool) only if load size hurts.
- **Manual/CLI trigger is acceptable for MVP** (no fancy queue yet).
- **Pre-generate a small set of splats** so S2/S3 dev doesn't need a live GPU run each time.
- **Verify:** run on 5–10 real city photos on the laptop; eyeball quality; note time + file size.

### S2 — Explorer (the experience)
Three.js scene + **`@mkkellogg/gaussian-splats-3d`** (chosen over Spark for maturity/docs and a
solo timeline; supports `.ply`/`.ksplat`, multi-scene, progressive load).
- Dark-void world: starfield/skybox + **faint procedural street grid** (real OSM lines deferred).
- Memories loaded from a simple DB/JSON of `{splat_url, thumbnail_url, position[x,y,z], quaternion,
  scale}`.
- Camera: free-fly + **click-a-memory to travel** (smooth fly-to).
- **Light LOD only:** load splats on approach; show the **photo as a billboard** when far. No
  quadtree/clustering yet (fine for tens–low-hundreds).
- **Verify:** load 3–5 hand-placed splats; fly + travel; confirm dark-void renders and is smooth.

### S3 — Contribution flow (minimal)
- Upload form (drag a photo) → store image + **parse EXIF** (lat/lon, capture time).
- **Placement UI:** MapLibre GL map of the city; auto-drop pin from EXIF (draggable), rotatable
  facing-arrow; optional scale nudge → writes the memory record.
- Enqueue/trigger S1; **simple approve flag** before a memory shows in the explorer.
- **Auth: minimal** — a single shared gallery password or curator-only adds; no per-user accounts.
- **Verify:** end-to-end — upload → EXIF placed → adjust → run SHARP → approve → appears at the
  right place/orientation.

## Geo math (MVP)
City origin (lat/lon). Project each memory lat/lon → local meters via simple **equirectangular
approximation** (accurate enough at city extent); heading → yaw; SHARP metric scale → real size;
store `position`+`quaternion`+`scale`.

## Data model (memory)
`id, status(uploaded|processing|ready|approved|failed), original_image_url, thumbnail_url,
splat_url, captured_at, geo{lat,lon}, heading_deg, transform{position[x,y,z], quaternion, scale},
created_at`  •  `City config: { name, origin_lat, origin_lon }`

## Recommended stack (kept simple for solo/weeks)
- **Reconstruction:** Python 3.13 + `apple/ml-sharp` + CUDA — laptop (NVIDIA) for dev, 96 GB
  Windows server for the show; `--device` flag keeps it portable.
- **App + UIs:** Next.js (React, TypeScript) full-stack — one repo for upload, placement, explorer.
- **Map:** MapLibre GL.  **Explorer:** Three.js + `@mkkellogg/gaussian-splats-3d`.
- **Storage:** local disk / static folder served by the app (no cloud needed at this scale).
- **DB:** SQLite (or a JSON file) — enough for tens–hundreds of memories.

## Deferred (NOT in MVP — re-scope later if time allows)
- Thousands-scale streaming, spatial-index culling, cluster-glow LOD.
- Tiered crowd **densification** (fusing overlapping memories into denser spots).
- `.spz` compression / Spark renderer.
- Real **OSM street lines** (use a procedural grid for now).
- User accounts, robust moderation, job queue/worker service.

## Open items to confirm at implementation
- Which specific city (and origin lat/lon)?
- SHARP runs natively on Windows vs needs WSL2 (settled in S1).
- `LICENSE_MODEL` cleared for the exhibition.
