# Delete Memories from Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the curator delete a selected memory from the explorer's edit-placements mode — it disappears from the world and its splat files are unlinked from disk.

**Architecture:** A `DELETE /api/memories/[id]` route mirrors the existing transform-PATCH route's store-vs-seed branching: store-managed records are removed from `web/data/memories.json` (republishing the manifest if they were approved), seed-only records are filtered out of `public/memories/manifest.json` directly. Either branch then unlinks the memory's asset files. The inspector gains a two-step inline-confirm Delete button; `SplatWorld` calls the route, clears selection, and refetches the manifest.

**Tech Stack:** Next.js 16 App Router (Node runtime route handlers), React + React Three Fiber, Vitest. Spec: `docs/superpowers/specs/2026-06-05-delete-memories-edit-mode-design.md`.

> **Working directory:** all paths below are relative to `web/`. Run all `npx vitest` / `npm` commands from `web/`.

---

### Task 1: `removeRecord` store helper

**Files:**
- Modify: `src/server/store.ts` (add after `updateRecord`, ~line 31)
- Test: `test/server.store.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe("store ops", ...)` block in `test/server.store.test.ts` (the `rec` helper and imports already exist — just extend the `import` line to include `removeRecord`):

```ts
  it("removeRecord drops the target id and keeps the rest", () => {
    const s = addRecord(addRecord(emptyStore(), rec("a")), rec("b"));
    const s2 = removeRecord(s, "a");
    expect(s2.records.map((r) => r.id)).toEqual(["b"]);
  });

  it("removeRecord is a no-op for an unknown id", () => {
    const s = addRecord(emptyStore(), rec("a"));
    expect(removeRecord(s, "missing").records.map((r) => r.id)).toEqual(["a"]);
  });

  it("removeRecord does not mutate the input store", () => {
    const s = addRecord(emptyStore(), rec("a"));
    removeRecord(s, "a");
    expect(s.records).toHaveLength(1);
  });
```

Update the import at the top of the file to:

```ts
import { addRecord, updateRecord, removeRecord, findById, emptyStore } from "@/server/store";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/server.store.test.ts`
Expected: FAIL — `removeRecord is not a function` (or an import error).

- [ ] **Step 3: Implement `removeRecord`**

In `src/server/store.ts`, add directly after the `updateRecord` function (after line 31):

```ts
export function removeRecord(store: ContribStore, id: string): ContribStore {
  return { records: store.records.filter((r) => r.id !== id) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/server.store.test.ts`
Expected: PASS (all store cases, old + new).

- [ ] **Step 5: Commit**

```bash
git add src/server/store.ts test/server.store.test.ts
git commit -m "feat(web): removeRecord store helper"
```

---

### Task 2: `removeManifestMemory` + `removePublishedMemory` publish helpers

**Files:**
- Modify: `src/server/publish.ts` (add after `patchManifestMemoryTransform` / `patchPublishedTransform`, end of file)
- Test: `test/publish.removeMemory.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `test/publish.removeMemory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { removeManifestMemory } from "@/server/publish";

function manifest() {
  return {
    city: { name: "Wolfsburg", origin_lat: 52.4, origin_lon: 10.7 },
    memories: [
      { id: "mem-01", status: "approved", splat_url: "mem-01.sog", heading_deg: 0 },
      { id: "mem-02", status: "approved", splat_url: "mem-02.sog" },
    ],
  };
}

describe("removeManifestMemory", () => {
  it("drops the matching memory and reports found", () => {
    const { manifest: out, found } = removeManifestMemory(manifest(), "mem-01");
    expect(found).toBe(true);
    const ids = (out.memories as { id: string }[]).map((m) => m.id);
    expect(ids).toEqual(["mem-02"]);
  });

  it("preserves other memories and top-level fields", () => {
    const { manifest: out } = removeManifestMemory(manifest(), "mem-01");
    expect((out.city as { name: string }).name).toBe("Wolfsburg");
    const mems = out.memories as { id: string; splat_url: string }[];
    expect(mems[0].splat_url).toBe("mem-02.sog");
  });

  it("reports not found for an unknown id and changes nothing", () => {
    const { manifest: out, found } = removeManifestMemory(manifest(), "nope");
    expect(found).toBe(false);
    expect((out.memories as { id: string }[]).map((m) => m.id)).toEqual(["mem-01", "mem-02"]);
  });

  it("tolerates a manifest with no memories array", () => {
    const { found } = removeManifestMemory({ city: {} }, "mem-01");
    expect(found).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/publish.removeMemory.test.ts`
Expected: FAIL — `removeManifestMemory` is not exported.

- [ ] **Step 3: Implement both helpers**

In `src/server/publish.ts`, append at the end of the file (the `RawMemory` / `RawManifest` interfaces are already declared above `patchManifestMemoryTransform` — reuse them):

```ts
/**
 * Pure: remove one memory by id from a raw manifest, preserving every other
 * field. Mirrors patchManifestMemoryTransform. `found` is false when the id
 * isn't present.
 */
export function removeManifestMemory(
  raw: RawManifest,
  id: string,
): { manifest: RawManifest; found: boolean } {
  const memories = Array.isArray(raw.memories) ? (raw.memories as RawMemory[]) : [];
  const next = memories.filter((m) => m && m.id !== id);
  return { manifest: { ...raw, memories: next }, found: next.length !== memories.length };
}

/**
 * fs seam: remove a single memory from the published manifest. Returns false (so
 * the caller can 404) when the manifest is missing/unreadable or the id isn't in
 * it. Mirrors patchPublishedTransform.
 */
export async function removePublishedMemory(id: string): Promise<boolean> {
  const path = join(PUBLIC_MEMORIES_DIR, "manifest.json");
  let raw: RawManifest;
  try {
    raw = JSON.parse(await readFile(path, "utf8")) as RawManifest;
  } catch {
    return false;
  }
  const { manifest, found } = removeManifestMemory(raw, id);
  if (!found) return false;
  await writeFile(path, JSON.stringify(manifest, null, 2));
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/publish.removeMemory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/publish.ts test/publish.removeMemory.test.ts
git commit -m "feat(web): removeManifestMemory + removePublishedMemory helpers"
```

---

### Task 3: `assetFilesFor` + `deleteMemoryAssets`

**Files:**
- Create: `src/server/assets.ts`
- Test: `test/server.assets.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `test/server.assets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assetFilesFor } from "@/server/assets";

describe("assetFilesFor", () => {
  it("lists the splat, preview, thumbnail, and source ply for an id", () => {
    expect(assetFilesFor("mem-07-a56dbf82")).toEqual([
      "mem-07-a56dbf82.sog",
      "mem-07-a56dbf82.preview.ply",
      "mem-07-a56dbf82.jpg",
      "mem-07-a56dbf82.ply",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/server.assets.test.ts`
Expected: FAIL — cannot find module `@/server/assets`.

- [ ] **Step 3: Implement `assets.ts`**

Create `src/server/assets.ts`:

```ts
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { PUBLIC_MEMORIES_DIR } from "./paths";

/**
 * Pure: the public/memories asset filenames a memory id owns — the loaded splat
 * (.sog), the LOD ghost (.preview.ply), the thumbnail (.jpg), and the original
 * SHARP output (.ply). (The uploaded original under data/uploads is left as
 * provenance, not listed here.)
 */
export function assetFilesFor(id: string): string[] {
  return [`${id}.sog`, `${id}.preview.ply`, `${id}.jpg`, `${id}.ply`];
}

/** fs seam: unlink a memory's asset files, tolerating any that are absent. */
export async function deleteMemoryAssets(id: string): Promise<void> {
  await Promise.all(
    assetFilesFor(id).map(async (name) => {
      try {
        await unlink(join(PUBLIC_MEMORIES_DIR, name));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/server.assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/assets.ts test/server.assets.test.ts
git commit -m "feat(web): assetFilesFor + deleteMemoryAssets helpers"
```

---

### Task 4: `DELETE /api/memories/[id]` route

**Files:**
- Modify: `src/app/api/memories/[id]/route.ts` (add a `DELETE` export alongside the existing `GET`)

This is a route-handler seam (manual/integration-tested, like the rest of S3) — no Vitest case.

- [ ] **Step 1: Add the DELETE handler**

Replace the entire contents of `src/app/api/memories/[id]/route.ts` with:

```ts
import type { NextRequest } from "next/server";
import { loadStore, saveStore, removeRecord, findById } from "@/server/store";
import { publishManifest, removePublishedMemory } from "@/server/publish";
import { deleteMemoryAssets } from "@/server/assets";
import { CITY } from "@/config/explorer";

export const runtime = "nodejs";

// GET /api/memories/[id] — one record. Open (no auth). The map-placement PATCH
// was removed with the contribution page; edit-mode transform saves go through
// /api/memories/[id]/transform instead.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  const { id } = await ctx.params;
  const record = findById(await loadStore(), id);
  if (!record) return new Response("not found", { status: 404 });
  return Response.json({ record });
}

// DELETE /api/memories/[id] — remove a memory from the explorer and unlink its
// splat files. Mirrors the transform PATCH's store-vs-seed branching. Open (no
// auth), like the rest of S3.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  const { id } = await ctx.params;
  const store = await loadStore();
  const record = findById(store, id);

  if (record) {
    // Store-managed (S3-contributed) memory: the store is the source of truth.
    const next = removeRecord(store, id);
    await saveStore(next);
    if (record.status === "approved") {
      // It was in the published manifest — regenerate it without this record.
      await publishManifest(next, {
        name: CITY.name,
        origin_lat: CITY.origin_lat,
        origin_lon: CITY.origin_lon,
      });
    }
    await deleteMemoryAssets(id);
    return Response.json({ ok: true, id });
  }

  // Not in the store: a hand-authored seed that lives only in the published
  // manifest — remove it there directly.
  const removed = await removePublishedMemory(id);
  if (!removed) return new Response("not found", { status: 404 });
  await deleteMemoryAssets(id);
  return Response.json({ ok: true, id });
}
```

- [ ] **Step 2: Type-check the route**

Run: `npx tsc --noEmit`
Expected: no errors. (If `tsc` reports pre-existing unrelated errors, confirm none reference `route.ts`, `store.ts`, `publish.ts`, or `assets.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/memories/[id]/route.ts
git commit -m "feat(web): DELETE /api/memories/[id] route"
```

---

### Task 5: Delete button in the inspector

**Files:**
- Modify: `src/components/EditHud.tsx`
- Modify: `src/components/EditHud.module.css`

This is the presentational UI seam (verified in the manual browser smoke test) — no Vitest case.

- [ ] **Step 1: Add the danger button styles**

In `src/components/EditHud.module.css`, add after the `.btnGhost` block (after line 277):

```css
.btnDanger {
  padding: 8px 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--danger);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color 150ms var(--ease-out), border-color 150ms var(--ease-out),
    background 150ms var(--ease-out);
}
.btnDanger:hover:not(:disabled) {
  background: var(--danger);
  color: #fff;
}
.btnDanger:disabled {
  opacity: 0.6;
  cursor: default;
}

/* Confirm-delete row: the danger button expands to a confirm/cancel pair. */
.confirmRow {
  display: flex;
  gap: 8px;
  align-items: center;
}
.confirmLabel {
  flex: 1;
  font-size: 12px;
  color: var(--danger);
}
```

- [ ] **Step 2: Extend the EditHud props and add the confirm state**

In `src/components/EditHud.tsx`, add the three new props to the destructured signature and the prop type. Change the function parameter list (around lines 21-45) so it includes `onDelete`, `deleting`, and `deleteError`:

```tsx
export default function EditHud({
  transform,
  onEditTransform,
  onSave,
  saving,
  saveError,
  savedAt,
  selectedLabel,
  hint,
  shortcuts,
  onDeselect,
  onExit,
  onDelete,
  deleting,
  deleteError,
}: {
  transform: StoredTransform | null;
  onEditTransform?: (next: StoredTransform) => void;
  onSave: () => void;
  saving: boolean;
  saveError?: string | null;
  savedAt?: number | null;
  selectedLabel?: string | null;
  hint?: string | null;
  shortcuts?: Shortcut[];
  onDeselect?: () => void;
  onExit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  deleteError?: string | null;
}) {
```

- [ ] **Step 3: Add the confirm state hook**

`EditHud` already imports `useState` from React (line 3). Inside the component body, just before the `setPosition` helper (after the opening `{` of the function, ~line 46), add:

```tsx
  // Two-step delete: first click arms the confirm, second click fires onDelete.
  // Reset whenever the selected memory changes so a new selection starts safe.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    setConfirmingDelete(false);
  }, [selectedLabel]);
```

- [ ] **Step 4: Render the delete control in the actions area**

In `src/components/EditHud.tsx`, replace the existing actions block (the `<div className={styles.actions}>…</div>` at lines 130-139) with:

```tsx
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save placement"}
            </button>
            {onDeselect && (
              <button className={styles.btnGhost} onClick={onDeselect}>
                Deselect
              </button>
            )}
          </div>

          {onDelete &&
            (confirmingDelete ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Delete this memory?</span>
                <button
                  className={styles.btnDanger}
                  onClick={onDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
                <button
                  className={styles.btnGhost}
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button className={styles.btnDanger} onClick={() => setConfirmingDelete(true)}>
                Delete memory
              </button>
            ))}
```

- [ ] **Step 5: Surface the delete error in the status line**

In `src/components/EditHud.tsx`, the status line currently passes `saveError` into `StatusLine`. Change the `StatusLine` usage (line 141) to prefer a delete error:

```tsx
          <StatusLine savedAt={savedAt} saveError={deleteError ?? saveError} selectedLabel={selectedLabel} />
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `EditHud.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/EditHud.tsx src/components/EditHud.module.css
git commit -m "feat(web): delete button with inline confirm in inspector"
```

---

### Task 6: Wire delete into `SplatWorld`

**Files:**
- Modify: `src/components/SplatWorld.tsx`

This is the container wiring (verified in the manual browser smoke test) — no Vitest case.

- [ ] **Step 1: Add delete state next to the save state**

In `src/components/SplatWorld.tsx`, after the save-state declarations (after line 60, `const [savedAt, setSavedAt] = useState<number | null>(null);`), add:

```tsx
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```

- [ ] **Step 2: Add the `deleteMemory` handler**

In `src/components/SplatWorld.tsx`, add immediately after the `saveTransform` function (after line 173, the closing `}` of `saveTransform`):

```tsx
  async function deleteMemory() {
    if (!selectedId) return;
    const id = selectedId;
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      // Gone server-side: clear selection, drop any in-session edit overlay for
      // it, and refetch the manifest so it disappears and its SplatMesh disposes.
      setSelectedId(null);
      setLiveTransform(null);
      setEdits((e) => {
        const { [id]: _removed, ...rest } = e;
        void _removed;
        return rest;
      });
      setManifestVersion((v) => v + 1);
    } catch (e) {
      setDeleteError(String((e as Error).message ?? e));
    } finally {
      setDeleting(false);
    }
  }
```

- [ ] **Step 3: Pass the new props to `EditHud`**

In `src/components/SplatWorld.tsx`, in the `<EditHud .../>` element (lines 215-227), add the three delete props. The element should read:

```tsx
          <EditHud
            transform={liveTransform}
            onEditTransform={applyEdit}
            onSave={saveTransform}
            saving={saving}
            saveError={saveError}
            savedAt={savedAt}
            selectedLabel={selectedId}
            hint={selectedId ? "Loading memory…" : "Click a memory to select it."}
            shortcuts={EDIT_SHORTCUTS}
            onDeselect={() => setSelectedId(null)}
            onExit={exitEdit}
            onDelete={selectedId ? deleteMemory : undefined}
            deleting={deleting}
            deleteError={deleteError}
          />
```

- [ ] **Step 4: Clear the delete error on exit**

In `src/components/SplatWorld.tsx`, update the `exitEdit` callback (lines 111-116) to also clear the delete error so a stale message doesn't linger after leaving edit mode:

```tsx
  const exitEdit = useCallback(() => {
    setEditMode(false);
    setSelectedId(null);
    setLiveTransform(null);
    setSaveError(null);
    setDeleteError(null);
  }, []);
```

No further change is needed for selection changes: `deleteMemory` clears `deleteError` itself before each attempt, and `EditHud` resets its own confirm state when the selection changes.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `SplatWorld.tsx`.

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — all prior specs plus the three new ones (store, publish.removeMemory, server.assets).

- [ ] **Step 7: Commit**

```bash
git add src/components/SplatWorld.tsx
git commit -m "feat(web): wire memory delete into the explorer edit mode"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Production build**

Run from `web/`: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 2: Serve and verify**

Run: `npm run start`, open `http://localhost:3000`.

Verify, in order:
1. Press `E` to enter edit mode; click a **seed** memory (e.g. `mem-02`). The inspector shows the transform fields and a red **Delete memory** button.
2. Click **Delete memory** → it becomes **Delete this memory? · Confirm · Cancel**. Click **Cancel** → reverts to the single button (nothing deleted).
3. Click **Delete memory** → **Confirm**. The splat vanishes from the void, the inspector returns to the empty "Click a memory" state, and `web/public/memories/manifest.json` no longer lists that id. Its `.sog`/`.jpg` (and `.ply`/`.preview.ply` if present) are gone from `web/public/memories/`.
4. Repeat for a **store-managed** memory if one is present in `web/data/memories.json` (status `approved`) — confirm it's removed from the store JSON and the manifest, and its files are gone.
5. Confirm the public fly-through (press `E` to exit edit mode) renders the remaining memories normally.

- [ ] **Step 3: Note completion**

No commit (verification only). If any step fails, use superpowers:systematic-debugging before patching.

---

## Self-Review Notes

- **Spec coverage:** store-managed delete + republish (Task 4), seed-only delete (Tasks 2, 4), disk-file unlink (Tasks 3, 4), two-step inline confirm UI (Task 5), client refetch + selection clear (Task 6), 404 when absent (Task 4), pure-helper unit tests (Tasks 1-3), manual prod-build verification (Task 7). All spec sections covered.
- **Type consistency:** `removeRecord(store, id)`, `removeManifestMemory(raw, id)`, `removePublishedMemory(id)`, `deleteMemoryAssets(id)`, `assetFilesFor(id)` used identically across tasks. `EditHud` props `onDelete`/`deleting`/`deleteError` defined in Task 5 and supplied in Task 6.
- **Out of scope (per spec):** pending (not-yet-reconstructed) memories aren't selectable, so no delete path for them; uploaded originals in `data/uploads/` are intentionally left.
