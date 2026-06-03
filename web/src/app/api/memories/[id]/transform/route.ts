import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { publishManifest } from "@/server/publish";
import { isValidTransform } from "@/lib/transform/validate";
import { CITY } from "@/config/explorer";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

// PATCH /api/memories/[id]/transform — write a transform straight from the 3D
// gizmo, bypassing the geo→transform math the base PATCH does. The stored
// transform becomes the authoritative placement (geo/heading_deg stay as
// provenance). If the memory is already approved, republish so the edit reaches
// the explorer immediately. Open (no auth), like the rest of S3.
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/memories/[id]/transform">,
) {
  const { id } = await ctx.params;

  const body = (await request.json()) as { transform?: unknown };
  if (!isValidTransform(body.transform)) {
    return new Response(
      "transform must be { position:[x,y,z], quaternion:[x,y,z,w], scale:>0 }",
      { status: 400 },
    );
  }

  const store = await loadStore();
  const record = findById(store, id);
  if (!record) return new Response("not found", { status: 404 });

  const patch: Partial<ContribRecord> = { transform: body.transform };
  const next = updateRecord(store, id, patch);
  await saveStore(next);

  if (record.status === "approved") {
    await publishManifest(next, {
      name: CITY.name,
      origin_lat: CITY.origin_lat,
      origin_lon: CITY.origin_lon,
    });
  }
  return Response.json({ record: findById(next, id) });
}
