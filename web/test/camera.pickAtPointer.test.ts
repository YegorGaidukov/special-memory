import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { memoryAtPointer } from "@/lib/camera/pickAtPointer";
import { setBounds, clearBounds } from "@/lib/splat/registry";
import type { MemoryRecord } from "@/lib/manifest/types";

function rec(id: string, position: [number, number, number]): MemoryRecord {
  return {
    id,
    status: "approved",
    thumbnail_url: "a.jpg",
    splat_url: "a.sog",
    transform: { position, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

// A unit cube local bbox; placed by each memory's transform via worldMatrix.
const unitBox = () => new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));

// Camera at (0,0,10) looking toward -Z (down the +Z column at the origin).
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  c.position.set(0, 0, 10);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

const CENTER = new THREE.Vector2(0, 0);

describe("memoryAtPointer", () => {
  beforeEach(() => {
    clearBounds("a");
    clearBounds("b");
  });

  it("picks the memory under the cursor", () => {
    setBounds("a", unitBox());
    const a = rec("a", [0, 0, 0]);
    expect(memoryAtPointer([a], CENTER, camera())).toBe("a");
  });

  it("ignores memories not under the cursor", () => {
    setBounds("b", unitBox());
    const b = rec("b", [50, 0, 0]); // way off to the side, not under center ray
    expect(memoryAtPointer([b], CENTER, camera())).toBeNull();
  });

  it("picks the nearest of two memories stacked along the ray", () => {
    setBounds("a", unitBox());
    setBounds("b", unitBox());
    const near = rec("a", [0, 0, 4]); // closer to the camera at (0,0,10)
    const far = rec("b", [0, 0, -4]);
    expect(memoryAtPointer([far, near], CENTER, camera())).toBe("a");
  });

  it("returns null for a memory whose bounds haven't loaded yet", () => {
    const a = rec("a", [0, 0, 0]); // no setBounds("a")
    expect(memoryAtPointer([a], CENTER, camera())).toBeNull();
  });
});
