"use client";

import { Grid } from "@react-three/drei";

// A faint procedural street grid on the ground plane — a placeholder for the
// city's streets (real OSM lines are deferred). Fades out with distance so it
// suggests a ground without hard edges.
export default function StreetGrid() {
  return (
    <Grid
      position={[0, -0.01, 0]}
      infiniteGrid
      cellSize={5}
      cellThickness={0.5}
      cellColor="#1b2440"
      sectionSize={25}
      sectionThickness={1}
      sectionColor="#2c3c6e"
      fadeDistance={260}
      fadeStrength={1.5}
    />
  );
}
