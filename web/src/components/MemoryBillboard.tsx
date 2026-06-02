"use client";

import { Billboard, useTexture } from "@react-three/drei";
import type { MemoryRecord } from "@/lib/manifest/types";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { MEMORIES_BASE_URL } from "@/config/explorer";

// The "far" representation of a memory: its thumbnail photo on a camera-facing
// plane at the memory's position. Shown until the splat loads on approach.
const BILLBOARD_HEIGHT = 10;

export default function MemoryBillboard({
  record,
  visible,
}: {
  record: MemoryRecord;
  visible: boolean;
}) {
  const tex = useTexture(resolveAssetUrl(MEMORIES_BASE_URL, record.thumbnail_url));
  const img = tex.image as { width: number; height: number } | undefined;
  const aspect = img && img.height ? img.width / img.height : 1.5;
  const [x, y, z] = record.transform.position;

  return (
    <Billboard position={[x, y, z]} visible={visible}>
      <mesh>
        <planeGeometry args={[BILLBOARD_HEIGHT * aspect, BILLBOARD_HEIGHT]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </Billboard>
  );
}
