"use client";

import { useEffect } from "react";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./Library.module.css";

// The Library panel: a plain list of every loaded memory (id + capture date).
// Clicking a row flies the camera to that memory (the parent wires onTravel into
// the same fly-to Travel uses for double-clicks) and closes the panel. A DOM
// overlay over the canvas, opened from the toolbar's book icon.
export default function Library({
  records,
  onTravel,
  onClose,
}: {
  records: MemoryRecord[];
  onTravel: (id: string) => void;
  onClose: () => void;
}) {
  // Esc closes, matching the inspector's close affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Library</span>
        <button type="button" className={styles.close} onClick={onClose}>
          Esc
        </button>
      </div>

      {records.length === 0 ? (
        <div className={styles.empty}>No memories yet.</div>
      ) : (
        <ul className={styles.list}>
          {records.map((r) => (
            <li key={r.id}>
              <button type="button" className={styles.row} onClick={() => onTravel(r.id)}>
                <span className={styles.rowId}>{r.name?.trim() || r.id}</span>
                {r.captured_at && (
                  <span className={styles.rowDate}>
                    {new Date(r.captured_at).toLocaleDateString()}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
