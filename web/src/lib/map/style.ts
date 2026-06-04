import type { StyleSpecification } from "maplibre-gl";

// Key-free OSM raster style (fine for a curated uni exhibition). This is the
// swappable surface for restyling the ground map — replace this object, or any
// field of `MAP` in config/explorer.ts. `import type` keeps maplibre-gl out of
// any server bundle that transitively imports config (the type is erased).
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
