import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { geoToTransform } from "@/lib/geo/transform";
import { CITY } from "@/config/explorer";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

const ORIGIN = { lat: CITY.origin_lat, lon: CITY.origin_lon };

// GET /api/memories/[id] — one record (drives the placement page). Open (no auth).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  const { id } = await ctx.params;
  const record = findById(await loadStore(), id);
  if (!record) return new Response("not found", { status: 404 });
  return Response.json({ record });
}

interface PlacementBody {
  lat: number;
  lon: number;
  heading_deg: number;
  scale?: number;
}

// PATCH /api/memories/[id] — apply the curator's map placement: recompute the
// world transform from lat/lon + heading + scale (the geo math S2 doesn't do).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  const { id } = await ctx.params;

  const body = (await request.json()) as Partial<PlacementBody>;
  const { lat, lon, heading_deg } = body;
  if (![lat, lon, heading_deg].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return new Response("lat, lon, heading_deg must be finite numbers", { status: 400 });
  }
  const scale = typeof body.scale === "number" && body.scale > 0 ? body.scale : 1;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  const patch: Partial<ContribRecord> = {
    geo: { lat: lat!, lon: lon! },
    heading_deg: heading_deg!,
    transform: geoToTransform({ lat: lat!, lon: lon! }, ORIGIN, heading_deg!, scale),
  };
  const next = updateRecord(store, id, patch);
  await saveStore(next);
  return Response.json({ record: findById(next, id) });
}
