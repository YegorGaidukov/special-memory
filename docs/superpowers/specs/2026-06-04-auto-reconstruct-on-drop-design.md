# Auto-reconstruct on drop (decoupled watcher) — design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Subsystem:** S1 (pipeline) + S3 (contribution, web)
**Builds on:** `2026-06-04-drop-to-contribute-design.md`

## Problem

Today, dropping a photo on the explorer creates an `uploaded` record and copies the
image to the recon inbox, but reconstruction is **manual**: the curator runs
`python -m pipeline` + `npm run convert-splats` on the GPU box and clicks ingest in
`/admin`. The curator wants reconstruction to **start automatically the moment the
image is dropped** — running in the background while they place the pin on the map —
so the 3D splat is usually ready by the time placement is done.

## Goal

When a photo is dropped, kick off reconstruction automatically and surface live status
on the placement page (`processing → ready`, or `failed`). The 3D fine-tune editor
unlocks itself when the splat is ready, with no manual ingest step and no page refresh.

## Key constraint preserved

**SHARP stays out of the web process.** The reconstruction is done by a **separate
watcher process** the curator starts on the GPU box (in the conda `sharp` env), exactly
like S1 today. The web server never spawns SHARP; it only tracks status. The bridge
remains the filesystem (recon inbox → `public/memories`) plus a thin HTTP callback.

## Flow

```
drop photo → POST /api/memories
    saves original (UPLOADS_DIR) + inbox copy (RECON_INBOX), status = "processing"
    → redirect to /contribute/<id> (placement map; 3D locked, shows "Reconstructing…")

[GPU box] python -m pipeline.watch        (curator starts once, in the `sharp` env)
    every N seconds, scans RECON_INBOX for <id>.<ext> that has no <id>.sog in
    public/memories and is not already in-flight:
      → reconstruct() on that single image  → <id>.ply + <id>.jpg
      → convert-splats (node)               → <id>.sog + <id>.preview.ply → public/memories/
      → copy <id>.jpg                        → public/memories/
      → POST /api/memories/<id>/ingest       → status "ready"
    on any error:
      → POST /api/memories/<id>/fail         → status "failed" (+ error message)
      → move the inbox image to RECON_INBOX/failed/ so it is not retried

placement page polls GET /api/memories/<id> while status is processing/uploaded:
    → "ready":  3D editor unlocks automatically (no refresh)
    → "failed": shows the error + "re-drop the photo to retry"
```

Serial by design — one GPU job at a time (single GPU; no concurrency needed).

## Components / files

### Web (TypeScript)

**Edit `web/src/app/api/memories/route.ts`**
New records get `status: "processing"` instead of `"uploaded"` — a drop now always
means reconstruction is expected to start. (`uploaded` remains a valid status in the
type union for records whose recon has not been initiated.)

**New `web/src/server/store.ts` helper: `markFailed(store, id, error)`** (pure)
Returns a new store with the record's `status` set to `"failed"` and `error` set to the
given message. Mirrors the existing `updateRecord` style. Unit-tested.

**New `web/src/app/api/memories/[id]/fail/route.ts`** (`runtime = "nodejs"`)
`POST` with JSON `{ error?: string }` → `markFailed` → save store → return the record.
404 if the id is unknown. The watcher's error callback. Manual/seam-tested.

**Edit `web/src/server/types.ts`**
Add server-only `error?: string` to `ContribRecord` (alongside `source_image`).

**Edit `web/src/app/contribute/[id]/page.tsx`**
- While `record.status` is `processing` or `uploaded`, poll `GET /api/memories/<id>`
  every ~3 s and update local state, so the page advances without a refresh.
- Replace the "3D placement unlocks once the splat is ingested" copy: show
  "Reconstructing your memory… this unlocks automatically when ready" while processing,
  and a failure message with a re-drop hint when `status === "failed"`.
- Rewrite the stale post-save note (currently "run SHARP on the inbox image, drop
  `<id>.sog` … then ingest + approve") to reflect automatic processing.

**Reused untouched:** `api/memories/[id]/ingest/route.ts` is the success callback —
no change.

### Pipeline (Python)

**New `pipeline/watch.py`** — the poll loop, runnable as `python -m pipeline.watch`.
- **Pure seam (unit-tested):** `select_pending(inbox_stems, ready_stems, in_flight) -> [ids]`
  — returns inbox image ids that have no corresponding `.sog` yet and are not already
  in-flight. Keyed by stem (the record id), matching the rest of the pipeline.
- **Orchestration (mocked seams):** for each pending id, build a single-image temp
  input dir, call `reconstruct()` (reused from `pipeline.cli`), run convert-splats via
  `node web/scripts/convert-splats.mjs <splats_dir> <public/memories>`, copy the
  thumbnail, then POST to the ingest endpoint; on exception, POST to the fail endpoint
  and move the image to `RECON_INBOX/failed/`.
- HTTP via stdlib `urllib.request` (no new dependency).
- Config via env: `WEB_BASE_URL` (default `http://localhost:3000`),
  `WATCH_INTERVAL_SEC` (default 3). `RECON_INBOX` / `PUBLIC_MEMORIES_DIR` resolved the
  same way as the web `paths.ts` defaults, overridable by env for the exhibition box.

### Docs

- `CLAUDE.md` (S3 section + Commands): document that a drop auto-triggers recon and that
  the curator runs `python -m pipeline.watch` on the GPU box; note the web process still
  never runs SHARP.
- `web/README.md`: the contribution flow now auto-reconstructs; how to start the watcher.

## Data flow / status lifecycle

```
uploaded ──(legacy/initial)──┐
                             ▼
drop ─► processing ─► ready ─► approved        (happy path)
              │
              └─► failed   (recon error; re-drop to retry)
```

## Error handling

- **Recon failure (SHARP/convert-splats throws, non-zero exit):** watcher POSTs `fail`
  with the error text → record `failed`; image moved to `RECON_INBOX/failed/`; placement
  page shows the error + re-drop hint.
- **Web server unreachable from the watcher:** the assets still land in
  `public/memories`; the callback is retried on the next poll (idempotent — a record
  already `ready` simply re-ingests to the same state). The watcher logs and continues.
- **Watcher not running:** records sit in `processing`; the placement page keeps polling.
  Documented as expected (the curator must start the watcher, like the dev server).
- **Bad/corrupt image, missing focal length:** SHARP behavior is unchanged from S1; a
  hard failure routes through the `fail` path above.

## Testing

Mirrors project convention — pure logic is unit-tested; GPU, subprocess, and HTTP are
mocked seams.

- **Vitest:**
  - `markFailed` sets status `failed` + error message, leaves other records intact.
  - upload route now creates a `processing` record (update existing expectation).
  - Update the headless backend smoke test for the new initial status.
- **pytest:**
  - `select_pending`: picks inbox stems lacking a `.sog`; skips ones already ready or
    in-flight; empty when nothing pending.
  - watcher orchestration with `reconstruct`, convert-splats subprocess, and HTTP all
    mocked: asserts ingest-POST on success, fail-POST + move-to-`failed/` on error.
- **Manual smoke test:** start `python -m pipeline.watch`; drop a real photo on the
  explorer → record goes `processing` → `ready`, 3D editor unlocks on the placement page
  without refresh; drop a corrupt image → `failed` with the error + re-drop hint.

## Out of scope (YAGNI)

- Concurrent GPU jobs / a job-queue service (single GPU, serial).
- Automatic retry of failed images (curator re-drops).
- A file poller inside the Next.js process (the watcher calls the API instead).
- Progress percentage or per-stage status (binary `processing → ready`).
- Authentication on the new `fail` endpoint (consistent with the open, local install).
