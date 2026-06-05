# `public/memories/` — explorer asset folder

The on-disk home for memory assets (splats, previews, thumbnails, `manifest.json`).
These are **not** served by Next's static `public/` handler — that only exposes
files present at build time, so a live drop's runtime-written `.sog` would 404.
Instead they're streamed from this directory by the dynamic route
`app/api/asset/[name]` (`PUBLIC_MEMORIES_DIR`), so `NEXT_PUBLIC_MEMORIES_BASE_URL`
defaults to `/api/asset` and files here are served at
`http://localhost:3000/api/asset/<file>`. For the exhibition this base URL can
point at a static host / CDN instead — no code change.

## What's tracked vs. local

- **Tracked in git:** `manifest.json` (hand-authored, small) and this `README.md`.
- **Local only (git-ignored):** the splats `*.ply` (~63 MB, archival), the
  compressed `*.sog` (~10 MB, loaded up close), the decimated `*.preview.ply`
  (~220 KB, the distant point-cloud ghost), and thumbnail `*.jpg`.
  See `web/.gitignore`. After cloning, re-seed them (below) before running the explorer.

## Re-seeding the sample assets

Until S3 (the contribution app) exists, the explorer runs against this hand-authored
`manifest.json` plus assets copied from the S1 pipeline's sample output:

```bash
# from the repo root
cp samples/output/splats/*.ply web/public/memories/
cp samples/output/thumbs/*.jpg web/public/memories/

# then compress .ply -> .sog (the format the explorer actually loads):
cd web && npm run convert-splats
```

The current `manifest.json` seeds **6 distinct memories** (`mem-01`…`mem-06`), each
with its own SHARP-reconstructed splat/thumbnail, spread across offset positions and
yaw rotations — exercising multi-placement, LOD load/dispose, and click-to-travel with
real per-memory geometry.

## Manifest shape (the explorer's input contract)

```jsonc
{
  "city": { "name": "...", "origin_lat": 0, "origin_lon": 0 },
  "memories": [
    {
      "id": "mem-01",
      "status": "approved",            // explorer shows approved/ready
      "thumbnail_url": "<file>.jpg",   // relative to NEXT_PUBLIC_MEMORIES_BASE_URL
      "splat_url": "<file>.sog",       // relative to the same base (SOG-compressed)
      "captured_at": "ISO-8601",
      "geo": { "lat": 0, "lon": 0 },   // informational; S2 does NO geo math
      "heading_deg": 0,
      "transform": {                   // the ONLY thing S2 uses to place a memory
        "position": [x, y, z],         // metres, three.js Y-up
        "quaternion": [x, y, z, w],    // orientation
        "scale": [1, 1, 1]             // SHARP is metric -> usually identity
      },
      "created_at": "ISO-8601"
    }
  ]
}
```

> **S2 does no geo math.** `geo`/`heading_deg` are carried for provenance; world placement
> comes entirely from `transform`, which (once S3 exists) the contribution app computes from
> the map pin + facing arrow. An `S1 manifest.json -> explorer manifest` adapter is future work.
