"use client";

import type { StoredTransform } from "@/lib/transform/apply";
import type { GizmoMode } from "@/components/SplatGizmo";

const MODES: { id: GizmoMode; label: string; key: string }[] = [
  { id: "translate", label: "Move", key: "G" },
  { id: "rotate", label: "Rotate", key: "R" },
  { id: "scale", label: "Scale", key: "S" },
];

const f = (n: number) => n.toFixed(2);

/**
 * DOM overlay (outside the canvas) for the transform editor: mode buttons, a
 * live readout of the selected memory's transform, and Save. Shared by the
 * explorer edit mode and the placement-page editor. Purely presentational — the
 * parent owns the selected object, mode state, and persistence.
 */
export default function EditHud({
  mode,
  onModeChange,
  transform,
  onSave,
  saving,
  saveError,
  selectedLabel,
  hint,
  onDeselect,
  onExit,
}: {
  mode: GizmoMode;
  onModeChange: (m: GizmoMode) => void;
  transform: StoredTransform | null;
  onSave: () => void;
  saving: boolean;
  saveError?: string | null;
  selectedLabel?: string | null;
  hint?: string | null;
  onDeselect?: () => void;
  onExit?: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        padding: 12,
        minWidth: 240,
        borderRadius: 8,
        background: "rgba(8,10,16,0.82)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#e6e9f0",
        font: "13px monospace",
        pointerEvents: "auto",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 12, letterSpacing: 0.5 }}>EDIT PLACEMENT</strong>
        {onExit && (
          <button onClick={onExit} style={{ font: "12px monospace", cursor: "pointer" }}>
            Exit
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            disabled={!transform}
            title={`${m.label} (${m.key})`}
            style={{
              flex: 1,
              padding: "6px 0",
              cursor: transform ? "pointer" : "default",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.18)",
              background: mode === m.id ? "rgba(120,150,255,0.35)" : "transparent",
              color: "inherit",
              font: "12px monospace",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {transform ? (
        <div style={{ display: "grid", gap: 2, color: "#9aa3b8" }}>
          <span>
            pos {f(transform.position[0])}, {f(transform.position[1])}, {f(transform.position[2])}
          </span>
          <span>
            rot {f(transform.quaternion[0])}, {f(transform.quaternion[1])},{" "}
            {f(transform.quaternion[2])}, {f(transform.quaternion[3])}
          </span>
          <span>scale ×{f(transform.scale)}</span>
        </div>
      ) : (
        <div style={{ color: "#9aa3b8" }}>{hint ?? "Select a memory to edit."}</div>
      )}

      {transform && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{ flex: 1, padding: "7px 0", cursor: "pointer" }}
          >
            {saving ? "Saving…" : "Save placement"}
          </button>
          {onDeselect && (
            <button onClick={onDeselect} style={{ padding: "7px 10px", cursor: "pointer" }}>
              Deselect
            </button>
          )}
        </div>
      )}

      {selectedLabel && <div style={{ color: "#6b7488", fontSize: 11 }}>{selectedLabel}</div>}
      {saveError && <div style={{ color: "#ff8080" }}>{saveError}</div>}
    </div>
  );
}
