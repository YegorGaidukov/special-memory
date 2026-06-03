import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";

export const runtime = "nodejs";

// POST /api/memories/[id]/fail — the GPU watcher reports a reconstruction failure.
// Sets status "failed" and stores the error message. Open (no auth).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/memories/[id]/fail">) {
  const { id } = await ctx.params;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  let error = "reconstruction failed";
  try {
    const body = await req.json();
    if (body && typeof body.error === "string") error = body.error;
  } catch {
    // empty/invalid body → keep the default message
  }

  const next = updateRecord(store, id, { status: "failed", error });
  await saveStore(next);
  return Response.json({ record: findById(next, id) });
}
