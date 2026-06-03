import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { ingestFromDisk } from "@/server/ingest";

export const runtime = "nodejs";

// POST /api/memories/[id]/ingest — after the curator has run S1 + convert-splats
// and dropped <id>.sog into public/memories, scan for it and flip to `ready`.
// Open (no auth).
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]/ingest">) {
  const { id } = await ctx.params;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  const result = await ingestFromDisk(id);
  if (!result.ok) return new Response(result.reason, { status: 409 });

  const next = updateRecord(store, id, result.patch);
  await saveStore(next);
  return Response.json({ record: findById(next, id) });
}
