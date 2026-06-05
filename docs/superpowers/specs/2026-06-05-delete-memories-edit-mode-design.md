# Delete memories from edit mode — design

**Date:** 2026-06-05
**Subsystem:** S3 (contribution / curation), web

## Goal

Let the curator delete a memory directly from the explorer's edit-placements mode:
select a memory → **Delete** → it vanishes from the world and its splat files are
removed from disk. No separate admin page (consistent with the stripped-down,
drop-to-splat flow).

## Scope

In scope: deleting *selectable* memories — i.e. memories present in the published
manifest, which are either:

- **Store-managed** S3 contributions (live in `web/data/memories.json`, status `approved`), or
- **Seed-only** hand-authored memories (live only in `web/public/memories/manifest.json`).

Out of scope (YAGNI for now): deleting in-flight **pending** memories (the placeholder
rings shown by `PendingSpheres` before reconstruction finishes — not yet splats, and not
selectable via the bbox raycast). Uploaded original photos in `data/uploads/` are left in
place as provenance.

## Decisions (confirmed with user)

- **Disk files:** delete the memory's asset files under `public/memories/` along with the
  record (no orphaned binaries).
- **Confirm UX:** two-step inline confirm in the glass inspector (Delete → Confirm/Cancel),
  no native `confirm()` dialog.
- **Seeds:** deleting a seed memory is allowed; it edits the git-tracked `manifest.json`
  (the intended curator action), mirroring how the transform-save route already patches seeds.

## Server

The delete route mirrors `PATCH /api/memories/[id]/transform`, which already branches on
store-managed vs seed-only.

`DELETE /api/memories/[id]` (added to the existing `app/api/memories/[id]/route.ts`,
which currently exports only `GET`):

1. `loadStore()` + `findById(store, id)`.
2. **Store-managed record present:** `removeRecord(store, id)` → `saveStore`. If the removed
   record's `status === "approved"`, call `publishManifest(next, city)` so the regenerated
   manifest no longer contains it.
3. **Not in store (seed-only):** `removePublishedMemory(id)` removes the entry from
   `public/memories/manifest.json`. If the id is in neither the store nor the manifest →
   `404`.
4. After the record is removed in either branch, delete disk assets via
   `deleteMemoryAssets(id)`: unlink `${id}.sog`, `${id}.preview.ply`, `${id}.jpg`,
   `${id}.ply` under `PUBLIC_MEMORIES_DIR`, ignoring `ENOENT`.
5. Respond `{ ok: true, id }`.

### New helpers

- `store.ts` — `removeRecord(store, id): ContribStore` (pure): returns a store with the id
  filtered out. Mirrors `updateRecord`.
- `publish.ts` — `removeManifestMemory(raw, id): { manifest, found }` (pure): filters the
  raw manifest's `memories` by id, mirroring `patchManifestMemoryTransform`. Plus the fs
  seam `removePublishedMemory(id): Promise<boolean>` mirroring `patchPublishedTransform`
  (returns `false` when the manifest is missing/unreadable or the id isn't present).
- A pure `assetFilesFor(id): string[]` (filenames `${id}.sog`, `${id}.preview.ply`,
  `${id}.jpg`, `${id}.ply`) + an fs seam `deleteMemoryAssets(id)` that unlinks each under
  `PUBLIC_MEMORIES_DIR`, tolerating missing files. Co-located with the other public-memories
  asset logic (alongside `expectedAssets` in `ingest.ts`, or a small `assets.ts`).

## Client (`SplatWorld.tsx`)

`deleteMemory()`:

```
DELETE /api/memories/{selectedId}
on success:
  - setSelectedId(null); setLiveTransform(null)
  - drop selectedId from the `edits` overlay
  - bump manifestVersion → refetch (memory already gone server-side, so it
    disappears from `records` and its SplatMesh disposes)
on error:
  - surface message in the inspector (deleteError)
```

Delete state (`deleting`, `deleteError`) lives in `SplatWorld` next to the existing
save state and is passed down to the inspector.

## UI (`EditHud.tsx` + `EditHud.module.css`)

New props: `onDelete?`, `deleting?`, `deleteError?`. In the actions row (shown only when a
memory is selected), a danger-styled **Delete** button. First click → inline
**Confirm delete? · Cancel** (local component state, reset on deselect/selection change).
Confirm calls `onDelete`; Cancel reverts to the single button. While `deleting`, the button
shows a pending label and is disabled. `deleteError` renders in the existing status line.

## Testing (TDD, repo seam convention)

Unit-test the pure helpers (Vitest):

- `removeRecord` — removes the target id, leaves others, no-op on unknown id.
- `removeManifestMemory` — `found` true/false; preserves other entries and top-level fields.
- `assetFilesFor` — exact filename set for an id.

The DELETE route, `deleteMemoryAssets` fs seam, and the EditHud button are the
manual/seam-tested boundaries, consistent with the rest of S3. Verify end-to-end on a
**production build** (`npm run build && npm run start`): delete a seed and an S3 memory,
confirm each vanishes, its `SplatMesh` disposes, the manifest/store updates, and the files
are gone.
