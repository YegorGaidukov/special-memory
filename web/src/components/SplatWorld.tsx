"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useManifest } from "@/hooks/useManifest";
import { usePendingMemories } from "@/hooks/usePendingMemories";
import { selectPending, hasUnpublishedApproved } from "@/lib/pending/select";
import Navigation from "@/components/Navigation";
import Travel from "@/components/Travel";
import Memories from "@/components/Memories";
import CameraPoseProbe from "@/components/CameraPoseProbe";
import PendingSpheres from "@/components/PendingSpheres";
import MapGround from "@/components/MapGround";
import ExplorerEditor from "@/components/ExplorerEditor";
import EditHud, { type Shortcut } from "@/components/EditHud";
import TravelOverlay from "@/components/TravelOverlay";
import type { GizmoMode } from "@/components/Gizmo";
import { applyStoredTransform, type StoredTransform } from "@/lib/transform/apply";
import { applyEdits } from "@/lib/transform/overlay";
import { MAP } from "@/config/explorer";
import { getResident } from "@/lib/splat/registry";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./SplatWorld.module.css";

// Shown in the inspector's empty state (edit mode on, nothing selected yet).
const EDIT_SHORTCUTS: Shortcut[] = [
  { keys: ["Click"], label: "Select a memory" },
  { keys: ["G", "R", "S"], label: "Move · rotate · scale" },
];

// Stable empty list so the nav/travel effects don't re-bind before the manifest loads.
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

export default function SplatWorld() {
  const [manifestVersion, setManifestVersion] = useState(0);
  const [mapVisible, setMapVisible] = useState<boolean>(MAP.enabled);
  const m = useManifest(manifestVersion);
  const storeRecords = usePendingMemories();
  const [current, setCurrent] = useState<MemoryRecord | null>(null);
  const baseRecords = m.status === "ready" ? m.manifest.memories : EMPTY;

  // Edit mode: a curator toggle (off by default — the public fly-through is
  // untouched). Navigation (orbit + WASD) is shared by both modes; edit mode adds
  // a transform gizmo on the selected memory, writing the edit straight to the
  // record.
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [liveTransform, setLiveTransform] = useState<StoredTransform | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // In-session edits keyed by memory id. The manifest is fetched once and never
  // refetched, so without this overlay the LOD loop would rebuild an edited
  // memory's mesh from its stale stored transform and snap it back. Overlaying
  // the live edits keeps the in-memory model consistent with what's on screen
  // (and on disk after save). Empty in the public fly-through → no-op identity.
  const [edits, setEdits] = useState<Record<string, StoredTransform>>({});
  const records = useMemo(() => applyEdits(baseRecords, edits), [baseRecords, edits]);

  const manifestIds = useMemo(() => new Set(baseRecords.map((r) => r.id)), [baseRecords]);
  const pending = useMemo(
    () => selectPending(storeRecords, manifestIds),
    [storeRecords, manifestIds],
  );

  // When the store has an approved memory the loaded manifest doesn't include
  // yet, refetch so its splat loads (and its placeholder sphere drops out). The
  // ref guards against a redundant bump cascade if a slow manifest fetch hasn't
  // resolved before the next store poll: bump once, then wait for the refetch to
  // land (manifestIds gains the id → no longer stale) before allowing another.
  const refetching = useRef(false);
  useEffect(() => {
    const stale = hasUnpublishedApproved(storeRecords, manifestIds);
    if (stale && !refetching.current) {
      refetching.current = true;
      setManifestVersion((v) => v + 1);
    } else if (!stale) {
      refetching.current = false;
    }
  }, [storeRecords, manifestIds]);

  // Mirror the selected memory's live transform into the overlay on every gizmo
  // drag / numeric edit (not just on save), so a memory that the camera cycles
  // out of and back into never reverts mid-edit.
  //
  // Keyed only on `liveTransform`, NOT `selectedId` (read via a ref): selecting a
  // new memory flips `selectedId` while `liveTransform` still holds the PREVIOUS
  // selection's value (ExplorerEditor clears it a tick later). If `selectedId`
  // were a dependency, this effect would fire on that flip and stamp the stale
  // transform onto the new id — so the freshly force-loaded splat would
  // materialize at the previous splat's position. Reacting only to a real
  // `liveTransform` change avoids that cross-assignment.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => {
    const id = selectedIdRef.current;
    if (!id || !liveTransform) return;
    setEdits((e) => ({ ...e, [id]: liveTransform }));
  }, [liveTransform]);

  const exitEdit = useCallback(() => {
    setEditMode(false);
    setSelectedId(null);
    setLiveTransform(null);
    setSaveError(null);
  }, []);

  // A numeric-field edit in the inspector: write it onto the live resident mesh
  // (the gizmo follows the object each frame) and mirror it into the readout.
  const applyEdit = useCallback(
    (next: StoredTransform) => {
      if (!selectedId) return;
      const mesh = getResident(selectedId);
      if (mesh) applyStoredTransform(mesh, next);
      setLiveTransform(next);
    },
    [selectedId],
  );

  // E toggles edit mode; G/R/S switch gizmo mode. Ignored while typing in a field
  // so the inspector's numeric inputs don't trigger shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      if (e.key === "e" || e.key === "E") {
        setEditMode((on) => !on);
      } else if (e.key === "m" || e.key === "M") {
        setMapVisible((v) => !v);
      } else if (editMode) {
        if (e.key === "g" || e.key === "G") setMode("translate");
        else if (e.key === "r" || e.key === "R") setMode("rotate");
        else if (e.key === "s" || e.key === "S") setMode("scale");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  // Leaving edit mode clears the current selection.
  useEffect(() => {
    if (!editMode) {
      setSelectedId(null);
      setLiveTransform(null);
    }
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
      setSavedAt(Date.now());
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
        // MSAA on: Spark notes it doesn't improve the splats themselves, but the
        // curator editor's thin lines (gizmo, bbox brackets) are jagged without
        // it. The fill-rate cost is negligible at this scale; revisit if the
        // fly-through ever runs hundreds of splats (a deferred concern).
        gl={{ antialias: true }}
        camera={{ position: [0, 12, 70], fov: 60, near: 0.1, far: 20000 }}
      >
        <color attach="background" args={["#05060a"]} />
        <ContextLossLogger />
        <CameraPoseProbe />
        <MapGround visible={mapVisible} />
        {m.status === "ready" && (
          <Memories
            records={records}
            forceResidentId={editMode ? selectedId : null}
          />
        )}
        <PendingSpheres records={pending} />
        <Navigation />
        {editMode ? (
          <ExplorerEditor
            records={records}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mode={mode}
            onTransformChange={setLiveTransform}
          />
        ) : (
          <Travel records={records} onArrive={setCurrent} />
        )}
      </Canvas>
      {editMode ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none" }}>
          <EditHud
            mode={mode}
            onModeChange={setMode}
            transform={liveTransform}
            onEditTransform={applyEdit}
            onSave={saveTransform}
            saving={saving}
            saveError={saveError}
            savedAt={savedAt}
            selectedLabel={selectedId}
            hint={selectedId ? "Loading memory…" : "Click a memory to select it."}
            shortcuts={EDIT_SHORTCUTS}
            onDeselect={() => setSelectedId(null)}
            onExit={exitEdit}
          />
        </div>
      ) : (
        <>
          <button className={styles.editToggle} onClick={() => setEditMode(true)}>
            Edit placements
            <span className={styles.editKbd}>E</span>
          </button>
          <button
            className={styles.editToggle}
            style={{ top: 56 }}
            onClick={() => setMapVisible((v) => !v)}
          >
            {mapVisible ? "Hide map" : "Show map"}
            <span className={styles.editKbd}>M</span>
          </button>
        </>
      )}
      {/* The fly-through chrome (title + WASD hint) doesn't apply in edit mode,
          and its title would collide with the inspector header. */}
      {!editMode && (
        <TravelOverlay
          status={m.status}
          count={records.length}
          error={m.status === "error" ? m.error : undefined}
          current={current}
        />
      )}
    </>
  );
}
