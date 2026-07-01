# Handoff: Memory City — Phone Companion (`/m`), option **5b** "Beautiful shadow"

## Overview
The phone companion for Memory City is a full-bleed, dark-to-light, touch-first app with three
top-level modes: **Add**, **Navigate**, **Explore**. This handoff covers design direction **5b**:
a calm, ethereal treatment where the background is a **living dappled leaf-shadow field** (animated
SVG turbulence, not blurred circles) in a desaturated warm-lilac palette, with all UI floating
directly on the light — **no cards, pills, or boxes**. Serif display type + monospace meta.

## About the design files
`Memory City Mobile.dc.html` is a **design reference created in HTML** — a prototype of intended
look, motion, and layout. It is **not production code to copy**. Your task is to **recreate 5b in the
existing app environment** (`web/src/app/m/`, a Next.js + React + CSS-modules codebase — see "Existing
code map" below) using its established patterns, tokens, and components. Ignore the other options
(1x/3x/4x/5a) in the file — **only the `#5b` section is in scope**.

Open the file in a browser and it renders every option stacked; scroll to the one labelled **5b**
(badge top-left of that block). `support.js` is the tiny runtime that powers the `.dc.html` preview —
it is only needed to view the reference, not to ship.

## Fidelity
**High-fidelity.** Colors, type, spacing, motion timings, and layout are final. Recreate pixel-accurately
using the codebase's own tokens/components where they exist, and lift the exact values below where they
don't. The phone frame in the reference (288×600 rounded rect) is just a **preview device bezel** — in
the real app these screens are full-viewport; map 288×600 → the device viewport.

## The four screens
All four share the same chrome and the same animated shadow field; only the centre content differs.

### Shared chrome (every screen)
- **Mode tabs** — horizontal row, centered, `top: 18px`. Three monospace labels `Add` · `Navigate` ·
  `Explore`, `font-size: 11px`, gap `18px`. Active = `font-weight: 600` full-opacity `#33230f`;
  inactive = `font-weight: 500`, color `rgba(33,29,24,.4)`.
- **Background shadow field** — see "The shadow field" below. Sits behind everything; content floats on top.
- **Grain** — a faint fractal-noise overlay (`mix-blend: overlay`, opacity ~.13) over the field.

### 1 · Add (photo + naming combined)
- **Content block**: absolutely positioned `top: 100px`, left/right `24px`, vertical flex, centered,
  `gap: 13px`.
- **Photo target**: 92×92 circle, feathered edge via `mask: radial-gradient(circle,#000 55%,transparent 100%)`,
  fill `rgba(51,35,15,.10)` (`#33230F1A`). Holds a centered **+** glyph (stroke `#33230f`, `opacity .6`)
  until a photo is chosen; when chosen, show the photo clipped to the same feathered circle.
- **Fields** (tap-to-edit, serif, `font-size: 24px`):
  - `Name this memory` — primary, color `#33230f`.
  - `Add a date` — placeholder, color `rgba(51,35,15,.42)` (`#33230F6B`).
  - `Narrate` — placeholder, color `rgba(51,35,15,.42)`.
- **Primary action**: `ADD TO THE CITY` — monospace, `font-size: 11px`, `font-weight: 600`,
  `margin-top: 26px`, no border.
- **Secondary**: `Choose another photo` — monospace, pinned `bottom: 30px`, centered,
  `font-size: 9px`, color `rgba(51,35,15,.45)`.

### 2 · Added (confirmation)
- **Title**: `Memory added` — serif, `top: 212px`, centered, `font-size: 25px`.
- **Subtext**: `It's finding its place in the city` — monospace, `top: 252px`, centered,
  `font-size: 8.5px`, `letter-spacing: .14em`, `line-height: 1.7`, color `rgba(51,35,15,.55)`.
  (This screen is a transient state; auto-advances to Explore, or tap to continue.)

### 3 · Explore (memory field)
- The shadow field IS the city. **Memory names** float as serif labels (`font-size: 17px`) at scattered
  positions, e.g. `The Pier`, `First snow`, `Chrismas`, `Grandmas Home`, `Kneipe`. In production these
  are data-driven and pannable (drag to move through the field). Positions in the mock are illustrative.

### 4 · Navigate (driving controls)
- **Gyro toggle**: icon-only round button, 30×30, `top: 42px`, right side, glass fill
  `rgba(255,255,255,.35)` + `backdrop-filter: blur(4px)`, gyroscope glyph. Toggles gyro-guided look.
- **Control stack**: absolutely positioned `top: 96px → bottom: 96px`, vertical flex, centered, `gap: 30px`:
  - **LOOK** — 148×148 circle, `border: 2px solid rgba(51,35,15,.24)`, label `LOOK` (mono, 8px,
    `letter-spacing: .22em`). Optional — gyro-guided on capable devices, this pad is the fallback.
  - **MOVE** — 148×148 circle, `border: 2px solid rgba(51,35,15,.26)`, label `MOVE`. Primary joystick.
- **Timeline** (bottom, `bottom: 30px`, height 60px): a thin horizontal line
  (`height: 3px`, `#33230F`, ends feathered with a `linear-gradient` mask). Memories are **dots**
  (8×8 circles) along it. End labels `2012` … `2026`. Scroll horizontally to move through time; the
  current-period window acts as a **filter** (zoom = narrow the range).

## Interactions & behavior
- **Tab switch**: tap a mode label → switch screen. Active label goes bold/full-opacity.
- **Add flow**: tap photo circle → OS photo picker → photo fills the feathered circle → edit
  Name/Date/Narrate inline → `ADD TO THE CITY` commits → **Added** state → auto-advance to Explore.
- **Navigate**:
  - MOVE pad = joystick vector for movement (see existing `joystickVector` in `lib/control/input`).
  - LOOK = camera orientation. On devices with gyro permission, orientation drives look; **fallback**
    to the LOOK pad when gyro is unavailable or denied. Gyro button toggles/enables gyro (triggers the
    iOS `DeviceOrientationEvent.requestPermission()` flow on first use).
  - Timeline scrub filters which memories are visible/active.
- **Explore**: drag to pan the field; tap a memory label to open it.
- **Reduced motion**: the shadow field animation must respect `prefers-reduced-motion: reduce`
  (freeze to a static frame). The reference already gates its drift keyframes on this.

## The shadow field (the signature visual)
An animated SVG behind each screen. Recreate faithfully — this is the identity of 5b.

- **Wall (background)**: solid fill, default `#ebe9f1` (airy warm-lilac). This is the *shade*.
- **Light dapples**: 8 soft `<ellipse>`s (rx/ry ~66–104), scattered across the 288×600 field, fills in
  the `#a9a7b4`–`#bcbac4` desaturated grey-lilac range, `opacity` ~.45–.55. These read as **light gaps**
  through foliage. (5b was *inverted* from an earlier version: wall = shadow tone, ellipses = light.)
- **Warp**: the ellipse group is filtered through
  `feTurbulence(fractalNoise, baseFrequency ~0.006, numOctaves 2)` →
  `feDisplacementMap(scale 185)` → `feGaussianBlur(stdDeviation 17)`. This is what makes the blobs
  organic/leaf-like instead of round.
- **Life/motion** (reads as light shifting through swaying leaves):
  1. The `feTurbulence` `baseFrequency` is animated with a slow eased loop (`<animate>`, dur 16–19s,
     spline easing, ~±30% around the base) so the noise field morphs.
  2. The ellipse `<g>` drifts/scales via CSS keyframes (`drift2/3/4`, 21–27s, `ease-in-out`,
     small translate + scale) so the masses travel.
  Each screen uses a different seed + durations so they never sync.
- In a real renderer you can reproduce this with the same SVG filter, or with WebGL/canvas noise —
  match the *look* (soft, drifting, dappled, desaturated warm-lilac) and *timing* (15–27s, eased,
  seamless, reduced-motion-aware).

### Tweakable parameters (exposed as controls in the reference)
The prototype exposes these live; treat them as the design's tuning knobs (defaults in parens):
- **Wall color** (`#c3c5d0` control default; screens currently render `#ebe9f1`) — the shade/background.
- **Light color** (`#f4f3f8`) — the bright dapples.
- **Intensity** — dapple opacity multiplier, 0.3–1.8× (1).
- **Softness** — `feGaussianBlur` stdDeviation, 4–40px (17).
- **Spread** — `feDisplacementMap` scale, 60–260 (185).
Expose the equivalent as theme constants so the field can be re-tuned without code surgery.

## Design tokens
**Palette (warm-lilac shadow):**
- Ink / text: `#33230f` (and `#211d18` for some glyphs)
- Text muted: `rgba(51,35,15,.55)`, `.45`, `.42` (`#33230F6B`), `.4`
- Wall (shade bg): `#ebe9f1` (rendered) / `#c3c5d0` (darker option)
- Light dapples: `#a9a7b4`, `#aba9b6`, `#adabb8`, `#b1afbb`, `#b4b2be`, `#b9b7c1`, `#bcbac4`
- Glass (gyro button): `rgba(255,255,255,.35)` + `backdrop-filter: blur(4px)`
- Hairlines: `rgba(51,35,15,.24)` / `.26` / `.28`

**Typography:**
- Display / content: **Newsreader** (serif), weight 300–400. Sizes: 24–25px (titles/fields), 17px (memory labels).
- Meta / labels / actions: **Geist Mono**, weights 500–600. Sizes: 8–11px, `letter-spacing` .14–.22em, often uppercase.
- Body UI elsewhere in the app: **Geist** (sans).

**Spacing / geometry:**
- Screen padding: 24px sides. Tabs at `top:18px`. Content block `top:100px` (Add).
- Photo circle 92px; Navigate pads 148px; gyro button 30px; timeline dots 8px, line 3px.
- Feathered circle mask: `radial-gradient(circle,#000 55%,transparent 100%)`.

**Motion:**
- Field noise: `<animate baseFrequency>` 16–19s, spline `0.45 0 0.55 1`, seamless.
- Field drift: CSS keyframes 21–27s `ease-in-out` infinite, small translate+scale.
- All motion gated on `prefers-reduced-motion`.

## State management
- `mode`: `'add' | 'navigate' | 'explore'` (see existing `Mode` type in `MobileApp.tsx`).
- Add flow: `photo`, `name`, `date`, `narration`, plus a transient `added` confirmation state.
- Navigate: joystick `moveVector`, look orientation (`gyroEnabled` + fallback pad vector), timeline
  `range`/`cursor`.
- Explore: camera/pan position, selected memory, memory list (data-fetched).

## Assets
- **Fonts**: Newsreader + Geist + Geist Mono (already loadable; app uses Geist family via `globals.css`).
- **Icons**: simple line glyphs (plus, gyroscope, chevron, search) — reproduce with the app's icon set
  (`@untitledui/icons` is already used in `m/`; the reference hand-draws equivalents as inline SVG).
- **No raster assets** — the entire background is generated (SVG filter), so it's resolution-independent.

## Existing code map (recreate 5b into these)
The mounted repo already has the phone companion scaffolded under `web/src/app/m/`:
- `MobileApp.tsx` — mode container + `Mode` type + mode switch.
- `ModeSwitch.tsx` — the top tab control (Add / Navigate / Explore).
- `AddMemory.tsx` — the Add flow (photo, naming) → restyle to screen 1 above.
- `DriveMode.tsx` — the Navigate/driving controls (joystick, `joystickVector` from `@/lib/control/input`)
  → restyle to screen 4 (LOOK/MOVE stack + gyro toggle + timeline).
- `mobile.module.css` — mobile styles + shared tokens from `globals.css`.
Add an Explore view for screen 3 if one doesn't exist yet. Introduce the shadow field as a shared
background component behind all modes.

## Files in this bundle
- `Memory City Mobile.dc.html` — the design reference (scroll to **5b**; ignore other options).
- `support.js` — runtime needed only to view the reference in a browser.
- `README.md` — this document (self-sufficient; implement from it alone).
