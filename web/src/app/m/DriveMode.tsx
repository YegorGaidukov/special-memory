"use client";

import styles from "./mobile.module.css";

// Phase 2 placeholder. Phase 5 replaces this with the joystick: a move-joystick +
// drag-to-look surface that drives the projected view over a WebSocket (single
// driver), plus a "jump to a memory" button.
export default function DriveMode({ onBack }: { onBack: () => void }) {
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <h1 className={styles.title}>Drive the view</h1>
        <p className={styles.sub}>
          The joystick lands here soon — you’ll steer the projected city from your phone.
        </p>
        <button className={styles.ghost} onClick={onBack}>
          ← Add another memory
        </button>
      </div>
    </main>
  );
}
