"use client";

import { useEffect, useRef, useState } from "react";
import { Check, XClose } from "@untitledui/icons";
import type { StoredTransform } from "@/lib/transform/apply";
import { headingToQuaternion, quaternionToHeadingDeg } from "@/lib/geo/heading";
import styles from "./EditHud.module.css";

/**
 * Glass inspector (DOM overlay outside the canvas) for the transform editor:
 * editable position/heading/scale fields. The in-canvas gumball gizmo handles
 * move/rotate/scale directly, so there's no mode switch here. Renders nothing
 * until a memory is selected (no empty-state card) — the panel only appears with
 * a live transform to edit. Presentational — the parent owns the selected object,
 * applies edits to the live mesh (`onEditTransform`), and auto-persists.
 */
export default function EditHud({
  transform,
  onEditTransform,
  saving,
  saveError,
  savedAt,
  selectedLabel,
  onExit,
}: {
  transform: StoredTransform | null;
  onEditTransform?: (next: StoredTransform) => void;
  saving: boolean;
  saveError?: string | null;
  savedAt?: number | null;
  selectedLabel?: string | null;
  onExit?: () => void;
}) {
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

  // No empty-state card: until a memory is selected the inspector isn't shown.
  if (!transform) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Edit placement</span>
        {onExit && (
          <button className={styles.close} onClick={onExit}>
            <span>Esc</span>
            <XClose width={14} height={14} aria-hidden />
          </button>
        )}
      </div>

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

      <StatusLine
        saving={saving}
        savedAt={savedAt}
        saveError={saveError}
        selectedLabel={selectedLabel}
      />
    </div>
  );
}

/**
 * Status row: a live "Saving…" / "Saved" auto-save indicator, an error, or the
 * memory id. Edits persist automatically (no Save button).
 */
function StatusLine({
  saving,
  savedAt,
  saveError,
  selectedLabel,
}: {
  saving?: boolean;
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
      ) : saving ? (
        <span className={styles.metaLabel}>Saving…</span>
      ) : showSaved ? (
        <span className={styles.saved}>
          <Check width={13} height={13} strokeWidth={1.7} /> Saved
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

