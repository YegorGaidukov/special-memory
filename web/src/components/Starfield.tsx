"use client";

import { Stars } from "@react-three/drei";

// The dark-void backdrop: a slow, faint starfield surrounding the city so the
// world reads as an infinite void rather than empty black.
export default function Starfield() {
  return (
    <Stars
      radius={400}
      depth={80}
      count={6000}
      factor={4}
      saturation={0}
      fade
      speed={0.3}
    />
  );
}
