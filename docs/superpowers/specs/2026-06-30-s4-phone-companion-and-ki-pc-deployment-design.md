# S4 — Phone Companion + ki-pc deployment re-architecture (design)

**Status:** approved 2026-06-30. Supersedes the GitHub-Pages hosting model sketched in
`docs/server-connection.md` for *this* project (that doc remains the generic chair guide).

## Why

The exhibition runs a **projector** showing the Collective Memory City continuously while
**visitors interact with their phones**. Today's `web/` app is a **server-ful Next.js app**
(COOP/COEP headers, Route Handlers `/api/memories` + `/api/asset/[name]`, a JSON store, module-level
singletons) with SHARP run by a separate `python -m pipeline.watch` watcher. Neither the desktop
drag-drop upload nor keyboard/mouse free-fly works for a gallery visitor holding a phone.

This change does two entangled things:

1. **Re-architects deployment** onto the real exhibition hardware — the chair GPU box **`ki-pc`**
   (`ki-pc.architektur.uni-weimar.de`, 141.54.181.55, 96 GB VRAM, public HTTPS via **Caddy** +
   Docker). Everything runs **same-origin** behind Caddy: a **FastAPI backend that absorbs the
   Python `pipeline/` and runs SHARP inline**, plus the **static-exported frontend**. The
   **projector is a kiosk browser** pointed at the ki-pc URL; phones open `/m` on the same domain.
   **GitHub Pages is dropped.**
2. **Adds S4 — Phone Companion**: scan a QR → minimal mobile page → contribute a memory (photo +
   date + voice recording) → the same phone becomes a **joystick** driving the projected view.

## Product decisions (confirmed with the curator)

- **One driver at a time** controls the projected camera; other phones wait.
- **Spatial audio** — each memory's recording is positional; volume rises as the camera nears it.
- **Scatter-near-cluster placement** — new memories drop near the existing cluster (no GPS, no
  projector-camera pose), keeping the city dense where remembered.
- Joystick UX = **move-joystick + drag-to-look**, plus a **"jump to a memory"** button.

## Why Architecture A (all on ki-pc + Caddy), not GitHub Pages

Three hard constraints decided it:

1. **Phone audio recording needs HTTPS.** `getUserMedia`/`MediaRecorder` (the mic) only work in a
   *secure context* → the Caddy + Let's Encrypt domain is effectively required; a plain LAN IP can't
   record.
2. **The splat renderer wants COOP/COEP** (SharedArrayBuffer worker sort). GitHub Pages can't send
   headers (would need the `coi-serviceworker` hack or a slower no-SAB mode); Caddy sets them
   trivially.
3. **Assets are big and GPU-local** (hundreds of ~6 MB `.sog` + audio, produced by SHARP on ki-pc).
   Serving them from ki-pc is fast; routing through Pages buys nothing.

Same-origin on ki-pc also removes CORS and lets the joystick use a clean **WebSocket** (FastAPI
native, Caddy proxies it) instead of an SSE+POST workaround.

## Target architecture

```
                 Caddy (:443, auto-TLS)  on ki-pc, same origin
                 ├─  /            → static frontend (Next export): explorer (projector)
                 ├─  /m           → static frontend: phone companion page
                 ├─  /api/*       → FastAPI (uvicorn, Docker)
                 ├─  /assets/*    → FastAPI: splats / audio / thumbnails (GPU-local files)
                 └─  /ws/control  → FastAPI WebSocket (proxied): single-driver joystick relay
                          │
                   FastAPI backend  (absorbs pipeline/ → runs SHARP inline)
                          └─ store (memories.json) · upload · manifest · publish · ingest-equiv
```

Likely served under a **subpath** on the shared chair domain (e.g. `/memory-city/…`) → set Next
`basePath`/`assetPrefix` and prefix the WS path; a dedicated subdomain (simpler) is preferred if
available. Pin this at deploy time.

**Convention:** keep the project's **TDD-with-isolated-seam** discipline. Pure logic is unit-tested
(pytest on the backend, Vitest on the frontend). SHARP, MediaRecorder, the WebSocket,
`PositionalAudio`, and Caddy/Docker are the mocked/manual seams.

## Memory record contract (additions)

The existing contract gains optional audio fields, carried end-to-end (record → publish → manifest):
`audio_path` (backend, on-disk) and `audio_url` (manifest, frontend). Everything else is unchanged.

---

## Phase 1 — Backend + hosting migration (working checkpoint)

The **existing** explorer + desktop drop work unchanged, but on the ki-pc stack (same-origin FastAPI
+ static frontend). De-risks the re-architecture before any new feature.

**Backend** — new `backend/` FastAPI app importing the existing `pipeline` package. Port the current
TS server logic to Python (the existing Vitest specs are the porting spec → become pytest specs):
`server/store.ts`→store, `server/publish.ts`→manifest merge (`toExplorerManifest`/`mergeManifest`/
`patchPublishedTransform`), `server/exif.ts`+`lib/exif/placement.ts`→EXIF date/GPS,
`lib/upload/placement.ts`+`lib/geo/*`→placement+geo math, `server/ingest.ts`→inline post-recon
publish (no watcher), `server/asset.ts`→`safe_asset_name`. Endpoints mirror today's contract:
`POST /api/memories` (multipart; kicks off SHARP inline as a background task → `convert-splats` →
write assets → `ready`/`approved` → republish; `failed` on error), `GET /api/memories`,
`GET /api/memories/{id}`, `PATCH /api/memories/{id}/transform`, `GET /assets/{name}`,
`GET /assets/manifest.json`. Single uvicorn worker (in-memory singletons valid); SHARP in a
background task so uploads return immediately; reuse `pipeline.sharp_runner.run_sharp` as the GPU seam.

**Frontend** — switch to static export (`output: 'export'`), drop the `headers()` block (Caddy sets
COOP/COEP), delete `app/api/**`. Add `getApiBaseUrl()` (same-origin in prod, `localhost:8000` in dev)
and route all calls through it (`config/explorer.ts`, `useManifest`, `usePendingMemories`,
`DropToContribute`, transform PATCH). Set `basePath`/`assetPrefix` if under a subpath.

**Deploy** — `Dockerfile` (CUDA base, installs `pipeline` + SHARP), docker-compose service entry,
Caddyfile route block (static + `/api/*` + `/assets/*` + `/ws/*`), per `docs/server-connection.md`.

**Checkpoint:** laptop `uvicorn` backend + `npm run dev` → explorer loads, desktop drop reconstructs
and publishes, edit-mode save works; then verified once on ki-pc.

## Phase 2 — Mobile companion page + entry

New static route `web/src/app/m/*`: a full-bleed mobile UI **independent of the WebGL explorer**
(never mounts R3F). Single screen, two states: **Add** (default) and **Drive** (after upload / one
tap). Minimal chrome (no toolbar/theme/library), Geist-typed dark aesthetic. Reachable at
`https://<domain>/<basePath>/m`; generate the QR once and print it; document the URL.

## Phase 3 — Mobile upload (photo + date + audio + scatter placement)

Extends `POST /api/memories`: **audio** recorded on the phone via MediaRecorder
(`audio/webm;codecs=opus`), sent as a second multipart field, saved to `audio_path`, served at
`/assets/{id}.webm`, carried through publish to `audio_url`. **Manual date fallback** — prefer EXIF
`DateTimeOriginal`, else accept a phone-supplied `captured_at` (backend validator rejects malformed).
**Scatter-near-cluster** — pure `scatter_near_cluster(existing_positions, rng)` (centroid + bounding
spread, random offset within; empty-city fallback = scatter near origin; seeded for tests). Mobile
uploads use this mode; desktop EXIF-GPS / camera-front modes unchanged. Downstream
(inline SHARP → publish → placeholder-ring drop-out) unchanged.

## Phase 4 — Spatial audio playback (projector)

One `THREE.AudioListener` on the camera; per memory with `audio_url`, a `THREE.PositionalAudio` at
its `transform.position` with `refDistance`/`maxDistance`/rolloff tuned to the existing `LOD` radii
(new `AUDIO` config block). Load lazily via the same distance-residency trigger as splats
(mirror/extend `lib/lod/` + `components/Memories.tsx`); dispose past `disposeRadius`. A one-time
"enable sound" gesture on the projector unlocks the `AudioContext`.

## Phase 5 — Real-time joystick (WebSocket, single driver)

**Backend** `backend/control.py`: pure single-driver **token state machine** + latest-control-state
holder (in-memory, clock-injected) with an idle timeout (auto-release). `WS /ws/control`: projector
joins `role=display`, phones `role=controller` with a `clientId`; phone messages `request`/`release`/
`state` (`state` = `{move:{x,y}, look:{x,y}, jump?}`, validated+clamped by pure
`parse_control_state`); backend relays the current driver's state + driver-changed events to
display(s). **Phone Drive mode:** virtual move joystick + drag-to-look, sends `state` at ~15–20 Hz
while touched (`request` on first touch, `release` on lift/idle), plus a "jump to a memory" button
(`jump:"random"`); pure input math in `web/src/lib/control/`. **Projector:** a WS client writes the
latest state into a module-level holder `web/src/lib/control/remoteInput.ts` (mirroring the existing
`lib/camera/pose.ts` bridge); `Navigation.tsx` reads it each frame alongside the keyboard, integrating
the held `move` vector + applying `look` deltas (smooth between updates because the vector is held);
`jump` reuses the existing `Travel` `travelToId` path.

## Verification (end-to-end)

1. **Unit:** backend `pytest` (store/publish/placement/geo/exif/scatter/date/control token) +
   frontend `cd web && npm test` (control parse + input math, audio distance/gain).
2. **Dev loop (laptop):** `uvicorn` (in the `sharp` env) + `npm run dev` → explorer loads, desktop
   drop reconstructs + publishes, edit-mode save works.
3. **Static build:** `npm run build` (export) succeeds; serve behind local Caddy with COOP/COEP and
   confirm renderer + cross-origin isolation.
4. **Mobile upload (HTTPS phone):** `/m` → photo, date auto/manual, record audio, Upload →
   `processing` ring on the projector → splat replaces it after inline SHARP (scattered near cluster).
5. **Spatial audio:** enable sound; fly toward the new memory → recording fades in/out with distance.
6. **Joystick:** move joystick flies the view, drag-to-look turns; second phone blocked while the
   first drives, gains control after release/idle; "jump to a memory" flies.
7. **On ki-pc:** docker-compose + Caddy; verify HTTPS, COOP/COEP, WebSocket upgrade, full visitor loop.
