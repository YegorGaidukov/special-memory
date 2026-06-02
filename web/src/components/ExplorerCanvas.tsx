"use client";

import dynamic from "next/dynamic";

// The splat world is WebGL-only (SharedArrayBuffer workers, no DOM on the
// server), so it must never be server-rendered. `ssr: false` is only allowed
// inside a Client Component — hence this thin wrapper.
const SplatWorld = dynamic(() => import("./SplatWorld"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#05060a",
        color: "#7a8499",
        font: "14px system-ui, sans-serif",
      }}
    >
      Entering the city…
    </div>
  ),
});

export default function ExplorerCanvas() {
  return <SplatWorld />;
}
