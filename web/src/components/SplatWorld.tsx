"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useState } from "react";
import { useManifest } from "@/hooks/useManifest";
import FreeFly from "@/components/FreeFly";
import Memories from "@/components/Memories";
import ExplorerEditor from "@/components/ExplorerEditor";
import EditHud from "@/components/EditHud";
import TravelOverlay from "@/components/TravelOverlay";
import type { GizmoMode } from "@/components/SplatGizmo";
import type { StoredTransform } from "@/lib/transform/apply";
import type { MemoryRecord } from "@/lib/manifest/types";

// Stable empty list so FreeFly's effects don't re-bind before the manifest loads.
const EMPTY: MemoryRecord[] = [];

function ContextLossLogger() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const onLost = () => console.warn("[explorer] WebGL context lost");
    gl.domElement.addEventListener("webglcontextlost", onLost);
    return () => gl.domElement.removeEventListener("webglcontextlost", onLost);
  }, [gl]);
  return null;
}

function Crosshair() {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        width: 6,
        height: 6,
        marginLeft: -3,
        marginTop: -3,
        borderRadius: "50%",
        background: "rgba(230,233,240,0.5)",
        pointerEvents: "none",
      }}
    />
  );
}

export default function SplatWorld() {
  const m = useManifest();
  const [current, setCurrent] = useState<MemoryRecord | null>(null);
  const records = m.status === "ready" ? m.manifest.memories : EMPTY;

  // Edit mode: a curator toggle (off by default — the public fly-through is
  // untouched). It swaps pointer-lock free-fly for OrbitControls + a transform
  // gizmo on the selected memory, writing the edit straight to the record.
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [liveTransform, setLiveTransform] = useState<StoredTransform | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const exitEdit = useCallback(() => {
    setEditMode(false);
    setSelectedId(null);
    setLiveTransform(null);
    setSaveError(null);
  }, []);

  // E toggles edit mode (releasing pointer lock); G/R/S switch gizmo mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "e" || e.key === "E") {
        setEditMode((on) => {
          const next = !on;
          if (next) document.exitPointerLock();
          else {
            setSelectedId(null);
            setLiveTransform(null);
          }
          return next;
        });
      } else if (editMode) {
        if (e.key === "g" || e.key === "G") setMode("translate");
        else if (e.key === "r" || e.key === "R") setMode("rotate");
        else if (e.key === "s" || e.key === "S") setMode("scale");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  async function saveTransform() {
    if (!selectedId || !liveTransform) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/memories/${selectedId}/transform`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transform: liveTransform }),
      });
      if (!r.ok) throw new Error(await r.text());
    } catch (e) {
      setSaveError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Canvas
        style={{ position: "fixed", inset: 0 }}
        // Cap device-pixel-ratio: splats are fill-rate bound, so rendering at a
        // retina 2x+ costs ~4x the fragments for little visible gain. [1, 1.5]
        // keeps it crisp while bounding the pixel count on high-DPI displays.
        dpr={[1, 1.5]}
        // Spark advises antialias:false — MSAA doesn't improve Gaussian splats
        // and significantly reduces performance.
        gl={{ antialias: false }}
        camera={{ position: [0, 12, 70], fov: 60, near: 0.1, far: 3000 }}
      >
        <color attach="background" args={["#05060a"]} />
        <ContextLossLogger />
        {m.status === "ready" && (
          <Memories
            records={m.manifest.memories}
            forceResidentId={editMode ? selectedId : null}
          />
        )}
        {editMode ? (
          <ExplorerEditor
            records={records}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mode={mode}
            onTransformChange={setLiveTransform}
          />
        ) : (
          <FreeFly records={records} onArrive={setCurrent} />
        )}
      </Canvas>
      {!editMode && <Crosshair />}
      {editMode ? (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
          <EditHud
            mode={mode}
            onModeChange={setMode}
            transform={liveTransform}
            onSave={saveTransform}
            saving={saving}
            saveError={saveError}
            selectedLabel={selectedId}
            hint={selectedId ? "Loading memory…" : "Click a memory to select it."}
            onDeselect={() => setSelectedId(null)}
            onExit={exitEdit}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            document.exitPointerLock();
            setEditMode(true);
          }}
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 10,
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(8,10,16,0.7)",
            color: "#e6e9f0",
            font: "12px monospace",
            cursor: "pointer",
          }}
        >
          Edit (E)
        </button>
      )}
      <TravelOverlay
        status={m.status}
        count={records.length}
        error={m.status === "error" ? m.error : undefined}
        current={current}
      />
    </>
  );
}
