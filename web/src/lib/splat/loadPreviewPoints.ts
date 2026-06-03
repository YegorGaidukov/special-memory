import * as THREE from "three";
import { PlyReader } from "@sparkjsdev/spark";

// Fetch + parse a decimated `.preview.ply` into a THREE.Points cloud — the cheap
// "ghost" shown for a distant memory before its full splat loads. Spark's
// PlyReader yields each point's centre and RGB (already de-SH'd from f_dc), which
// we copy straight into position/color buffers.
//
// The geometry is in the splat's local frame; the caller positions/orients the
// returned Points exactly like the full SplatMesh (same transform), so the ghost
// and the splat occupy the same place and the swap is seamless.
//
// This is a WebGL/IO seam (fetch + Spark + three), exercised by the manual smoke
// test; the pure URL derivation is unit-tested in `lib/lod/previewUrl`.
export async function loadPreviewPoints(
  url: string,
  pointSize: number,
  signal?: AbortSignal,
): Promise<THREE.Points> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`preview fetch ${res.status} for ${url}`);
  const fileBytes = new Uint8Array(await res.arrayBuffer());

  const reader = new PlyReader({ fileBytes });
  await reader.parseHeader();

  const n = reader.numSplats;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  reader.parseSplats((i, x, y, z, _sx, _sy, _sz, _qx, _qy, _qz, _qw, _op, r, g, b) => {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: pointSize,
    sizeAttenuation: true,
    vertexColors: true,
    // transparent so the cross-dissolve into the splat can fade opacity 1 -> 0;
    // depthWrite off so the resolving splat shows through during that fade.
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}
