import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadStore, saveStore, addRecord } from "@/server/store";
import { parsePlacement } from "@/server/exif";
import { makeRecordId, extOf } from "@/server/id";
import { UPLOADS_DIR, RECON_INBOX } from "@/server/paths";
import { placementTransform } from "@/lib/upload/placement";
import { CITY, FLY_TO_STANDOFF } from "@/config/explorer";
import type { Vec3 } from "@/lib/manifest/types";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

const ORIGIN = { lat: CITY.origin_lat, lon: CITY.origin_lon };

// GET /api/memories — list all records (drives placeholder spheres + refetch).
export async function GET() {
  const store = await loadStore();
  return Response.json(store);
}

// A form field carrying a Vec3 as JSON (e.g. "[0,5,-10]"). Returns undefined for
// missing/invalid input so placement falls back cleanly.
function parseVec3(form: FormData, key: string): Vec3 | undefined {
  const raw = form.get(key);
  if (typeof raw !== "string") return undefined;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return [v[0], v[1], v[2]];
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

// POST /api/memories — multipart upload. Saves the original, copies it to the
// recon inbox for the GPU watcher, parses EXIF, and creates a `processing`
// record with its world transform already set (EXIF GPS, else the camera-front
// position the client sent). No placement page — the watcher takes it from here.
// Open (no auth).
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return new Response("missing 'photo' file field", { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = makeRecordId(file.name);
  const filename = `${id}${extOf(file.name)}`;

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, filename), buffer);
  await mkdir(RECON_INBOX, { recursive: true });
  await writeFile(join(RECON_INBOX, filename), buffer);

  const placement = await parsePlacement(buffer);
  const transform = placementTransform(
    {
      geo: placement.geo,
      cameraPosition: parseVec3(form, "camera_position"),
      cameraForward: parseVec3(form, "camera_forward"),
    },
    ORIGIN,
    FLY_TO_STANDOFF,
  );

  const record: ContribRecord = {
    id,
    // Reconstruction is auto-triggered (the GPU watcher picks the inbox copy up),
    // so a fresh upload is already "processing".
    status: "processing",
    source_image: filename,
    thumbnail_url: "",
    splat_url: "",
    transform,
    geo: placement.geo,
    heading_deg: placement.geo ? 0 : undefined,
    captured_at: placement.captured_at,
    created_at: new Date().toISOString(),
  };

  const store = await loadStore();
  await saveStore(addRecord(store, record));

  return Response.json({ record }, { status: 201 });
}
