"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { StoredTransform } from "@/lib/transform/apply";
import type { GizmoMode } from "@/components/Gizmo";
import { headingToQuaternion, quaternionToHeadingDeg } from "@/lib/geo/heading";
import styles from "./EditHud.module.css";

const MODES: { id: GizmoMode; label: string; key: string; icon: ReactElement }[] = [
  { id: "translate", label: "Move", key: "G", icon: <MoveIcon /> },
  { id: "rotate", label: "Rotate", key: "R", icon: <RotateIcon /> },
  { id: "scale", label: "Scale", key: "S", icon: <ScaleIcon /> },
];

/** A shortcut hint shown in the empty state (when nothing is selected). */
export interface Shortcut {
  keys: string[];
  label: string;
}

/**
 * Glass inspector (DOM overlay outside the canvas) for the transform editor:
 * mode switch, editable position/heading/scale fields, and Save. Shared by the
 * explorer edit mode and the placement-page editor. Presentational — the parent
 * owns the selected object, applies edits to the live mesh (`onEditTransform`),
 * and persists (`onSave`).
 */
export default function EditHud({
  mode,
  onModeChange,
  transform,
  onEditTransform,
  onSave,
  saving,
  saveError,
  savedAt,
  selectedLabel,
  hint,
  shortcuts,
  onDeselect,
  onExit,
}: {
  mode: GizmoMode;
  onModeChange: (m: GizmoMode) => void;
  transform: StoredTransform | null;
  onEditTransform?: (next: StoredTransform) => void;
  onSave: () => void;
  saving: boolean;
  saveError?: string | null;
  savedAt?: number | null;
  selectedLabel?: string | null;
  hint?: string | null;
  shortcuts?: Shortcut[];
  onDeselect?: () => void;
  onExit?: () => void;
}) {
  const activeIndex = MODES.findIndex((m) => m.id === mode);

  // Editing helpers: build the next stored transform from a single edited value.
  const setPosition = (axis: 0 | 1 | 2, v: number) => {
    if (!transform || !onEditTransform) return;
    const position = [...transform.position] as StoredTransform["position"];
    position[axis] = v;
    onEditTransform({ ...transform, position });
  };
  const setHeading = (deg: number) => {
    if (!transform || !onEditTransform) return;
    // Typing a heading snaps orientation to pure yaw (the placement convention).
    onEditTransform({ ...transform, quaternion: headingToQuaternion(deg) });
  };
  const setScale = (v: number) => {
    if (!transform || !onEditTransform) return;
    onEditTransform({ ...transform, scale: Math.max(0.001, v) });
  };

  const editable = Boolean(transform && onEditTransform);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Edit placement</span>
        {onExit && (
          <button className={styles.close} onClick={onExit}>
            <span>Esc</span>
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>

      <div
        className={styles.seg}
        data-disabled={!transform}
        style={{ "--seg-index": activeIndex } as CSSProperties}
      >
        <span className={styles.segIndicator} aria-hidden />
        {MODES.map((m) => (
          <button
            key={m.id}
            className={styles.segBtn}
            data-active={mode === m.id}
            onClick={() => onModeChange(m.id)}
            disabled={!transform}
            title={`${m.label} (${m.key})`}
          >
            {m.icon}
            <span>{m.label}</span>
            <span className={styles.segKey}>{m.key}</span>
          </button>
        ))}
      </div>

      {transform ? (
        <>
          <div className={styles.fields}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Position</span>
              <div className={styles.rowFields}>
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <div key={axis} className={styles.field}>
                    <span className={styles.axis}>{axis}</span>
                    <NumberField
                      value={transform.position[i]}
                      step={0.1}
                      decimals={2}
                      disabled={!editable}
                      onCommit={(v) => setPosition(i as 0 | 1 | 2, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.pair}>
              <div className={styles.pairCol}>
                <span className={styles.rowLabel}>Heading</span>
                <div className={styles.field}>
                  <NumberField
                    value={quaternionToHeadingDeg(transform.quaternion)}
                    step={1}
                    decimals={0}
                    disabled={!editable}
                    onCommit={setHeading}
                  />
                  <span className={styles.unit}>°</span>
                </div>
              </div>

              <div className={styles.pairCol}>
                <span className={styles.rowLabel}>Scale</span>
                <div className={styles.field}>
                  <span className={styles.unit}>×</span>
                  <NumberField
                    value={typeof transform.scale === "number" ? transform.scale : transform.scale[0]}
                    step={0.01}
                    decimals={2}
                    min={0.001}
                    disabled={!editable}
                    onCommit={setScale}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save placement"}
            </button>
            {onDeselect && (
              <button className={styles.btnGhost} onClick={onDeselect}>
                Deselect
              </button>
            )}
          </div>

          <StatusLine savedAt={savedAt} saveError={saveError} selectedLabel={selectedLabel} />
        </>
      ) : (
        <div className={styles.empty}>
          <span>{hint ?? "Select a memory to edit its placement."}</span>
          {shortcuts && shortcuts.length > 0 && (
            <div className={styles.legend}>
              {shortcuts.map((s) => (
                <div key={s.label} className={styles.legendRow}>
                  <span className={styles.kbdGroup}>
                    {s.keys.map((k) => (
                      <kbd key={k} className={styles.kbd}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Status row: a transient "Saved" confirmation, an error, or the memory id. */
function StatusLine({
  savedAt,
  saveError,
  selectedLabel,
}: {
  savedAt?: number | null;
  saveError?: string | null;
  selectedLabel?: string | null;
}) {
  // Show "Saved" until 2.2s after the latest save. Derive visibility (no sync
  // setState in the effect) and only mark a save dismissed from the timer.
  const [dismissed, setDismissed] = useState<number | null>(null);
  useEffect(() => {
    if (!savedAt || savedAt === dismissed) return;
    const t = setTimeout(() => setDismissed(savedAt), 2200);
    return () => clearTimeout(t);
  }, [savedAt, dismissed]);
  const showSaved = Boolean(savedAt && savedAt !== dismissed);

  return (
    <div className={styles.status}>
      {saveError ? (
        <span className={styles.error}>{saveError}</span>
      ) : showSaved ? (
        <span className={styles.saved}>
          <CheckIcon /> Saved
        </span>
      ) : selectedLabel ? (
        <span className={styles.metaLabel}>{selectedLabel}</span>
      ) : null}
    </div>
  );
}

/**
 * A right-aligned numeric input. Holds local text while focused (so typing
 * intermediate values like "1." stays smooth) and reflects external changes
 * (gizmo drags) when blurred. Commits a finite parsed value on every change.
 */
function NumberField({
  value,
  onCommit,
  step,
  decimals,
  min,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  step: number;
  decimals: number;
  min?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value.toFixed(decimals));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value.toFixed(decimals));
  }, [value, decimals]);

  return (
    <input
      className={styles.input}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={text}
      disabled={disabled}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value.toFixed(decimals));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onCommit(n);
      }}
    />
  );
}

/* ── Minimal inline icons (no dependency) ─────────────────────────────────── */
function iconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}
function MoveIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  );
}
function RotateIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M14 4h6v6M10 20H4v-6" />
      <path d="M20 4l-8 8M4 20l5-5" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg {...iconProps()} width={13} height={13}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
