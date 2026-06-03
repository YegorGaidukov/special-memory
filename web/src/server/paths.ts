import { join } from "node:path";

// Resolved server directories. Defaults keep everything inside web/; env vars let
// the exhibition machine point the recon inbox at S1's input folder. The web
// process never runs SHARP — it only reads/writes these directories.
const cwd = process.cwd();

/** Original uploaded photos (provenance, re-runs). Git-ignored under web/data/. */
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(cwd, "data", "uploads");

/** Where uploads are copied for the curator's manual S1 run. */
export const RECON_INBOX = process.env.RECON_INBOX ?? join(cwd, "data", "inbox");

/** The explorer's asset + manifest directory. */
export const PUBLIC_MEMORIES_DIR =
  process.env.PUBLIC_MEMORIES_DIR ?? join(cwd, "public", "memories");
