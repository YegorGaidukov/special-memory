# Auto-reconstruct on drop (decoupled watcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dropping a photo on the explorer auto-starts reconstruction in the background (while the curator places the pin); the placement page advances `processing → ready` (or `failed`) on its own and unlocks the 3D editor without a manual ingest step.

**Architecture:** Keep SHARP out of the web process. The web side only tracks status: the upload route marks new records `processing`, and a new `fail` endpoint records errors. A new Python **watcher** (`python -m pipeline.watch`), started by the curator on the GPU box in the conda `sharp` env, polls the recon inbox, runs `reconstruct()` + `convert-splats`, drops assets into `public/memories`, then calls the existing `ingest` endpoint (success) or the new `fail` endpoint (error). The placement page polls the record while processing.

**Tech Stack:** Next.js 16 Route Handlers + React (web, TypeScript, Vitest); Python pipeline (`pipeline/`, pytest in the repo `.venv`); Node `convert-splats` script invoked by the watcher.

---

## File Structure

**Web (TypeScript)**
- `web/src/server/types.ts` — add server-only `error?: string` to `ContribRecord`.
- `web/src/app/api/memories/route.ts` — new records get `status: "processing"`.
- `web/src/app/api/memories/[id]/fail/route.ts` — **new** failure callback (uses `updateRecord`).
- `web/src/app/contribute/[id]/page.tsx` — poll while processing; processing/failed copy; rewrite stale post-save note.
- `web/test/server.store.test.ts` — add a `updateRecord` case for the `failed` + `error` patch.

**Pipeline (Python)**
- `pipeline/watch.py` — **new** poll loop: `select_pending` (pure) + `process_one` (injectable seams) + `scan_inbox`/`ready_stems`/`main`.
- `tests/test_watch.py` — **new** pytest for `select_pending` and `process_one`.

**Docs**
- `CLAUDE.md` — S3 section + Commands: drop auto-triggers recon; run `python -m pipeline.watch`.
- `web/README.md` — contribution flow auto-reconstructs; how to start the watcher.

**Convention note:** Per `CLAUDE.md`, **Route Handlers are the manual/seam-tested boundary** — we do not unit-test the route bodies or the React page. We TDD the pure/injectable logic (`updateRecord` patch in Vitest; `select_pending` + `process_one` in pytest) and verify the seams via the manual smoke test + production build. SHARP/Node/HTTP are mocked in tests, mirroring S1's GPU-behind-`run_sharp` convention.

---

## Task 1: `error` field + fail endpoint (web)

**Files:**
- Modify: `web/src/server/types.ts`
- Test: `web/test/server.store.test.ts`
- Create: `web/src/app/api/memories/[id]/fail/route.ts`

- [ ] **Step 1: Add the `error` field to the record type**

In `web/src/server/types.ts`, extend `ContribRecord`:

```typescript
export interface ContribRecord extends MemoryRecord {
  /** Filename of the stored original under UPLOADS_DIR (provenance + re-runs). */
  source_image: string;
  /** Last reconstruction error, set when status is "failed" (watcher callback). */
  error?: string;
}
```

- [ ] **Step 2: Write the failing test for the `failed` patch**

Add to `web/test/server.store.test.ts` (inside the `describe("store ops", ...)` block):

```typescript
it("updateRecord can mark a record failed with an error message", () => {
  const s = addRecord(emptyStore(), rec("a"));
  const s2 = updateRecord(s, "a", { status: "failed", error: "sharp exploded" });
  expect(findById(s2, "a")?.status).toBe("failed");
  expect(findById(s2, "a")?.error).toBe("sharp exploded");
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd web && npx vitest run test/server.store.test.ts`
Expected: PASS (the `error` field added in Step 1 makes the patch type-check; `updateRecord` already merges arbitrary `Partial<ContribRecord>`). If TypeScript errors on `error`, Step 1 is incomplete.

> Note: `updateRecord` already exists and is generic over the patch, so this test confirms the new field flows through. It is RED-able by reverting Step 1 (the `error` property would be a type error).

- [ ] **Step 4: Create the fail route**

Create `web/src/app/api/memories/[id]/fail/route.ts`:

```typescript
import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";

export const runtime = "nodejs";

// POST /api/memories/[id]/fail — the GPU watcher reports a reconstruction failure.
// Sets status "failed" and stores the error message. Open (no auth).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/memories/[id]/fail">) {
  const { id } = await ctx.params;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  let error = "reconstruction failed";
  try {
    const body = await req.json();
    if (body && typeof body.error === "string") error = body.error;
  } catch {
    // empty/invalid body → keep the default message
  }

  const next = updateRecord(store, id, { status: "failed", error });
  await saveStore(next);
  return Response.json({ record: findById(next, id) });
}
```

- [ ] **Step 5: Type-check the new route compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (`RouteContext<"/api/memories/[id]/fail">` is generated by Next's typed routes once the file exists; if tsc can't find it, run `npx next build` once to regenerate route types, then re-run.)

- [ ] **Step 6: Commit**

```bash
git add web/src/server/types.ts web/test/server.store.test.ts "web/src/app/api/memories/[id]/fail/route.ts"
git commit -m "feat(s3): fail endpoint + error field for reconstruction failures"
```

---

## Task 2: Upload marks new records `processing` (web)

**Files:**
- Modify: `web/src/app/api/memories/route.ts`

This is a Route Handler seam change (no unit test, per convention) — a single status literal plus a comment.

- [ ] **Step 1: Change the initial status**

In `web/src/app/api/memories/route.ts`, in the `POST` handler's record object, change:

```typescript
    id,
    status: "uploaded",
```

to:

```typescript
    id,
    // Reconstruction is auto-triggered (the GPU watcher picks the inbox copy up),
    // so a fresh upload is already "processing", not merely "uploaded".
    status: "processing",
```

- [ ] **Step 2: Update the POST comment block**

Directly above `export async function POST`, change the existing comment's final clause from `creates an `uploaded` record` to `creates a `processing` record (the watcher takes it from here)`. Full comment:

```typescript
// POST /api/memories — multipart upload. Saves the original, copies it to the
// recon inbox for the GPU watcher's SHARP run, parses EXIF for an initial
// placement, and creates a `processing` record (the watcher takes it from here).
// Open (no auth).
```

- [ ] **Step 3: Verify the suite still passes (no test asserted "uploaded")**

Run: `cd web && npx vitest run`
Expected: all pass. (No existing spec asserts the upload route's literal; `server.store.test.ts`'s `rec()` helper still uses `"uploaded"`, which remains a valid status — leave it.)

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/memories/route.ts
git commit -m "feat(s3): uploads start as processing (auto-reconstruct)"
```

---

## Task 3: Placement page polls + reflects processing/failed (web)

**Files:**
- Modify: `web/src/app/contribute/[id]/page.tsx`

UI seam (manual-verified). Three changes: a poll effect, the locked-slot copy, and the post-save note.

- [ ] **Step 1: Add a polling effect**

In `web/src/app/contribute/[id]/page.tsx`, immediately after the existing initial-fetch `useEffect` (the one ending `}, [id]);`), add:

```typescript
  // While reconstruction is in flight, poll so the page advances to "ready"
  // (3D editor unlocks) or "failed" without a manual refresh.
  useEffect(() => {
    const status = record?.status;
    if (status !== "processing" && status !== "uploaded") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/memories/${id}`);
      if (r.ok) {
        const d = await r.json();
        setRecord(d.record);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [id, record?.status]);
```

- [ ] **Step 2: Replace the locked-slot copy with processing/failed states**

Find the `else` branch of the `record.status === "ready" || record.status === "approved"` block:

```tsx
      ) : (
        <p className={styles.locked}>
          3D placement unlocks once the splat is ingested (status “ready”).
        </p>
      )}
```

Replace it with:

```tsx
      ) : record.status === "failed" ? (
        <p className={styles.locked}>
          Reconstruction failed{record.error ? `: ${record.error}` : ""}. Re-drop the
          photo on the explorer to try again.
        </p>
      ) : (
        <p className={styles.locked}>
          Reconstructing your memory… the 3D editor unlocks automatically when it’s ready.
        </p>
      )}
```

- [ ] **Step 3: Rewrite the stale post-save note**

Replace the entire `{done && ( … )}` block:

```tsx
      {done && (
        <div className={styles.note}>
          <span className={styles.noteTitle}>✓ Saved</span>
          <span>
            Next: run SHARP on the inbox image, drop <code className={styles.code}>{record.id}.sog</code>{" "}
            into public/memories, then ingest + approve in{" "}
            <button className={styles.link} onClick={() => router.push("/admin")}>
              the review queue
            </button>
            .
          </span>
        </div>
      )}
```

with:

```tsx
      {done && (
        <div className={styles.note}>
          <span className={styles.noteTitle}>✓ Placement saved</span>
          <span>
            Reconstruction runs automatically — this page unlocks the 3D fine-tune once
            the splat is ready. You can also review everything in{" "}
            <button className={styles.link} onClick={() => router.push("/admin")}>
              the review queue
            </button>
            .
          </span>
        </div>
      )}
```

- [ ] **Step 4: Lint + type-check the page**

Run: `cd web && npx eslint src/app/contribute/[id]/page.tsx && npx tsc --noEmit`
Expected: no new errors. (`record.error` is valid after Task 1.)

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/contribute/[id]/page.tsx"
git commit -m "feat(s3): placement page polls and shows processing/failed state"
```

---

## Task 4: Watcher `select_pending` (pipeline, TDD)

**Files:**
- Create: `pipeline/watch.py`
- Test: `tests/test_watch.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_watch.py`:

```python
from pipeline.watch import select_pending


def test_select_pending_filters_ready_and_in_flight():
    assert select_pending({"a", "b", "c"}, {"a"}, {"b"}) == ["c"]


def test_select_pending_empty_when_all_ready():
    assert select_pending({"a"}, {"a"}, set()) == []


def test_select_pending_empty_inbox():
    assert select_pending(set(), set(), set()) == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_watch.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.watch'`.

- [ ] **Step 3: Write the minimal watcher with `select_pending`**

Create `pipeline/watch.py`:

```python
"""Inbox watcher: turn dropped photos into web-ready splats, automatically.

Runs on the GPU box in the conda `sharp` env (it reuses pipeline.reconstruct).
Polls RECON_INBOX; for each image with no <id>.sog in public/memories yet, runs
SHARP + convert-splats, drops the assets into public/memories, and calls the web
API to flip the record to `ready` (or `failed`). The web process never runs SHARP
— this is the decoupled GPU-side half.

Usage (in the `sharp` env):
    python -m pipeline.watch

Config via env:
    WEB_BASE_URL        default http://localhost:3000
    WATCH_INTERVAL_SEC  default 3
    RECON_INBOX         default <repo>/web/data/inbox
    PUBLIC_MEMORIES_DIR default <repo>/web/public/memories
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

from pipeline.cli import reconstruct
from pipeline.manifest import IMAGE_EXTS

REPO_ROOT = Path(__file__).resolve().parent.parent
CONVERT_SCRIPT = REPO_ROOT / "web" / "scripts" / "convert-splats.mjs"


def select_pending(inbox_stems, ready, in_flight):
    """Inbox stems with no produced .sog yet and not already being processed."""
    return [s for s in sorted(inbox_stems) if s not in ready and s not in in_flight]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_watch.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/watch.py tests/test_watch.py
git commit -m "feat(s1): watcher select_pending (inbox scan logic)"
```

---

## Task 5: Watcher `process_one` + scan + loop (pipeline, TDD)

**Files:**
- Modify: `pipeline/watch.py`
- Test: `tests/test_watch.py`

- [ ] **Step 1: Write the failing tests for `process_one`**

Append to `tests/test_watch.py`:

```python
from pathlib import Path
from pipeline.watch import process_one


def test_process_one_success(tmp_path):
    public = tmp_path / "public"; public.mkdir()
    inbox = tmp_path / "inbox"; inbox.mkdir()
    img = inbox / "mem-1.jpg"; img.write_bytes(b"jpeg")

    def fake_reconstruct(in_dir, out_dir):
        (Path(out_dir) / "splats").mkdir(parents=True)
        (Path(out_dir) / "splats" / "mem-1.ply").write_text("ply")
        (Path(out_dir) / "thumbs").mkdir(parents=True)
        (Path(out_dir) / "thumbs" / "mem-1.jpg").write_text("thumb")

    def fake_convert(splats_dir, public_dir):
        (Path(public_dir) / "mem-1.sog").write_text("sog")

    readied, failed = [], []
    process_one(
        "mem-1", img,
        public_dir=public, inbox=inbox, base_url="http://x",
        reconstruct=fake_reconstruct, convert=fake_convert,
        on_ready=lambda i: readied.append(i),
        on_fail=lambda i, e: failed.append((i, e)),
    )

    assert (public / "mem-1.sog").exists()
    assert (public / "mem-1.jpg").exists()
    assert readied == ["mem-1"]
    assert failed == []
    assert img.exists()  # left in place on success


def test_process_one_failure_quarantines_and_reports(tmp_path):
    public = tmp_path / "public"; public.mkdir()
    inbox = tmp_path / "inbox"; inbox.mkdir()
    img = inbox / "mem-2.jpg"; img.write_bytes(b"jpeg")

    def boom(in_dir, out_dir):
        raise RuntimeError("sharp exploded")

    readied, failed = [], []
    process_one(
        "mem-2", img,
        public_dir=public, inbox=inbox, base_url="http://x",
        reconstruct=boom, convert=lambda a, b: None,
        on_ready=lambda i: readied.append(i),
        on_fail=lambda i, e: failed.append((i, e)),
    )

    assert readied == []
    assert failed and failed[0][0] == "mem-2"
    assert "sharp exploded" in failed[0][1]
    assert not img.exists()                          # moved out of the inbox
    assert (inbox / "failed" / "mem-2.jpg").exists()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_watch.py -v`
Expected: FAIL — `ImportError: cannot import name 'process_one'`.

- [ ] **Step 3: Implement `process_one` + helpers + `main`**

Append to `pipeline/watch.py`:

```python
def scan_inbox(inbox):
    """Map stem -> image path for top-level images in the inbox (skips failed/)."""
    inbox = Path(inbox)
    if not inbox.exists():
        return {}
    return {
        p.stem: p
        for p in sorted(inbox.iterdir())
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    }


def ready_stems(public_dir):
    """Stems already reconstructed (a <stem>.sog exists in public/memories)."""
    public_dir = Path(public_dir)
    if not public_dir.exists():
        return set()
    return {p.stem for p in public_dir.iterdir() if p.suffix.lower() == ".sog"}


def run_convert(splats_dir, public_dir):
    """Invoke the Node convert-splats step (.ply -> .sog + .preview.ply)."""
    subprocess.run(
        ["node", str(CONVERT_SCRIPT), str(splats_dir), str(public_dir)],
        check=True,
    )


def post_json(url, payload=None):
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(
        url, data=data, method="POST", headers={"content-type": "application/json"}
    )
    urllib.request.urlopen(req, timeout=15).close()


def notify_ready(base_url, id):
    post_json(f"{base_url}/api/memories/{id}/ingest")


def notify_fail(base_url, id, error):
    post_json(f"{base_url}/api/memories/{id}/fail", {"error": error})


def move_to_failed(image_path, inbox):
    failed = Path(inbox) / "failed"
    failed.mkdir(parents=True, exist_ok=True)
    shutil.move(str(image_path), str(failed / Path(image_path).name))


def process_one(
    id,
    image_path,
    *,
    public_dir,
    inbox,
    base_url,
    reconstruct=reconstruct,
    convert=run_convert,
    on_ready=None,
    on_fail=None,
):
    """Reconstruct one image into public_dir and signal the web API. The SHARP run,
    the convert step, and the HTTP callbacks are injected so this is unit-testable
    without a GPU, Node, or a running server."""
    on_ready = on_ready or (lambda i: notify_ready(base_url, i))
    on_fail = on_fail or (lambda i, e: notify_fail(base_url, i, e))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            in_dir = Path(tmp) / "in"
            in_dir.mkdir()
            shutil.copy(str(image_path), str(in_dir / Path(image_path).name))
            out_dir = Path(tmp) / "out"
            reconstruct(in_dir, out_dir)
            convert(out_dir / "splats", public_dir)
            shutil.copy(
                str(out_dir / "thumbs" / f"{id}.jpg"),
                str(Path(public_dir) / f"{id}.jpg"),
            )
        on_ready(id)
    except Exception as e:  # GPU/convert/copy failure -> mark failed, quarantine input
        on_fail(id, str(e))
        move_to_failed(image_path, inbox)


def main():
    base_url = os.environ.get("WEB_BASE_URL", "http://localhost:3000")
    interval = float(os.environ.get("WATCH_INTERVAL_SEC", "3"))
    inbox = Path(os.environ.get("RECON_INBOX") or REPO_ROOT / "web" / "data" / "inbox")
    public_dir = Path(
        os.environ.get("PUBLIC_MEMORIES_DIR") or REPO_ROOT / "web" / "public" / "memories"
    )
    public_dir.mkdir(parents=True, exist_ok=True)
    print(f"[watch] inbox={inbox} public={public_dir} api={base_url} every {interval}s")
    while True:
        images = scan_inbox(inbox)
        pending = select_pending(set(images), ready_stems(public_dir), set())
        for id in pending:
            print(f"[watch] reconstructing {id} …")
            process_one(id, images[id], public_dir=public_dir, inbox=inbox, base_url=base_url)
        time.sleep(interval)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_watch.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full pytest suite (no regressions)**

Run: `.\.venv\Scripts\python.exe -m pytest`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/watch.py tests/test_watch.py
git commit -m "feat(s1): watcher process_one + inbox poll loop (python -m pipeline.watch)"
```

---

## Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `web/README.md`

- [ ] **Step 1: Update the S3 description in `CLAUDE.md`**

In `CLAUDE.md`, in the **S3 — Contribution** bullet, replace the sentence:

```
**SHARP stays
  out of the web process** — the bridge is the filesystem: upload copies the image to `RECON_INBOX`,
  the curator runs `python -m pipeline` + `npm run convert-splats` **manually** on the GPU box and
  drops `<id>.sog` into `public/memories/`, then `ingest` scans for it and flips the record to
  `ready`.
```

with:

```
**SHARP stays
  out of the web process** — the bridge is the filesystem: a drop copies the image to `RECON_INBOX`
  and marks the record `processing`, then a **watcher the curator runs on the GPU box**
  (`python -m pipeline.watch`, in the `sharp` env) reconstructs it, runs `convert-splats`, drops
  `<id>.sog` into `public/memories/`, and calls the `ingest` API to flip the record to `ready`
  (or the `fail` API on error). The web process still never runs SHARP.
```

- [ ] **Step 2: Add the watcher command to `CLAUDE.md` Commands**

In the `## Commands` section, after the `python -m pipeline -i samples\input -o samples\output` block's fenced example, add a new line inside that same powershell fence (before the `# Run SHARP directly` comment):

```powershell
# Auto-reconstruct dropped photos: watch the web inbox and process new uploads
# (run on the GPU box, in the `sharp` env; needs the web app running for the callbacks)
python -m pipeline.watch
```

- [ ] **Step 3: Update `web/README.md` contribution flow**

In `web/README.md`, find the contribution-flow description that says uploads are reconstructed manually (the curator runs SHARP + ingest). Replace the relevant sentence(s) with:

```
Dropping a photo on the explorer auto-starts reconstruction: the upload is marked
`processing`, and the GPU-side watcher (`python -m pipeline.watch`, started by the
curator in the conda `sharp` env) reconstructs it, converts it to `.sog`, drops the
assets into `public/memories/`, and calls the `ingest` API so the placement page
unlocks the 3D editor automatically. On error the watcher calls the `fail` API and
moves the image to `data/inbox/failed/`; re-drop the photo to retry.
```

> If `web/README.md` has no such sentence (search for "ingest" / "convert-splats" / "manually"), add the paragraph above under the contribution/S3 section heading instead.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md web/README.md
git commit -m "docs(s1/s3): document auto-reconstruct watcher (python -m pipeline.watch)"
```

---

## Task 7: Full verification

- [ ] **Step 1: Web unit tests**

Run: `cd web && npx vitest run`
Expected: all pass (including the new `updateRecord` failed-patch case).

- [ ] **Step 2: Python unit tests**

Run: `.\.venv\Scripts\python.exe -m pytest`
Expected: all pass (including `tests/test_watch.py`, 5 tests).

- [ ] **Step 3: Production build (web)**

Run: `cd web && npm run build`
Expected: compiles; route table lists `ƒ /api/memories/[id]/fail` alongside the existing routes.

- [ ] **Step 4: Manual smoke test (records the seam behavior)**

Do NOT automate. With the web app running (`npm run dev` or `npm run start`) and the watcher started in the `sharp` env (`python -m pipeline.watch`):
1. Drop a real city photo on the explorer → redirected to `/contribute/<id>`; the locked slot shows "Reconstructing your memory…".
2. Within a few seconds (watcher: SHARP ~8s + convert), the record flips to `ready` and the 3D editor appears **without a refresh**; `<id>.sog`/`<id>.preview.ply`/`<id>.jpg` are in `web/public/memories/`.
3. Drop a corrupt/non-photo-but-image file that SHARP rejects → record flips to `failed` with the error; the image is in `web/data/inbox/failed/`; re-dropping a good photo recovers.

- [ ] **Step 5: Final commit (if any docs/cleanup remain)**

```bash
git add -A
git commit -m "chore(s3): finalize auto-reconstruct on drop" || echo "nothing to commit"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** processing-on-upload (Task 2), fail endpoint + `error` field (Task 1), placement polling + processing/failed copy (Task 3), watcher with `select_pending`/`process_one`/`scan`/`main` calling ingest+fail and quarantining failures (Tasks 4–5), docs (Task 6), tests across both suites (Tasks 1/4/5/7).
- **Spec deviation (intentional, DRY):** the spec named a `markFailed(store,id,error)` helper; the plan uses the existing generic `updateRecord(store, id, { status:"failed", error })` instead (the `ingest` route uses `updateRecord` the same way), so no redundant helper is added. The behavior and the tested patch are identical.
- **Type consistency:** `error?: string` on `ContribRecord` (Task 1) is consumed by the fail route (Task 1) and the page (Task 3); `select_pending`/`process_one` signatures in Tasks 4–5 match their tests; watcher asset names (`<id>.sog`, `<id>.preview.ply`, `<id>.jpg`) match `expectedAssets` in `server/ingest.ts`.
- **Convention:** Route Handlers + React page are the manual/seam-tested boundary (per `CLAUDE.md`); GPU/Node/HTTP are mocked in tests (per S1's `run_sharp` seam).
