# /m Add iPhone Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six iPhone issues in the `/m` Add flow per the spec
`docs/superpowers/specs/2026-07-01-m-add-iphone-fixes-design.md`: WebGL shadow morph, EXIF
date prefill (+ backend priority flip), feathered photo edge, optimistic "Memory added",
remove "Choose another photo", surface Narrate errors.

**Architecture:** Pure logic goes in `web/src/lib/**` (Vitest, tests in `web/test/`) and
`backend/exifdata.py` (pytest); the WebGL canvas, `exifr` binary parse, and MediaRecorder
stay un-unit-tested seams. UI wiring lives in `web/src/app/m/AddMemory.tsx`,
`ShadowField.tsx`, `useAudioRecorder.ts`, `mobile.module.css`.

**Tech Stack:** Next.js (App Router, static export), React, raw WebGL1 (no new deps),
`exifr` (already a dependency), FastAPI + Pillow, Vitest, pytest.

## Global Constraints

- Work directly on `main` (user preference; no feature branch).
- Icons only from `@untitledui/icons`; no inline SVG icons (the shadow-field SVG/canvas is scenery, not an icon — exempt).
- Web unit tests: `web/test/<area>.<name>.test.ts`, plain `node` environment, run with `npm test` from `web/`.
- Backend tests: `.\.venv\Scripts\python.exe -m pytest` from the repo root.
- Verify web changes on a **production build** (`npm run build`), never dev/HMR.
- No `Math.random()` in the shadow field — keep the seeded `mulberry32`.
- Commit after every task.

---

### Task 1: Feathered photo edge + remove "Choose another photo"

Pure CSS/JSX; no unit tests (visual seam).

**Files:**
- Modify: `web/src/app/m/mobile.module.css` (`.photoWell` ~line 161, `.photoImg` ~line 169, `.addSecondary` ~line 340)
- Modify: `web/src/app/m/AddMemory.tsx` (bottom button, ~line 161)

**Interfaces:** none (leaf task).

- [ ] **Step 1: Fix the feather mask**

In `mobile.module.css`, the mask gradient sizes to *farthest-corner* (~127 px for the
180 px box) so alpha is still ~65% where `border-radius: 50%` clips at 90 px — a hard rim.
Replace both rules:

```css
.photoWell {
  position: absolute;
  inset: 0;
  /* closest-side: the fade reaches full transparency exactly at the circle edge —
     no border-radius clip, so the edge is a true feather. */
  -webkit-mask: radial-gradient(circle closest-side, #000 55%, transparent 100%);
  mask: radial-gradient(circle closest-side, #000 55%, transparent 100%);
  background-color: rgb(var(--ink) / 0.1);
}
.photoImg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  -webkit-mask: radial-gradient(circle closest-side, #000 55%, transparent 100%);
  mask: radial-gradient(circle closest-side, #000 55%, transparent 100%);
}
```

(Only the mask lines and the removal of `border-radius: 50%` change.)

- [ ] **Step 2: Remove the "Choose another photo" button**

In `AddMemory.tsx` delete:

```tsx
      <button className={styles.addSecondary} onClick={() => photoInput.current?.click()}>
        Choose another photo
      </button>
```

The photo circle already re-opens the picker (`aria-label="Change photo"`).

- [ ] **Step 3: Delete the now-unused `.addSecondary` rule** from `mobile.module.css`
(also drop the "Choose another photo" mention in the `.addContent` comment ~line 139).

- [ ] **Step 4: Verify build**

Run from `web/`: `npm run build`
Expected: compiles with no errors (unused-CSS is not an error, but the rule must be gone).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/m/mobile.module.css web/src/app/m/AddMemory.tsx
git commit -m "fix(web/m): true feathered photo edge; tap circle replaces 'choose another photo'"
```

---

### Task 2: EXIF capture-date prefill (client)

**Files:**
- Create: `web/src/lib/exif/captureDate.ts`
- Test: `web/test/exif.captureDate.test.ts`
- Modify: `web/src/app/m/AddMemory.tsx` (the `choose` callback)

**Interfaces:**
- Consumes: `toIso(year, month0, day)` from `@/lib/date/calendar`.
- Produces: `captureIsoDay(raw: unknown): string | null` — ISO day `YYYY-MM-DD` from an
  exifr-parsed object's `DateTimeOriginal`, or `null`.

- [ ] **Step 1: Write the failing test** — `web/test/exif.captureDate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { captureIsoDay } from "@/lib/exif/captureDate";

describe("captureIsoDay", () => {
  it("maps DateTimeOriginal to a local ISO day", () => {
    // exifr parses EXIF's zone-less "2026:04:27 14:03:00" as a local Date; the day
    // the camera recorded is the local calendar day, so read local components.
    const raw = { DateTimeOriginal: new Date(2026, 3, 27, 14, 3, 0) };
    expect(captureIsoDay(raw)).toBe("2026-04-27");
  });

  it("pads month and day", () => {
    expect(captureIsoDay({ DateTimeOriginal: new Date(2026, 0, 5) })).toBe("2026-01-05");
  });

  it("returns null for missing/invalid values", () => {
    expect(captureIsoDay(undefined)).toBeNull();
    expect(captureIsoDay(null)).toBeNull();
    expect(captureIsoDay({})).toBeNull();
    expect(captureIsoDay({ DateTimeOriginal: "2026:04:27" })).toBeNull();
    expect(captureIsoDay({ DateTimeOriginal: new Date(NaN) })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `web/`: `npm test -- exif.captureDate`
Expected: FAIL — cannot resolve `@/lib/exif/captureDate`.

- [ ] **Step 3: Implement** — `web/src/lib/exif/captureDate.ts`:

```ts
import { toIso } from "@/lib/date/calendar";

/**
 * ISO day (YYYY-MM-DD) for the Add screen's date prefill, from an exifr-parsed
 * object's `DateTimeOriginal`. EXIF datetimes carry no zone, so exifr yields a
 * local-time Date — the local calendar day is the day the camera recorded.
 */
export function captureIsoDay(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const when = (raw as Record<string, unknown>).DateTimeOriginal;
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) return null;
  return toIso(when.getFullYear(), when.getMonth(), when.getDate());
}
```

- [ ] **Step 4: Run the test — PASS** (`npm test -- exif.captureDate`)

- [ ] **Step 5: Wire the prefill into `AddMemory.tsx`**

Add imports and a pick-sequence ref (guards against an older photo's slow EXIF parse
landing after a newer pick):

```ts
import { captureIsoDay } from "@/lib/exif/captureDate";
```

```ts
  const pickSeq = useRef(0);
```

Replace the `choose` callback body so every new photo resets the date and prefills it
from EXIF when present (the date belongs to the photo; `exifr` is dynamically imported so
the page load stays light):

```ts
  const choose = useCallback((files: FileList | null) => {
    if (!files) return;
    const picked = pickImage(files);
    if ("error" in picked) {
      setError(picked.error);
      return;
    }
    setFile(picked.file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked.file);
    });
    setError(null);
    setDate("");
    const seq = ++pickSeq.current;
    void (async () => {
      try {
        const exifr = (await import("exifr")).default;
        const raw: unknown = await exifr.parse(picked.file, ["DateTimeOriginal"]);
        const day = captureIsoDay(raw);
        if (day && pickSeq.current === seq) setDate(day);
      } catch {
        // No/unreadable EXIF (iOS sometimes strips it converting HEIC) — manual date remains.
      }
    })();
  }, []);
```

(Note: the old `setStatus("error")` / `setStatus("idle")` lines in `choose` are dropped
here if Task 4 hasn't landed yet — keep them until Task 4 replaces `status`; the only
required changes in this task are `setDate("")` + the async EXIF block. Adjust minimally.)

- [ ] **Step 6: Verify** — `npm test` (all pass) and `npm run build` (compiles; the
dynamic `import("exifr")` must not break the static export).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/exif/captureDate.ts web/test/exif.captureDate.test.ts web/src/app/m/AddMemory.tsx
git commit -m "feat(web/m): prefill the Add date from the photo's EXIF DateTimeOriginal"
```

---

### Task 3: Backend — submitted date wins over EXIF

**Files:**
- Modify: `backend/exifdata.py` (add `resolve_captured_at`)
- Modify: `backend/app.py:143` (use it)
- Test: `backend/tests/test_dates.py`, `backend/tests/test_app.py`

**Interfaces:**
- Consumes: `validate_captured_at(value) -> Optional[str]` (existing).
- Produces: `resolve_captured_at(exif_value: Optional[str], manual_raw) -> Optional[str]`.

- [ ] **Step 1: Write the failing unit tests** — append to `backend/tests/test_dates.py`:

```python
from backend.exifdata import resolve_captured_at, validate_captured_at


def test_resolve_manual_wins_over_exif():
    # The phone prefills the field from EXIF and lets the user edit — the submitted
    # date is authoritative.
    assert (
        resolve_captured_at("2026-04-27T12:00:00.000Z", "2026-05-01")
        == "2026-05-01T00:00:00.000Z"
    )


def test_resolve_falls_back_to_exif():
    # Desktop drag-drop sends no date field.
    assert resolve_captured_at("2026-04-27T12:00:00.000Z", None) == "2026-04-27T12:00:00.000Z"
    assert resolve_captured_at("2026-04-27T12:00:00.000Z", "garbage") == "2026-04-27T12:00:00.000Z"


def test_resolve_none_when_neither():
    assert resolve_captured_at(None, None) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_dates.py -v`
Expected: FAIL — `ImportError: cannot import name 'resolve_captured_at'`.

- [ ] **Step 3: Implement** — add to `backend/exifdata.py` (after `validate_captured_at`):

```python
def resolve_captured_at(exif_value: Optional[str], manual_raw) -> Optional[str]:
    """Pick the record's capture time: the submitted date wins, EXIF is the fallback.

    The phone prefills its date field from EXIF and lets the user edit, so a submitted
    value is an explicit choice. Flows without a date field (desktop drag-drop) send
    nothing and keep the EXIF value.
    """
    return validate_captured_at(manual_raw) or (
        exif_value if isinstance(exif_value, str) else None
    )
```

And in `backend/app.py` replace line 143:

```python
    when = resolve_captured_at(placement.get("captured_at"), captured_at)
```

updating the import at the top: `from .exifdata import parse_placement, resolve_captured_at, validate_captured_at` → `validate_captured_at` is no longer used in `app.py`; drop it from the import if nothing else references it.

- [ ] **Step 4: Add the route-level integration test** — append to `backend/tests/test_app.py`:

```python
def _jpeg_with_exif_date(date: str = "2026:04:27 12:00:00") -> bytes:
    """A tiny JPEG whose EXIF carries DateTimeOriginal (what an iPhone photo has)."""
    import io

    from PIL import Image

    img = Image.new("RGB", (8, 8))
    exif = Image.Exif()
    exif[36867] = date  # DateTimeOriginal
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_manual_date_wins_over_exif(client):
    c, _ = client
    rec = c.post(
        "/api/memories",
        data={"captured_at": "2026-05-01"},
        files={"photo": ("a.jpg", _jpeg_with_exif_date(), "image/jpeg")},
    ).json()["record"]
    assert rec["captured_at"] == "2026-05-01T00:00:00.000Z"


def test_exif_date_used_when_no_manual(client):
    c, _ = client
    rec = c.post(
        "/api/memories",
        files={"photo": ("a.jpg", _jpeg_with_exif_date(), "image/jpeg")},
    ).json()["record"]
    assert rec["captured_at"] == "2026-04-27T12:00:00.000Z"
```

- [ ] **Step 5: Run the full backend suite — PASS**

Run: `.\.venv\Scripts\python.exe -m pytest`
Expected: all pass (including the pre-existing `test_post_with_manual_date`).

- [ ] **Step 6: Commit**

```bash
git add backend/exifdata.py backend/app.py backend/tests/test_dates.py backend/tests/test_app.py
git commit -m "fix(backend): submitted capture date wins over EXIF (phone prefills + edits)"
```

---

### Task 4: Optimistic "Memory added"

**Files:**
- Create: `web/src/lib/upload/addFlow.ts`
- Test: `web/test/upload.addFlow.test.ts`
- Modify: `web/src/app/m/AddMemory.tsx`

**Interfaces:**
- Produces:
  - `type AddPhase = "idle" | "sending" | "settled" | "error"`
  - `type AddEvent = "submit" | "succeed" | "fail"`
  - `advance(phase: AddPhase, event: AddEvent): AddPhase`
  - `showsAdded(phase: AddPhase): boolean` — added-screen visible (sending | settled)
  - `mayAdvance(phase: AddPhase): boolean` — Explore advance armed (settled only)

- [ ] **Step 1: Write the failing test** — `web/test/upload.addFlow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance, mayAdvance, showsAdded, type AddPhase } from "@/lib/upload/addFlow";

describe("advance", () => {
  it("submit starts sending from idle and from error (retry)", () => {
    expect(advance("idle", "submit")).toBe("sending");
    expect(advance("error", "submit")).toBe("sending");
  });

  it("sending settles on success and drops to error on failure", () => {
    expect(advance("sending", "succeed")).toBe("settled");
    expect(advance("sending", "fail")).toBe("error");
  });

  it("ignores events that don't apply to the phase", () => {
    expect(advance("idle", "succeed")).toBe("idle");
    expect(advance("idle", "fail")).toBe("idle");
    expect(advance("settled", "submit")).toBe("settled");
    expect(advance("sending", "submit")).toBe("sending");
  });
});

describe("screen predicates", () => {
  it("the added screen shows while sending and once settled", () => {
    const shown: AddPhase[] = ["sending", "settled"];
    for (const p of ["idle", "sending", "settled", "error"] as const) {
      expect(showsAdded(p)).toBe(shown.includes(p));
    }
  });

  it("advancing to Explore is armed only after the POST succeeded", () => {
    for (const p of ["idle", "sending", "settled", "error"] as const) {
      expect(mayAdvance(p)).toBe(p === "settled");
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- upload.addFlow`
Expected: FAIL — cannot resolve `@/lib/upload/addFlow`.

- [ ] **Step 3: Implement** — `web/src/lib/upload/addFlow.ts`:

```ts
// Add-screen upload phases. "sending" already shows the calm "Memory added" screen
// (optimistic — the POST body is still uploading over WiFi); "settled" means the POST
// succeeded, and only then may the screen advance to Explore (tap or timer), so a
// failed upload can never be silently skipped past.
export type AddPhase = "idle" | "sending" | "settled" | "error";
export type AddEvent = "submit" | "succeed" | "fail";

const TRANSITIONS: Record<AddPhase, Partial<Record<AddEvent, AddPhase>>> = {
  idle: { submit: "sending" },
  sending: { succeed: "settled", fail: "error" },
  settled: {},
  error: { submit: "sending" },
};

export function advance(phase: AddPhase, event: AddEvent): AddPhase {
  return TRANSITIONS[phase][event] ?? phase;
}

/** The "Memory added" screen shows for both in-flight and settled uploads. */
export function showsAdded(phase: AddPhase): boolean {
  return phase === "sending" || phase === "settled";
}

/** Advancing to Explore is armed only once the POST succeeded. */
export function mayAdvance(phase: AddPhase): boolean {
  return phase === "settled";
}
```

- [ ] **Step 4: Run the test — PASS** (`npm test -- upload.addFlow`)

- [ ] **Step 5: Rewire `AddMemory.tsx` onto the phase machine**

Replace the `Status` type and `status` state with:

```ts
import { advance, mayAdvance, showsAdded, type AddPhase } from "@/lib/upload/addFlow";
```

```ts
  const [phase, setPhase] = useState<AddPhase>("idle");
```

(remove `type Status = ...`). Update `choose` — where it previously reset `status`, it
now only clears the error (`setError(null)`; phase is already `idle`/`error` and a new
photo pick from `error` is fine — leave phase untouched).

Replace `upload` (optimistic: flip to `sending` *before* the fetch):

```ts
  const upload = useCallback(async () => {
    if (!file) return;
    setPhase((p) => advance(p, "submit"));
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("placement", "scatter");
      if (name.trim()) form.append("name", name.trim());
      if (date) form.append("captured_at", date);
      if (audio.blob) form.append("audio", audio.blob, "note");
      const r = await fetch(`${getApiBaseUrl()}/api/memories`, { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setPhase((p) => advance(p, "succeed"));
    } catch (err) {
      setPhase((p) => advance(p, "fail"));
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [file, name, date, audio.blob]);
```

Auto-advance effect — timer arms only once settled:

```ts
  // "Memory added" shows immediately (optimistic); the drift to Explore starts only
  // after the POST succeeds. Tapping advances immediately — once settled.
  useEffect(() => {
    if (!mayAdvance(phase)) return;
    const t = setTimeout(onAdded, 2600);
    return () => clearTimeout(t);
  }, [phase, onAdded]);
```

Added screen (replaces the `status === "done"` block; on failure `phase` becomes
`error`, this branch stops matching, and the form re-renders with all entered state and
the error line — no extra code needed):

```tsx
  if (showsAdded(phase)) {
    return (
      <main className={styles.screen} onClick={() => mayAdvance(phase) && onAdded()}>
        <h1 className={styles.addedTitle}>Memory added</h1>
        <p className={styles.addedSub}>
          It’s finding its place
          <br />
          in the city
        </p>
      </main>
    );
  }
```

Submit button (the form only renders in `idle`/`error`, so no "Adding…" label exists any
more):

```tsx
        <button
          type="button"
          className={styles.addAction}
          onClick={upload}
          disabled={!file}
        >
          Add to the city
        </button>
```

- [ ] **Step 6: Verify** — `npm test` (all pass), `npm run build` (compiles).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/upload/addFlow.ts web/test/upload.addFlow.test.ts web/src/app/m/AddMemory.tsx
git commit -m "feat(web/m): optimistic 'Memory added' — added screen shows instantly, advances only on success"
```

---

### Task 5: Narrate — surface microphone errors

**Files:**
- Create: `web/src/lib/audio/micError.ts`
- Test: `web/test/audio.micError.test.ts`
- Modify: `web/src/hooks/useAudioRecorder.ts` (add `requesting`, use `describeMicError`)
- Modify: `web/src/app/m/AddMemory.tsx` (pending label + error line)

**Interfaces:**
- Produces: `describeMicError(name: string, message: string): string`; `AudioRecorder`
  gains `requesting: boolean`.

- [ ] **Step 1: Write the failing test** — `web/test/audio.micError.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeMicError } from "@/lib/audio/micError";

describe("describeMicError", () => {
  it("gives NotAllowedError an iOS settings hint (iOS never re-prompts once denied)", () => {
    const msg = describeMicError("NotAllowedError", "Permission denied");
    expect(msg).toContain("NotAllowedError");
    expect(msg).toContain("Website Settings");
  });

  it("names a missing microphone", () => {
    expect(describeMicError("NotFoundError", "")).toContain("NotFoundError");
  });

  it("falls back to name + message", () => {
    expect(describeMicError("AbortError", "hardware busy")).toBe("AbortError: hardware busy");
    expect(describeMicError("AbortError", "")).toBe("AbortError");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- audio.micError`
Expected: FAIL — cannot resolve `@/lib/audio/micError`.

- [ ] **Step 3: Implement** — `web/src/lib/audio/micError.ts`:

```ts
/**
 * Human message for a failed microphone request, shown under the Narrate button.
 * iOS Safari never re-prompts once a site is denied, so NotAllowedError explains
 * where to re-enable it instead of just stating the failure.
 */
export function describeMicError(name: string, message: string): string {
  if (name === "NotAllowedError") {
    return (
      "Microphone blocked (NotAllowedError). Enable it via the aA button → " +
      "Website Settings → Microphone, or iOS Settings → Apps → Safari."
    );
  }
  if (name === "NotFoundError") return "No microphone found (NotFoundError).";
  return message ? `${name}: ${message}` : name;
}
```

- [ ] **Step 4: Run the test — PASS** (`npm test -- audio.micError`)

- [ ] **Step 5: Add `requesting` + the message to `useAudioRecorder.ts`**

Import the helper, extend the interface, and rework `start`:

```ts
import { describeMicError } from "@/lib/audio/micError";
```

```ts
export interface AudioRecorder {
  supported: boolean;
  requesting: boolean; // getUserMedia permission request in flight
  recording: boolean;
  blob: Blob | null;
  url: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}
```

```ts
  const [requesting, setRequesting] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const b = new Blob(chunksRef.current, { type });
        setBlob(b);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(b);
        });
        cleanupStream();
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof DOMException
          ? describeMicError(err.name, err.message)
          : String(err instanceof Error ? err.message : err),
      );
      cleanupStream();
    } finally {
      setRequesting(false);
    }
  }, [cleanupStream]);
```

Return `requesting` in the hook's result object.

- [ ] **Step 6: Show the pending label + error in `AddMemory.tsx`**

```ts
  const narrateLabel = audio.url
    ? "Voice note added"
    : audio.recording
      ? "Recording — tap to stop"
      : audio.requesting
        ? "Allow microphone…"
        : "Narrate";
```

Ignore taps while the permission prompt is up, and render the error line right under the
button (reuses the existing `.addError` style):

```tsx
        {mounted && audio.supported && (
          <>
            <button
              type="button"
              className={`${styles.serifButton} ${audio.url ? styles.serifButtonSet : ""}`}
              onClick={onNarrate}
              disabled={audio.requesting}
            >
              {narrateLabel}
            </button>
            {audio.error && <p className={styles.addError}>{audio.error}</p>}
          </>
        )}
```

- [ ] **Step 7: Verify** — `npm test` (all pass), `npm run build` (compiles).

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/audio/micError.ts web/test/audio.micError.test.ts web/src/hooks/useAudioRecorder.ts web/src/app/m/AddMemory.tsx
git commit -m "fix(web/m): surface Narrate mic errors + 'Allow microphone…' pending state"
```

---

### Task 6: WebGL shadow field (true morph on iOS)

**Files:**
- Create: `web/src/lib/shadow/field.ts` (pure: knobs, PRNG, blob layout, packing)
- Create: `web/src/lib/shadow/color.ts` (pure: CSS color → RGB floats)
- Test: `web/test/shadow.field.test.ts`, `web/test/shadow.color.test.ts`
- Rewrite: `web/src/app/m/ShadowField.tsx` (canvas + shader; static-SVG fallback)
- Modify: `web/src/app/m/mobile.module.css` (drop `.fieldDrift`/`@keyframes drift`; add `.fieldCanvas`; make `.field` self-positioning)

**Interfaces:**
- Produces:
  - `SHADOW` knobs object, `makeBlobs(w, h): Ellipse[]` (moved from `ShadowField.tsx`, unchanged behavior), `MAX_BLOBS = 80`
  - `packBlobs(blobs: Ellipse[]): Float32Array` — `MAX_BLOBS × vec4` of `[cx, cy, r, opacity]`, `r = (rx + ry) / 2` (blobs are near-circular: 90–100 px)
  - `parseCssColor(value: string): [number, number, number] | null` — `#rgb`, `#rrggbb`, `rgb(r, g, b)` / `rgb(r g b)` → 0..1 floats

- [ ] **Step 1: Write the failing tests**

`web/test/shadow.field.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_BLOBS, makeBlobs, packBlobs, SHADOW } from "@/lib/shadow/field";

describe("makeBlobs", () => {
  it("is deterministic for a given viewport", () => {
    expect(makeBlobs(390, 844)).toEqual(makeBlobs(390, 844));
  });

  it("scales count with area, clamped to [8, MAX_BLOBS]", () => {
    expect(makeBlobs(10, 10).length).toBe(8);
    expect(makeBlobs(4000, 4000).length).toBe(MAX_BLOBS);
    const n = makeBlobs(390, 844).length;
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(MAX_BLOBS);
  });

  it("keeps blobs inside the viewport with radii/opacity in the knob ranges", () => {
    for (const b of makeBlobs(390, 844)) {
      expect(b.cx).toBeGreaterThanOrEqual(0);
      expect(b.cx).toBeLessThanOrEqual(390);
      expect(b.rx).toBeGreaterThanOrEqual(SHADOW.minR);
      expect(b.rx).toBeLessThanOrEqual(SHADOW.maxR);
      expect(b.o).toBeGreaterThanOrEqual(SHADOW.minO);
      expect(b.o).toBeLessThanOrEqual(SHADOW.maxO);
    }
  });
});

describe("packBlobs", () => {
  it("packs cx, cy, mean radius, opacity into MAX_BLOBS vec4 slots", () => {
    const packed = packBlobs([{ cx: 10, cy: 20, rx: 90, ry: 100, o: 0.7 }]);
    expect(packed.length).toBe(MAX_BLOBS * 4);
    expect(Array.from(packed.slice(0, 4))).toEqual([10, 20, 95, expect.closeTo(0.7)]);
    expect(Array.from(packed.slice(4, 8))).toEqual([0, 0, 0, 0]); // unused slots zeroed
  });
});
```

`web/test/shadow.color.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCssColor } from "@/lib/shadow/color";

describe("parseCssColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseCssColor("#b7b9c4")).toEqual([
      expect.closeTo(0xb7 / 255),
      expect.closeTo(0xb9 / 255),
      expect.closeTo(0xc4 / 255),
    ]);
  });

  it("parses 3-digit hex", () => {
    expect(parseCssColor("#fff")).toEqual([1, 1, 1]);
  });

  it("parses rgb() with commas or spaces, with surrounding whitespace", () => {
    expect(parseCssColor(" rgb(255, 0, 128) ")).toEqual([1, 0, expect.closeTo(128 / 255)]);
    expect(parseCssColor("rgb(255 0 128)")).toEqual([1, 0, expect.closeTo(128 / 255)]);
  });

  it("returns null for empty/garbage", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("var(--wall)")).toBeNull();
    expect(parseCssColor("#12")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- shadow`
Expected: FAIL — cannot resolve `@/lib/shadow/field` / `@/lib/shadow/color`.

- [ ] **Step 3: Implement the pure modules**

`web/src/lib/shadow/field.ts` — `SHADOW`, `mulberry32`, `Ellipse`, `makeBlobs` are MOVED
VERBATIM from `ShadowField.tsx` (drop the SMIL-only knobs `freqRest`/`freqPeak`/`dur`/
`octaves`/`blur`, keep `seed`/`displace`/`minR`/`maxR`/`minO`/`maxO`/`areaPerBlob`), plus:

```ts
export const MAX_BLOBS = 80;

/** Pack blobs for the shader's `uniform vec4 u_blobs[MAX_BLOBS]`: cx, cy, r, opacity.
 *  Blobs are near-circular (rx/ry within 90–100 px), so the mean radius stands in. */
export function packBlobs(blobs: Ellipse[]): Float32Array {
  const out = new Float32Array(MAX_BLOBS * 4);
  for (let i = 0; i < Math.min(blobs.length, MAX_BLOBS); i++) {
    const b = blobs[i];
    out[i * 4] = b.cx;
    out[i * 4 + 1] = b.cy;
    out[i * 4 + 2] = (b.rx + b.ry) / 2;
    out[i * 4 + 3] = b.o;
  }
  return out;
}
```

(The `Math.min(80, …)` clamp inside `makeBlobs` becomes `Math.min(MAX_BLOBS, …)`.)

`web/src/lib/shadow/color.ts`:

```ts
/** Parse the shadow-field CSS tokens (--wall / --light) into 0..1 RGB floats.
 *  Handles #rgb, #rrggbb, and rgb(r, g, b) / rgb(r g b). Null on anything else. */
export function parseCssColor(value: string): [number, number, number] | null {
  const s = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [
      number, number, number,
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
  if (rgb) return [+rgb[1] / 255, +rgb[2] / 255, +rgb[3] / 255];
  return null;
}
```

- [ ] **Step 4: Run the tests — PASS** (`npm test -- shadow`)

- [ ] **Step 5: Rewrite `ShadowField.tsx`** (full replacement):

```tsx
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { makeBlobs, MAX_BLOBS, packBlobs, SHADOW } from "@/lib/shadow/field";
import { parseCssColor } from "@/lib/shadow/color";
import styles from "./mobile.module.css";

// The signature 5b visual: a living dappled leaf-shadow field. Light ellipses over a
// darker wall, domain-warped by animated fbm noise — the GPU equivalent of the old
// feTurbulence + feDisplacementMap SVG filter, which iOS Safari can render but never
// animate (WebKit ignores SMIL on filter primitives; two CSS-level workarounds failed).
// A raw WebGL1 fragment shader morphs identically on every platform. It renders at a
// fraction of the display resolution and is upscaled by CSS — that IS the gaussian
// blur, for free, and keeps the GPU cost trivial. Colours come from the CSS tokens
// (--wall / --light, inherited by the canvas). If WebGL is unavailable the static SVG
// (no SMIL) renders instead.
const RENDER_SCALE = 0.4;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
#define MAX_BLOBS ${MAX_BLOBS}
uniform vec2 u_res;              // drawing-buffer px
uniform vec2 u_size;             // field size in CSS px (blob space)
uniform float u_time;            // seconds
uniform vec3 u_wall;
uniform vec3 u_light;
uniform vec4 u_blobs[MAX_BLOBS]; // cx, cy, r, opacity — CSS px
uniform int u_count;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = gl_FragCoord.xy / u_res * u_size;
  p.y = u_size.y - p.y; // blob layout is y-down (SVG heritage)
  float t = u_time * 0.05;
  vec2 warp = vec2(
    fbm(p * 0.007 + vec2(t, -0.7 * t)),
    fbm(p * 0.007 + vec2(-0.8 * t, t) + vec2(37.2, 11.9))
  ) - 0.5;
  vec2 q = p + warp * ${SHADOW.displace.toFixed(1)};
  float sum = 0.0;
  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= u_count) break;
    vec4 b = u_blobs[i];
    float d = distance(q, b.xy);
    sum += b.w * smoothstep(b.z * 1.6, b.z * 0.3, d); // wide feather = the old blur
  }
  vec3 col = mix(u_wall, u_light, clamp(sum, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS "reduce motion" preference is set (SSR-safe: false on the server). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("ShadowField shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function ShadowField() {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
    });
    if (!gl) {
      setFallback(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setFallback(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("ShadowField link:", gl.getProgramInfoLog(prog));
      setFallback(true);
      return;
    }
    gl.useProgram(prog);

    // Fullscreen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, "u_res"),
      size: gl.getUniformLocation(prog, "u_size"),
      time: gl.getUniformLocation(prog, "u_time"),
      wall: gl.getUniformLocation(prog, "u_wall"),
      light: gl.getUniformLocation(prog, "u_light"),
      blobs: gl.getUniformLocation(prog, "u_blobs"),
      count: gl.getUniformLocation(prog, "u_count"),
    };

    // Colours from the CSS tokens the canvas inherits (single source with the chrome).
    const style = getComputedStyle(canvas);
    const wall = parseCssColor(style.getPropertyValue("--wall")) ?? [0.72, 0.73, 0.77];
    const light = parseCssColor(style.getPropertyValue("--light")) ?? [0.98, 0.96, 0.92];
    gl.uniform3fv(u.wall, wall);
    gl.uniform3fv(u.light, light);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * RENDER_SCALE));
      canvas.height = Math.max(1, Math.round(h * RENDER_SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform2f(u.size, w, h);
      const blobs = makeBlobs(w, h);
      gl.uniform4fv(u.blobs, packBlobs(blobs));
      gl.uniform1i(u.count, Math.min(blobs.length, MAX_BLOBS));
    };
    resize();

    const draw = (ms: number) => {
      gl.uniform1f(u.time, ms / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0;
    const loop = (ms: number) => {
      draw(ms);
      raf = requestAnimationFrame(loop);
    };
    const running = () => raf !== 0;
    const start = () => {
      if (!reduced && !running() && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (running()) cancelAnimationFrame(raf);
      raf = 0;
    };

    if (reduced) draw(0); // hold a static frame — same policy as the old SMIL gate
    else start();

    const onResize = () => {
      resize();
      if (reduced || document.hidden) draw(reduced ? 0 : performance.now());
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [reduced]);

  if (fallback) return <StaticField />;
  return <canvas ref={canvasRef} className={styles.fieldCanvas} aria-hidden />;
}

/** No-WebGL fallback: the field as a static SVG (the filter renders fine everywhere —
 *  only its animation doesn't — so this matches the reduced-motion look). */
function StaticField() {
  const w = typeof window === "undefined" ? 390 : window.innerWidth;
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  const blobs = makeBlobs(w, h);
  return (
    <svg
      className={styles.field}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id="cmc-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.009"
            numOctaves={1}
            seed={SHADOW.seed}
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale={SHADOW.displace}
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          <feGaussianBlur in="d" stdDeviation={16} />
        </filter>
      </defs>
      <rect width={w} height={h} style={{ fill: "var(--wall)" }} />
      <g filter="url(#cmc-shadow)" style={{ fill: "var(--light)" }}>
        {blobs.map((e, i) => (
          <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} opacity={e.o} />
        ))}
      </g>
    </svg>
  );
}
```

- [ ] **Step 6: Update `mobile.module.css`**

Delete `.fieldDrift`, `@keyframes drift`, and their long comment block (~lines 71–93).
Make `.field` self-positioning (it lost its positioned wrapper) and add the canvas rule:

```css
/* The shadow field fills the viewport behind everything. .fieldCanvas is the WebGL
   renderer (drawn at low resolution and CSS-upscaled — the upscale is the blur);
   .field is the static-SVG fallback when WebGL is unavailable. */
.fieldCanvas,
.field {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.field {
  display: block;
}
```

- [ ] **Step 7: Verify** — `npm test` (all pass) and `npm run build && npm run start`;
open `http://localhost:3000/m` in a desktop browser: the dapple field must **visibly
morph** (not just translate), colours must match the old field, and DevTools' iPhone
emulation must show no console errors. Toggle OS reduced-motion → static frame.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/shadow/ web/test/shadow.field.test.ts web/test/shadow.color.test.ts web/src/app/m/ShadowField.tsx web/src/app/m/mobile.module.css
git commit -m "feat(web/m): WebGL shadow field — true noise morph on iOS (SVG filter can't animate there)"
```

---

### Task 7: Full verification + docs touch-up

**Files:**
- Modify: `CLAUDE.md` (stale spec count)

- [ ] **Step 1: Full web suite + production build**

Run from `web/`: `npm test` then `npm run build`
Expected: all specs pass; build succeeds.

- [ ] **Step 2: Full backend/pipeline suite**

Run from repo root: `.\.venv\Scripts\python.exe -m pytest`
Expected: all pass.

- [ ] **Step 3: Update the stale "163 Vitest specs" count in `CLAUDE.md`** to the number
`npm test` now reports (also mention nothing else — one-number edit).

- [ ] **Step 4: Manual smoke (desktop prod build)** — `npm run start`, open `/m`:
  - Shadow field morphs continuously.
  - Pick a photo with EXIF (use `samples/input/*.jpg`): date prefills; picking a
    dateless photo clears it back to "Add a date".
  - Photo circle edge is feathered; no "Choose another photo" at the bottom.
  - Add to the city → "Memory added" appears instantly (throttle the network in DevTools
    to confirm it shows during upload and only advances to Explore after the POST
    resolves; with the backend stopped, it must return to the form with the error).
  - Narrate: deny the mic → error line with hint appears under the button.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: refresh web spec count"
```

- [ ] **Step 6: Device pass (user, iPhone over the exhibition domain)** — shadow morphs,
date prefills from a camera-roll photo, feathered edge, instant added-screen, narrate
error names the failure (then fix mic permission via the surfaced hint and record).
