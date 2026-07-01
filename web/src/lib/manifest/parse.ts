import type {
  CityConfig,
  ExplorerManifest,
  Geo,
  MemoryRecord,
  MemoryStatus,
  Quat,
  Transform,
  Vec3,
} from "./types";

// A memory is only shown once it actually has a splat to render. Lifecycle
// states without one (uploaded/processing/failed) are filtered out — that's
// normal, not an error. Structural problems (missing/short transform) throw,
// since they mean the producing pipeline emitted bad data.
const RENDERABLE_STATUSES: ReadonlySet<MemoryStatus> = new Set<MemoryStatus>([
  "ready",
  "approved",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, ctx: string): string {
  if (typeof v !== "string") throw new Error(`${ctx}: expected string`);
  return v;
}

function asNumber(v: unknown, ctx: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`${ctx}: expected a finite number`);
  }
  return v;
}

function asNumberArray(v: unknown, len: number, ctx: string): number[] {
  if (!Array.isArray(v) || v.length !== len) {
    throw new Error(`${ctx}: expected a ${len}-element number array`);
  }
  return v.map((x, i) => asNumber(x, `${ctx}[${i}]`));
}

function parseTransform(v: unknown, ctx: string): Transform {
  if (!isRecord(v)) throw new Error(`${ctx}: missing transform`);
  const position = asNumberArray(v.position, 3, `${ctx}.position`) as Vec3;
  const quaternion = asNumberArray(v.quaternion, 4, `${ctx}.quaternion`) as Quat;
  const scale =
    typeof v.scale === "number"
      ? asNumber(v.scale, `${ctx}.scale`)
      : (asNumberArray(v.scale, 3, `${ctx}.scale`) as Vec3);
  return { position, quaternion, scale };
}

function parseGeo(v: unknown, ctx: string): Geo {
  if (!isRecord(v)) throw new Error(`${ctx}: expected an object`);
  return { lat: asNumber(v.lat, `${ctx}.lat`), lon: asNumber(v.lon, `${ctx}.lon`) };
}

function parseMemory(v: unknown, idx: number): MemoryRecord {
  const ctx = `memories[${idx}]`;
  if (!isRecord(v)) throw new Error(`${ctx}: expected an object`);
  const record: MemoryRecord = {
    id: asString(v.id, `${ctx}.id`),
    status: asString(v.status, `${ctx}.status`) as MemoryStatus,
    thumbnail_url: asString(v.thumbnail_url, `${ctx}.thumbnail_url`),
    splat_url: asString(v.splat_url, `${ctx}.splat_url`),
    transform: parseTransform(v.transform, `${ctx}.transform`),
  };
  if (v.name != null) record.name = asString(v.name, `${ctx}.name`);
  if (v.captured_at != null) record.captured_at = asString(v.captured_at, `${ctx}.captured_at`);
  if (v.geo != null) record.geo = parseGeo(v.geo, `${ctx}.geo`);
  if (v.heading_deg != null) record.heading_deg = asNumber(v.heading_deg, `${ctx}.heading_deg`);
  if (v.created_at != null) record.created_at = asString(v.created_at, `${ctx}.created_at`);
  if (v.audio_url != null) record.audio_url = asString(v.audio_url, `${ctx}.audio_url`);
  return record;
}

function parseCity(v: unknown): CityConfig {
  if (!isRecord(v)) throw new Error("manifest.city: missing city config");
  return {
    name: asString(v.name, "city.name"),
    origin_lat: asNumber(v.origin_lat, "city.origin_lat"),
    origin_lon: asNumber(v.origin_lon, "city.origin_lon"),
  };
}

/**
 * Validate and type a raw explorer manifest. Throws on structural errors;
 * filters memories down to those that can actually be rendered.
 */
export function parseManifest(raw: unknown): ExplorerManifest {
  if (!isRecord(raw)) throw new Error("manifest: expected an object");
  const city = parseCity(raw.city);
  if (!Array.isArray(raw.memories)) {
    throw new Error("manifest.memories: expected an array");
  }
  const memories = raw.memories
    .map((m, i) => parseMemory(m, i))
    .filter((m) => RENDERABLE_STATUSES.has(m.status));
  return { city, memories };
}
