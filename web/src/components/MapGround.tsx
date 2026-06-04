"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CITY, MAP } from "@/config/explorer";
import { groundExtent } from "@/lib/map/extent";
import { renderMapToCanvas } from "@/lib/map/groundTexture";

// Faint Wolfsburg map laid flat under the memories. The texture is rendered once
// from MapLibre and aligned via the same geo projection as the splats. Styling
// comes from MAP (config); only `visible` changes at runtime.
//
// Orientation: MapLibre draws north-up / west-left. Rotating the plane -90° about
// X lays it on the XZ ground; lib/geo/project puts North at -Z and East at +X.
// `texture.flipY = false` + the rotation below align north→-Z; if the map looks
// mirrored or rotated during verification, adjust flipY / the Z rotation here.
export default function MapGround({ visible }: { visible: boolean }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const extent = useMemo(
    () => groundExtent({ lat: CITY.origin_lat, lon: CITY.origin_lon }, MAP.spanMeters),
    [],
  );

  useEffect(() => {
    let disposed = false;
    let tex: THREE.CanvasTexture | null = null;
    renderMapToCanvas(MAP.style, extent.bounds, MAP.textureSize)
      .then((canvas) => {
        if (disposed) return;
        tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        setTexture(tex);
      })
      .catch((e) => console.error("[map] ground texture failed", e));
    return () => {
      disposed = true;
      tex?.dispose();
    };
  }, [extent]);

  if (!texture) return null;
  return (
    <mesh visible={visible} rotation={[-Math.PI / 2, 0, 0]} position={[0, MAP.y, 0]}>
      <planeGeometry args={[extent.size, extent.size]} />
      <meshBasicMaterial
        map={texture}
        color={MAP.tint}
        transparent
        opacity={MAP.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
