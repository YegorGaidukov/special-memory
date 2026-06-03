"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { MEMORIES_BASE_URL } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import {
  toSplatSceneArgs,
  readMeshTransform,
  applyStoredTransform,
  type StoredTransform,
} from "@/lib/transform/apply";
import Gizmo, { type GizmoMode } from "@/components/Gizmo";
import EditHud from "@/components/EditHud";
import type { MemoryRecord } from "@/lib/manifest/types";

// One memory's splat in its own scene, with a gizmo. Mirrors how Memories.tsx
// builds a SparkRenderer + SplatMesh, but for a single record so a curator can
// fine-tune its placement in 3D. The mesh is created imperatively and handed to
// the gizmo once Spark reports it initialized.
function SingleSplat({
  record,
  mode,
  onChange,
  onMesh,
  onDraggingChanged,
}: {
  record: MemoryRecord;
  mode: GizmoMode;
  onChange: (t: StoredTransform) => void;
  onMesh: (m: SplatMesh | null) => void;
  onDraggingChanged: (dragging: boolean) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const [mesh, setMesh] = useState<SplatMesh | null>(null);

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    scene.add(spark);

    const { position, rotation, scale } = toSplatSceneArgs(record);
    const m = new SplatMesh({ url: resolveAssetUrl(MEMORIES_BASE_URL, record.splat_url) });
    m.position.set(position[0], position[1], position[2]);
    m.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
    m.scale.setScalar(scale[0]);
    scene.add(m);

    m.initialized
      .then(() => {
        setMesh(m);
        onMesh(m); // expose the mesh so numeric-field edits can write to it
        onChange(readMeshTransform(m)); // seed the HUD with the loaded transform
      })
      .catch((err) => console.error("[editor] splat load failed", record.id, err));

    return () => {
      onMesh(null);
      scene.remove(m);
      m.dispose();
      scene.remove(spark);
      spark.dispose();
    };
    // Rebuild only if the memory or its asset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, record.id, record.splat_url]);

  return mesh ? (
    <Gizmo
      object={mesh}
      mode={mode}
      onObjectChange={() => onChange(readMeshTransform(mesh))}
      onDraggingChanged={onDraggingChanged}
    />
  ) : null;
}

/**
 * 3D placement editor for a single memory, shown on the placement page once the
 * splat asset exists (status ready/approved). Orbit to inspect, drag the gizmo
 * to translate/rotate/uniform-scale, Save to PATCH the transform directly.
 */
export default function MemoryEditor3D({ record }: { record: MemoryRecord }) {
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [transform, setTransform] = useState<StoredTransform | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const meshRef = useRef<SplatMesh | null>(null);

  // A numeric-field edit: write it onto the live mesh, then mirror to the readout.
  const applyEdit = (next: StoredTransform) => {
    if (meshRef.current) applyStoredTransform(meshRef.current, next);
    setTransform(next);
  };

  // Keyboard mode switch (G/R/S), Blender-style.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "g" || e.key === "G") setMode("translate");
      else if (e.key === "r" || e.key === "R") setMode("rotate");
      else if (e.key === "s" || e.key === "S") setMode("scale");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const target = toSplatSceneArgs(record).position;

  async function save() {
    if (!transform) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/memories/${record.id}/transform`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transform }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 420,
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--line)",
        overflow: "hidden",
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true }} // crisp gizmo/lines for the curator editor
        camera={{ position: [target[0], target[1] + 3, target[2] + 10], fov: 60, near: 0.1, far: 3000 }}
      >
        <color attach="background" args={["#05060a"]} />
        <OrbitControls makeDefault target={target} />
        <SingleSplat
          record={record}
          mode={mode}
          onChange={setTransform}
          onMesh={(m) => (meshRef.current = m)}
          onDraggingChanged={() => {}}
        />
      </Canvas>
      <EditHud
        mode={mode}
        onModeChange={setMode}
        transform={transform}
        onEditTransform={applyEdit}
        onSave={save}
        saving={saving}
        saveError={saveError}
        savedAt={savedAt}
        hint="Loading memory…"
      />
    </div>
  );
}
