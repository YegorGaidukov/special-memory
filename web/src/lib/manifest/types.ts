// The explorer's input contract. Mirrors the project's memory-record spec, but
// only `id`, `status`, the asset URLs, and `transform` are required to render a
// memory — `geo`/`heading_deg`/`captured_at`/`created_at` are provenance and may
// be absent (e.g. messaging-app exports strip EXIF GPS).

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type MemoryStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "approved"
  | "failed";

export interface Transform {
  position: Vec3;
  /** Orientation as a quaternion [x,y,z,w] (matches the renderer's `rotation`). */
  quaternion: Quat;
  /** SHARP is metric, so usually [1,1,1]; a scalar is also accepted. */
  scale: Vec3 | number;
}

export interface Geo {
  lat: number;
  lon: number;
}

export interface MemoryRecord {
  id: string;
  status: MemoryStatus;
  thumbnail_url: string;
  splat_url: string;
  transform: Transform;
  /** Human-given title for the memory (S5b). Shown as the label in Explore/Library. */
  name?: string;
  captured_at?: string;
  geo?: Geo;
  heading_deg?: number;
  created_at?: string;
  /** Optional voice note recorded with the memory (S4). Resolved against the asset
   *  base URL like splat_url; played as positional audio near the memory. */
  audio_url?: string;
}

export interface CityConfig {
  name: string;
  origin_lat: number;
  origin_lon: number;
}

export interface ExplorerManifest {
  city: CityConfig;
  memories: MemoryRecord[];
}
