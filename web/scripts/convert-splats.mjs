// Prepare SHARP `.ply` splats for web delivery. For each `<stem>.ply` this emits:
//   - `<stem>.sog`         — SOG (Self-Organizing Gaussians), ~6x smaller than
//                            `.ply` (~63MB -> ~10MB), what the explorer loads up
//                            close. No visible loss for these single-image SHARP
//                            splats (0 SH bands).
//   - `<stem>.preview.ply` — a decimated point cloud (PREVIEW_POINTS points,
//                            ~220KB) shown as the distant "ghost" before the full
//                            splat loads.
//
// S1 (the Python pipeline) keeps emitting the full `.ply` as archival truth; this
// is purely a web-delivery prep step.
//
// Usage:
//   node scripts/convert-splats.mjs [inputDir] [outputDir]
// Defaults: inputDir = outputDir = public/memories (convert in place).
//
// Re-runs are cheap: an output newer than its source `.ply` is skipped.

// Decimated point count for the distance preview. Larger = denser ghost + bigger
// file; ~4000 reads as a recognisable cloud at ~220KB.
const PREVIEW_POINTS = 4000;

import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = process.argv[2] ?? join(webRoot, "public", "memories");
const outputDir = process.argv[3] ?? inputDir;

if (!existsSync(inputDir)) {
  console.error(`[convert-splats] input dir not found: ${inputDir}`);
  process.exit(1);
}
mkdirSync(outputDir, { recursive: true });

const plys = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".ply"));
if (plys.length === 0) {
  console.error(`[convert-splats] no .ply files in ${inputDir}`);
  process.exit(1);
}

let converted = 0;
let skipped = 0;
for (const ply of plys) {
  const src = join(inputDir, ply);
  const stem = basename(ply, ".ply");
  // Each target: output path + the splat-transform actions (applied to the input
  // working set, so they must come AFTER the src argument).
  const targets = [
    { out: join(outputDir, `${stem}.sog`), actions: ["-N"] },
    { out: join(outputDir, `${stem}.preview.ply`), actions: ["-F", String(PREVIEW_POINTS)] },
  ];

  for (const { out, actions } of targets) {
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
      console.log(`[convert-splats] up-to-date, skipping ${basename(out)}`);
      skipped++;
      continue;
    }
    // No `shell: true`: args are passed straight to the child as argv slots, so a
    // `.ply` filename containing shell metacharacters can't be re-parsed/injected.
    // Windows needs the `.cmd` shim to resolve `npx` without a shell.
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const res = spawnSync(npx, ["splat-transform", src, ...actions, out], {
      cwd: webRoot,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      console.error(`[convert-splats] FAILED on ${basename(out)} (exit ${res.status})`);
      process.exit(res.status ?? 1);
    }
    converted++;
  }
}

console.log(`[convert-splats] done: ${converted} written, ${skipped} skipped.`);
