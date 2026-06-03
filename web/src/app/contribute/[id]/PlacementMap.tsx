"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./PlacementMap.module.css";

// An accent-filled track for a range input, as an inline background gradient.
function trackFill(pct: number): string {
  return `linear-gradient(to right, var(--accent) ${pct}%, var(--line-strong) ${pct}%)`;
}

const WOLFSBURG = { lat: 52.4227, lon: 10.7865 };

// Key-free OSM raster style (fine for a curation tool / uni exhibition).
const OSM_STYLE: maplibregl.StyleSpecification = {
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

export interface Placement {
  lat: number;
  lon: number;
  heading_deg: number;
  scale: number;
}

/**
 * Draggable pin on a Wolfsburg map + heading + scale controls. MapLibre is the
 * un-testable canvas seam; the geo math it feeds (lat/lon/heading -> transform)
 * runs server-side in the PATCH route and is unit-tested. `onSave` posts the
 * placement; the parent handles navigation.
 */
export default function PlacementMap({
  initial,
  onSave,
}: {
  initial: Partial<Placement>;
  onSave: (p: Placement) => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [lat, setLat] = useState(initial.lat ?? WOLFSBURG.lat);
  const [lon, setLon] = useState(initial.lon ?? WOLFSBURG.lon);
  const [heading, setHeading] = useState(initial.heading_deg ?? 0);
  const [scale, setScale] = useState(initial.scale ?? 1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: OSM_STYLE,
      center: [lon, lat],
      zoom: 14,
    });
    const marker = new maplibregl.Marker({ draggable: true }).setLngLat([lon, lat]).addTo(map);
    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      setLat(ll.lat);
      setLon(ll.lng);
    });
    markerRef.current = marker;
    return () => map.remove();
    // Mount once; subsequent state changes update the marker via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in sync if lat/lon change from the number inputs.
  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
  }, [lat, lon]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ lat, lon, heading_deg: heading, scale });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.controls}>
      <div ref={container} className={styles.map} />

      <div className={styles.control}>
        <div className={styles.controlHead}>
          <span className={styles.label}>Facing heading</span>
          <span className={styles.value}>{heading}°</span>
        </div>
        <input
          className={styles.range}
          type="range"
          min={0}
          max={359}
          value={heading}
          onChange={(e) => setHeading(Number(e.target.value))}
          style={{ background: trackFill((heading / 359) * 100) }}
        />
        <span className={styles.hint}>0 = north, 90 = east</span>
      </div>

      <div className={styles.control}>
        <div className={styles.controlHead}>
          <span className={styles.label}>Scale nudge</span>
          <span className={styles.value}>×{scale.toFixed(2)}</span>
        </div>
        <input
          className={styles.range}
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          style={{ background: trackFill(((scale - 0.25) / (3 - 0.25)) * 100) }}
        />
      </div>

      <p className={styles.readout}>
        lat {lat.toFixed(5)}, lon {lon.toFixed(5)}
      </p>

      <button className={styles.save} onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save placement"}
      </button>
    </div>
  );
}
