import type { NextRequest } from "next/server";
import { loadStore, findById } from "@/server/store";

export const runtime = "nodejs";

// GET /api/memories/[id] — one record. Open (no auth). The map-placement PATCH
// was removed with the contribution page; edit-mode transform saves go through
// /api/memories/[id]/transform instead.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  const { id } = await ctx.params;
  const record = findById(await loadStore(), id);
  if (!record) return new Response("not found", { status: 404 });
  return Response.json({ record });
}
