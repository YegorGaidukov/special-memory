"use client";

import type { MemoryRecord } from "@/lib/manifest/types";

const panel: React.CSSProperties = {
  position: "fixed",
  pointerEvents: "none",
  font: "12px system-ui, -apple-system, sans-serif",
};

// DOM overlay over the canvas: title, status/controls hint, and the label of
// the memory you most recently travelled to.
export default function TravelOverlay({
  status,
  count,
  error,
  current,
}: {
  status: "loading" | "ready" | "error";
  count: number;
  error?: string;
  current: MemoryRecord | null;
}) {
  return (
    <>
      <div
        style={{
          ...panel,
          top: 14,
          left: 16,
          color: "#aab4cc",
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        Collective Memory City
      </div>

      <div style={{ ...panel, left: 16, bottom: 14, color: "#7a8499", maxWidth: "80vw" }}>
        {status === "loading" && "Loading memories…"}
        {status === "error" && `Failed to load memories: ${error ?? ""}`}
        {status === "ready" &&
          `${count} memories · click to look · WASD to fly · aim + click a memory to travel · Esc to release`}
      </div>

      {current && (
        <div style={{ ...panel, right: 16, bottom: 14, textAlign: "right", color: "#cdd6ea" }}>
          <div style={{ fontWeight: 600 }}>{current.id}</div>
          {current.captured_at && (
            <div style={{ color: "#7a8499" }}>
              {new Date(current.captured_at).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </>
  );
}
