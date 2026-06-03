import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadStore, saveStore, addRecord } from "@/server/store";
import { parsePlacement } from "@/server/exif";
import { makeRecordId, extOf } from "@/server/id";
import { UPLOADS_DIR, RECON_INBOX } from "@/server/paths";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

// GET /api/memories — list all records (curator review queue). Open (no auth).
export async function GET() {
  const store = await loadStore();
  return Response.json(store);
}

// POST /api/memories — multipart upload. Saves the original, copies it to the
// recon inbox for the curator's manual SHARP run, parses EXIF for an initial
// placement, and creates an `uploaded` record. Open (no auth).
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

  const record: ContribRecord = {
    id,
    status: "uploaded",
    source_image: filename,
    thumbnail_url: "",
    splat_url: "",
    // Placeholder transform until the curator places it. The store holds it; it
    // is NOT published until approved, so the explorer never sees it.
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    geo: placement.geo,
    captured_at: placement.captured_at,
    created_at: new Date().toISOString(),
  };

  const store = await loadStore();
  await saveStore(addRecord(store, record));

  return Response.json({ record }, { status: 201 });
}
