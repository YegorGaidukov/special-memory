import styles from "./mobile.module.css";

// A faint fractal-noise overlay (mix-blend: overlay) laid over the shadow field, so
// the smooth gradients read as textured light rather than flat vector. Generated —
// no raster asset. Sits above the field, below the content.
export default function Grain() {
  return <div className={styles.grain} aria-hidden />;
}
