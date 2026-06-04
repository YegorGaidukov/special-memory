import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { ingestFromDisk } from "@/server/ingest";
import { publishManifest } from "@/server/publish";
import { CITY } from "@/config/explorer";

export const runtime = "nodejs";

// POST /api/memories/[id]/ingest — the watcher's callback after S1 +
// convert-splats dropped <id>.sog into public/memories. Flip to `ready`, then
// (no admin gate in the stripped-down flow) auto-approve and republish the
// manifest so the memory appears in the explorer. Open (no auth).
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]/ingest">) {
  const { id } = await ctx.params;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  const result = await ingestFromDisk(id);
  if (!result.ok) return new Response(result.reason, { status: 409 });

  // ready (asset urls) → approved in one step, then publish.
  const ready = updateRecord(store, id, result.patch);
  const approved = updateRecord(ready, id, { status: "approved" });
  await saveStore(approved);
  await publishManifest(approved, {
    name: CITY.name,
    origin_lat: CITY.origin_lat,
    origin_lon: CITY.origin_lon,
  });

  return Response.json({ record: findById(approved, id) });
}
