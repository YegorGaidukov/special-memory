# Drop-to-contribute — design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Subsystem:** S3 (Contribution, web)

## Problem

The only way to start an upload today is the standalone `/contribute` page (a plain
file-picker form). Users expect to drop a photo directly onto the dark-void explorer
and be taken to placement. The separate landing page is an unnecessary detour.

## Goal

Replace the `/contribute` upload landing page with **drag-and-drop onto the explorer
viewport**. Dropping an image uploads it via the existing `POST /api/memories`
endpoint and redirects to the existing placement map at `/contribute/<id>`.

The placement page (`/contribute/[id]`) and the upload API are **unchanged** — this
is purely a new front door to the same flow.

## Behavior

1. The explorer (`/`) shows a small **persistent hint** in a bottom corner:
   *"Drag a photo here to add a memory."*
2. Dragging any file over the window dims the view with a **small overlay**:
   *"Drop a photo to add a memory."*
3. On **drop**: take the first file, validate it is `image/jpeg` or `image/png`,
   `POST` it as `FormData` (field name `photo`) to `/api/memories`, then
   `router.push('/contribute/<id>')` using the returned record id.
4. While the request is in flight the overlay shows *"Uploading…"*.
5. On error (non-image file, or non-OK server response) the overlay shows the error
   message and returns to the idle hint so the user can retry.
6. **Pointer-lock interaction:** drag-and-drop is only expected to work when the
   pointer is free (normal cursor). During pointer-locked free-fly the OS hides the
   cursor and browsers do not fire file-drop events, so no special handling is needed —
   "only when pointer is free" is the default behavior, not extra code.

## Components / files

### New: `web/src/lib/upload/pickImage.ts` (pure, unit-tested)

A single pure helper that isolates the only branching logic worth testing:

```
pickImage(files: FileList | File[]): { file: File } | { error: string }
```

- Returns the **first** file when it is `image/jpeg` or `image/png`.
- Returns `{ error }` for an empty list or a first file of any other type.
- Multi-file drops use the first file only (others ignored).

### New: `web/src/components/DropToContribute.tsx` (`"use client"`, manual seam)

An HTML overlay component rendered as a sibling of `<ExplorerCanvas />`, matching the
existing HUD-overlay pattern (`TravelOverlay`, `EditHud`). Responsibilities:

- Window-level `dragenter` / `dragover` / `dragleave` / `drop` listeners that toggle a
  `dragging` state (drives the overlay) and, on drop, call `pickImage`.
- Renders the persistent corner hint, the drag overlay, the uploading state, and the
  error message.
- Upload + redirect logic lifted almost verbatim from the old page's `upload()`:
  build `FormData`, `fetch("/api/memories", { method: "POST", body })`, read
  `{ record }`, `router.push(\`/contribute/${record.id}\`)`.
- `preventDefault` on `dragover`/`drop` so the browser does not navigate to the file.

### Edit: `web/src/app/page.tsx`

Add `<DropToContribute />` alongside `<ExplorerCanvas />`:

```tsx
<main>
  <ExplorerCanvas />
  <DropToContribute />
</main>
```

### Delete: `web/src/app/contribute/page.tsx`

The standalone upload landing page is removed. `/contribute/[id]` (placement) stays.

## Data flow

```
drop image on explorer (/)
  → pickImage(files) → { file }
  → POST /api/memories (FormData: photo)         [existing, unchanged]
      → saves original + recon-inbox copy, parses EXIF, creates `uploaded` record
      → returns { record }
  → router.push(/contribute/<record.id>)         [existing placement map, unchanged]
```

## Error handling

- **Empty drop / non-image first file:** `pickImage` returns `{ error }`; overlay shows
  it; no network call.
- **Server error (`!r.ok`):** overlay shows the response text; user can retry by
  dropping again.
- **Browser default drop nav:** prevented via `preventDefault` on the drag/drop events.

## Testing

Mirrors project convention — pure logic is Vitest-tested, the DOM/WebGL/network layer
is the manual seam.

- **Vitest** (`pickImage`): first-file selection; accepts jpeg; accepts png; rejects
  non-image first file; empty list returns error.
- **Manual smoke test:** drop a `.jpg` on the explorer → record created (file appears in
  `web/data/uploads/` + `RECON_INBOX`) → redirected to `/contribute/<id>`; drop a
  `.txt` → error shown, no upload.

## Out of scope (YAGNI)

- Multi-file batch drops (first file only).
- Drag-to-reposition memories within the void.
- In-world EXIF preview before placement (the placement map already handles EXIF).
- Auto-release of pointer lock on drag (declined — pointer-free-only is the default).
