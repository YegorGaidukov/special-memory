import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUBLIC_MEMORIES_DIR } from "@/server/paths";
import { assetContentType, safeAssetName } from "@/server/asset";

export const runtime = "nodejs";
// Read from disk on every request — never prerender/cache at build, since the
// GPU watcher writes new memory assets here while the server runs.
export const dynamic = "force-dynamic";

// GET /api/asset/[name] — stream a memory asset (.sog / .preview.ply / .jpg /
// manifest.json) from PUBLIC_MEMORIES_DIR at request time. This replaces relying
// on Next's static public/ serving, which only exposes files that existed at
// build time and so 404s the splats produced by a live drop. Open (no auth),
// same-origin (COOP/COEP from next.config still satisfied). The filename safety
// (no traversal / sub-dirs) is the unit-tested `safeAssetName`; this handler is
// the fs seam.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/asset/[name]">) {
  const { name } = await ctx.params;
  const safe = safeAssetName(name);
  if (!safe) return new Response("bad request", { status: 400 });

  try {
    const data = await readFile(join(PUBLIC_MEMORIES_DIR, safe));
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "content-type": assetContentType(safe),
        "content-length": String(data.byteLength),
        // Match Next's public/ policy: revalidate, never cache a stale asset.
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
