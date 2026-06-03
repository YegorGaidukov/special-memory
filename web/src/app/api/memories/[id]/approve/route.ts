import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { publishManifest } from "@/server/publish";
import { CITY } from "@/config/explorer";

export const runtime = "nodejs";

// POST /api/memories/[id]/approve — the curated gate. Only `ready` records (a
// splat exists) can be approved; approving republishes the explorer manifest so
// the memory appears in the void. Open (no auth).
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]/approve">) {
  const { id } = await ctx.params;

  const store = await loadStore();
  const record = findById(store, id);
  if (!record) return new Response("not found", { status: 404 });
  if (record.status !== "ready" && record.status !== "approved") {
    return new Response(`cannot approve a '${record.status}' record (ingest a splat first)`, {
      status: 409,
    });
  }

  const next = updateRecord(store, id, { status: "approved" });
  await saveStore(next);
  await publishManifest(next, {
    name: CITY.name,
    origin_lat: CITY.origin_lat,
    origin_lon: CITY.origin_lon,
  });
  return Response.json({ record: findById(next, id) });
}
