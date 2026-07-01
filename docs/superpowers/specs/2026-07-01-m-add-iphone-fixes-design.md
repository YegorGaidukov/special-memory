# /m Add — iPhone fixes (shadow morph, EXIF date, photo edge, instant added, narrate errors)

**Date:** 2026-07-01
**Status:** Approved
**Scope:** `web/src/app/m/` (phone page) + one backend priority flip (`backend/app.py`).

Six issues found testing the `/m` Add flow on an iPhone (Safari, exhibition HTTPS domain).
All are contained to the phone page except §2's backend change.

## 1. Shadow field: replace the SVG filter with a WebGL fragment shader

**Problem.** The dapple field's visible morphing comes from a SMIL `<animate>` on
`feTurbulence.baseFrequency`. WebKit/iOS never animates filter-primitive attributes, so on
iPhone the field is frozen; the CSS wrapper drift added in c96e5ea (±26 px over 22 s) is
imperceptible even when it runs. Two prior CSS-level fixes failed — the SVG-filter approach
is a dead end on iOS.

**Design.** Rewrite `ShadowField`'s renderer as a **raw WebGL canvas** (WebGL1, no new
dependencies) used on **all platforms** — one code path, no per-platform variants:

- Fullscreen fragment shader reproducing the current look: light-colored ellipse blobs over
  the wall color, domain-warped by animated fbm noise (the GPU equivalent of
  `feTurbulence + feDisplacementMap`), soft falloff.
- Blob layout stays in the existing **pure, tested** code (`mulberry32`, `makeBlobs`,
  `SHADOW` knobs); positions/radii/opacities are passed to the shader as uniforms.
- Canvas renders at **low resolution (~0.4× DPR)** and is upscaled by CSS — this *is* the
  gaussian blur, for free, and keeps GPU cost / battery trivial.
- Colors are read from the CSS custom properties `--wall` / `--light` at mount
  (getComputedStyle), so the tokens remain the single source.
- `prefers-reduced-motion: reduce` freezes the time uniform → static frame (matches today's
  reduced-motion behavior). The render loop also pauses when the tab is hidden.
- **Fallback:** if `getContext("webgl")` fails, render the current static SVG (no SMIL).
- The shader/canvas is the un-unit-tested seam (like Spark); the CSS `.fieldDrift`
  keyframes and SMIL block are removed.

## 2. Capture date: prefill from EXIF client-side; submitted date wins server-side

**Problem.** The backend parses `DateTimeOriginal` at upload, but the phone UI never reads
EXIF, so the date field can't prefill — the user had to set it manually even for a photo
with intact EXIF.

**Design.**
- On photo pick, parse `DateTimeOriginal` with **`exifr`** (already a `web/` dependency,
  currently unused) and prefill the DatePicker as `YYYY-MM-DD`; the user can override.
  Each new photo pick re-runs the prefill (overwrites a previous prefill/choice — the date
  belongs to the photo). If EXIF is absent (iOS HEIC→JPEG conversion sometimes strips it),
  the field stays "Add a date"; manual fallback unchanged.
- The tag→ISO-day mapping lives in a pure helper (`lib/exif/captureDate.ts` or similar),
  unit-tested; the `exifr` binary parse is the seam.
- **Backend flip** (`backend/app.py`): today `captured_at` resolves as
  `EXIF or manual`. Once the field is prefilled and editable, the **submitted date must
  win**: `validate_captured_at(captured_at) or placement.get("captured_at")`. Desktop
  drag-drop sends no date, so EXIF still applies there. Update the pytest that pins the
  old priority.

## 3. Photo circle: true feathered edge

**Problem.** The feather mask `radial-gradient(circle, #000 55%, transparent 100%)` sizes
to *farthest-corner* (~127 px for the 180 px box), so alpha is still ~65% at the 90 px
circle edge where `border-radius: 50%` hard-clips it — a visibly sharp rim.

**Design.** Use `radial-gradient(circle closest-side, #000 55%, transparent 100%)` so the
fade reaches full transparency exactly at the edge, and **drop the border-radius clip** on
`.photoImg` and `.photoWell`. Feather start (55%) tunable by eye.

## 4. Instant "Memory added" (optimistic upload)

**Problem.** Tapping ADD TO THE CITY showed "ADDING…" for the whole multi-MB photo upload
over WiFi. The server responds fast (SHARP runs in a background thread) — the wait is
purely the request body upload, and the user should not sit on the form watching it.

**Design.** Tapping Add switches to the **"Memory added" screen immediately**; the POST
continues behind it.
- The 2.6 s auto-advance to Explore starts **only after the POST succeeds** — a slow
  upload just means the calm added-screen lingers. Tap-to-advance is likewise armed only
  after success (prevents silently losing a failed upload by navigating away).
- On failure the screen returns to the form with the existing error line shown; all
  entered state (photo, name, date, voice note) is retained.
- The status machine (`idle → sending → done-pending/done → error`) is extracted pure and
  unit-tested; the fetch stays the seam.

## 5. Remove "Choose another photo"

The bottom `addSecondary` button is deleted (component + CSS). Tapping the photo circle
already re-opens the picker (`aria-label="Change photo"`).

## 6. Narrate: surface recording errors

**Problem.** On the iPhone, tapping Narrate did nothing and **no permission prompt ever
appeared** — `getUserMedia` rejects instantly (permission previously denied at the
site/OS level is the prime suspect) and `AddMemory` never renders `audio.error`, so the
failure is invisible. iOS never re-prompts once denied.

**Design.**
- Render `audio.error` under the Narrate button (small serif line, same style as the
  upload error).
- While the permission request is pending, the button label reads **"Allow microphone…"**
  (new `requesting` state in `useAudioRecorder`).
- Error copy includes the `DOMException.name`; for `NotAllowedError` append a hint:
  enable the microphone for this site in iOS Settings → Apps → Safari (or via the
  aA menu → Website Settings).
- Re-test on the device afterwards; if something beyond permissions is broken, the
  surfaced error names it.

## Testing & verification

- **Vitest:** EXIF-date mapping helper; Add-screen status machine; any new pure control
  logic. **pytest:** backend `captured_at` priority flip.
- **Seams (manual):** WebGL shader visuals, `exifr` binary parse, MediaRecorder/mic
  permission, real-device iPhone pass.
- Verify on a **production build** (`npm run build && npm run start`), not dev; then a
  device pass on the iPhone over the exhibition domain (shadow morphs, date prefills from
  a camera-roll photo, feathered edge, instant added-screen, narrate error visible).
