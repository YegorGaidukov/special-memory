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
import EditHud from "@/components/EditHud";
import Toolbar from "@/components/Toolbar";
import Library from "@/components/Library";
import MemoryAudio from "@/components/MemoryAudio";
import RemoteControlClient from "@/components/RemoteControlClient";
import { useTheme } from "@/hooks/useTheme";
import { applyStoredTransform, type StoredTransform } from "@/lib/transform/apply";
import { applyEdits } from "@/lib/transform/overlay";
import { groundMove } from "@/lib/transform/place";
import { MAP } from "@/config/explorer";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import { getResident } from "@/lib/splat/registry";
import { isVisibleInRange, type TimeRange } from "@/lib/explore/timeline";
import type { MemoryRecord } from "@/lib/manifest/types";

// Stable empty list so the nav/travel effects don't re-bind before the manifest loads.
const EMPTY: MemoryRecord[] = [];

// Canvas clear color per theme (kept in sync with --void in globals.css).
const VOID_COLOR = { dark: "#05060a", light: "#eef1f6" } as const;

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
  const baseRecords = m.status === "ready" ? m.manifest.memories : EMPTY;
  const { theme } = useTheme();

  // Library panel (memory list) + the travel command it issues. travelToId is set
  // when a row is clicked; Travel consumes it and we reset it to null so picking
  // the same memory again re-fires.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [travelToId, setTravelToId] = useState<string | null>(null);
  // Browsers block audio until a user gesture; the "enable sound" button flips this.
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Edit mode: a curator toggle (off by default — the public fly-through is
  // untouched). Navigation (orbit + WASD) is shared by both modes; edit mode adds
  // a transform gizmo on the selected memory, writing the edit straight to the
  // record.
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Phone timeline filter: the projected city shows only memories captured within the
  // active year window (undated memories always stay). Null = no filter (show all).
  // Only the rendered/audible city is filtered — Library/Travel keep the full set.
  const [filterRange, setFilterRange] = useState<TimeRange | null>(null);
  const handleFilter = useCallback((from: number, to: number) => {
    setFilterRange({ from, to });
  }, []);
  const visibleRecords = useMemo(
    () => (filterRange ? records.filter((r) => isVisibleInRange(r, filterRange)) : records),
    [records, filterRange],
  );

  // Latest records read by the (stable) remote-jump handler without reconnecting the
  // control socket each time records change.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const handleRemoteJump = useCallback((target: string) => {
    const recs = recordsRef.current;
    if (recs.length === 0) return;
    const id =
      target === "random"
        ? recs[Math.floor(Math.random() * recs.length)].id
        : recs.some((r) => r.id === target)
          ? target
          : null;
    if (id) setTravelToId(id);
  }, []);

  // A memory-move streamed from the phone Explore field: slide the memory to the
  // new ground x/z live by folding it into the edits overlay (drives Memories'
  // re-place effect for both the splat and its ghost). The phone owns persistence
  // (its own PATCH), so this is display-only — no write here.
  const handleRemotePlace = useCallback((id: string, x: number, z: number) => {
    const rec = recordsRef.current.find((r) => r.id === id);
    if (!rec) return;
    setEdits((e) => ({ ...e, [id]: groundMove(rec.transform, x, z) }));
  }, []);

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
  // Latest transform on screen, read at save-fire time (the debounce closure must
  // not capture a stale value).
  const liveRef = useRef(liveTransform);
  liveRef.current = liveTransform;
  useEffect(() => {
    const id = selectedIdRef.current;
    if (!id || !liveTransform) return;
    setEdits((e) => ({ ...e, [id]: liveTransform }));
  }, [liveTransform]);

  // Auto-save: edits persist on their own (no Save button). Debounced so a gizmo
  // drag or a burst of keystrokes coalesces into one PATCH once it settles. Only
  // user edits call scheduleSave — selecting a memory (which sets liveTransform to
  // its stored value) never does, so picking a memory doesn't trigger a write.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTransform = useCallback(async (id: string, t: StoredTransform) => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`${getApiBaseUrl()}/api/memories/${id}/transform`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transform: t }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }, []);
  const scheduleSave = useCallback(() => {
    const id = selectedIdRef.current;
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const t = liveRef.current;
      if (t) void persistTransform(id, t);
    }, 400);
  }, [persistTransform]);
  // Flush any pending timer on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const exitEdit = useCallback(() => {
    setEditMode(false);
    setSelectedId(null);
    setLiveTransform(null);
    setSaveError(null);
  }, []);

  // Esc leaves edit mode (the inspector's only shown once a memory is selected,
  // so the keyboard is the reliable exit). Bound only while editing.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, exitEdit]);

  // A numeric-field edit in the inspector: write it onto the live resident mesh
  // (the gizmo follows the object each frame), mirror it into the readout, and
  // schedule the auto-save.
  const applyEdit = useCallback(
    (next: StoredTransform) => {
      if (!selectedId) return;
      const mesh = getResident(selectedId);
      if (mesh) applyStoredTransform(mesh, next);
      setLiveTransform(next);
      scheduleSave();
    },
    [selectedId, scheduleSave],
  );

  // Leaving edit mode clears the current selection.
  useEffect(() => {
    if (!editMode) {
      setSelectedId(null);
      setLiveTransform(null);
    }
  }, [editMode]);

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
        <color attach="background" args={[VOID_COLOR[theme]]} />
        <ContextLossLogger />
        <CameraPoseProbe />
        <MapGround visible={mapVisible} />
        {m.status === "ready" && (
          <Memories
            records={editMode ? records : visibleRecords}
            forceResidentId={editMode ? selectedId : null}
          />
        )}
        {m.status === "ready" && (
          <MemoryAudio records={editMode ? records : visibleRecords} enabled={soundEnabled} />
        )}
        <PendingSpheres records={pending} />
        <Navigation />
        {editMode ? (
          <ExplorerEditor
            records={records}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onTransformChange={setLiveTransform}
            onCommit={scheduleSave}
          />
        ) : (
          <Travel
            records={records}
            travelToId={travelToId}
            onTravelStarted={() => setTravelToId(null)}
          />
        )}
      </Canvas>
      {editMode ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none" }}>
          <EditHud
            transform={liveTransform}
            onEditTransform={applyEdit}
            saving={saving}
            saveError={saveError}
            savedAt={savedAt}
            selectedLabel={selectedId}
            onExit={exitEdit}
          />
        </div>
      ) : (
        <>
          <Toolbar
            mapVisible={mapVisible}
            libraryOpen={libraryOpen}
            soundEnabled={soundEnabled}
            onEdit={() => setEditMode(true)}
            onToggleMap={() => setMapVisible((v) => !v)}
            onToggleLibrary={() => setLibraryOpen((o) => !o)}
            onToggleSound={() => setSoundEnabled((s) => !s)}
          />
          {libraryOpen && (
            <Library
              records={records}
              onTravel={(id) => {
                setTravelToId(id);
                setLibraryOpen(false);
              }}
              onClose={() => setLibraryOpen(false)}
            />
          )}
        </>
      )}
      <RemoteControlClient
        onJump={handleRemoteJump}
        onFilter={handleFilter}
        onPlace={handleRemotePlace}
      />
      <Vignette theme={theme} />
    </>
  );
}

// A soft edge-darkening overlay. On a projector the image has a hard rectangular
// cutoff; fading each edge straight into the void color melts that border into the
// ambient so the picture reads as glowing out of darkness rather than a bright
// rectangle. Four straight (linear) gradients — one per edge — stacked, each
// fading from the void color at its edge to transparent inward (no radial falloff,
// so corners are the natural overlap of two edges).
// pointerEvents:none so it never intercepts clicks/drags; sits above the canvas
// but below the toolbar/HUD (those use higher z-index).
function Vignette({ theme }: { theme: "dark" | "light" }) {
  const edge = theme === "dark" ? "5, 6, 10" : "238, 241, 246";
  const band = (dir: string) =>
    `linear-gradient(${dir}, rgba(${edge}, 1) 0%, rgba(${edge}, 0) 10%)`;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        pointerEvents: "none",
        background: [
          band("to right"),
          band("to left"),
          band("to bottom"),
          band("to top"),
        ].join(", "),
      }}
    />
  );
}
