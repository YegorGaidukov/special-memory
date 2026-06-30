"use client";

import { Edit05, Map01, BookOpen01 } from "@untitledui/icons";
import styles from "./Toolbar.module.css";

// The explorer's right-edge action rail: a single vertical pill replacing the old
// scattered top-right text buttons. Three icon toggles — Edit (curator placement
// mode), Map (ground plane), Library (memory list). Icons-only by design: there
// are no keyboard shortcuts, so each button carries a title/aria-label.
// Icons come from @untitledui/icons (see CLAUDE.md); they fill the button via
// width/height 100% and inherit color through stroke="currentColor".

export default function Toolbar({
  mapVisible,
  libraryOpen,
  onEdit,
  onToggleMap,
  onToggleLibrary,
}: {
  mapVisible: boolean;
  libraryOpen: boolean;
  onEdit: () => void;
  onToggleMap: () => void;
  onToggleLibrary: () => void;
}) {
  return (
    <div className={styles.rail}>
      <button
        type="button"
        className={styles.btn}
        title="Edit placements"
        aria-label="Edit placements"
        onClick={onEdit}
      >
        <Edit05 width="100%" height="100%" />
      </button>
      <button
        type="button"
        className={styles.btn}
        title="Map"
        aria-label="Map"
        aria-pressed={mapVisible}
        data-active={mapVisible || undefined}
        onClick={onToggleMap}
      >
        <Map01 width="100%" height="100%" />
      </button>
      <button
        type="button"
        className={styles.btn}
        title="Library"
        aria-label="Library"
        aria-pressed={libraryOpen}
        data-active={libraryOpen || undefined}
        onClick={onToggleLibrary}
      >
        <BookOpen01 width="100%" height="100%" />
      </button>
    </div>
  );
}
