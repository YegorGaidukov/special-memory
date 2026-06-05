"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickImage } from "@/lib/upload/pickImage";
import { getCameraPose } from "@/lib/camera/pose";
import styles from "./DropToContribute.module.css";

// DOM overlay over the explorer canvas: the only entry point for adding a memory.
// Drop a photo anywhere on the window → upload via POST /api/memories → stay on
// the explorer. The new memory's placeholder sphere appears (SplatWorld polls the
// store) and becomes a splat when reconstruction publishes it. We send the live
// camera pose so a GPS-less photo lands in front of the current view.
//
// Pointer-lock note: during free-fly the cursor is OS-captured and browsers don't
// fire file-drop events, so this is naturally inert while flying — no extra code.

type Status = "idle" | "uploading" | "done" | "error";

// A drag carries files only when its types list includes "Files" (vs. dragging
// selected text or a link). Keeps the overlay from flashing on non-file drags.
function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes("Files");
}

export default function DropToContribute() {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // dragenter/dragleave fire per child element; count them so the overlay only
  // clears when the cursor actually leaves the window.
  const depth = useRef(0);
  // Hidden file input backing the "share a memory" button (the explicit upload
  // path alongside drag-and-drop).
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: FileList) => {
    const picked = pickImage(files);
    if ("error" in picked) {
      setStatus("error");
      setError(picked.error);
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      const pose = getCameraPose();
      const form = new FormData();
      form.append("photo", picked.file);
      form.append("camera_position", JSON.stringify(pose.position));
      form.append("camera_forward", JSON.stringify(pose.forward));
      const r = await fetch("/api/memories", { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setStatus("done");
      // Clear the confirmation after a few seconds.
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setStatus("error");
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault(); // allow the drop (and stop the browser navigating to the file)
    };
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void upload(e.dataTransfer!.files);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload]);

  return (
    <>
      {/* The only persistent upload affordance: a centered button at the bottom.
          Opens the OS file picker; drag-and-drop still works in parallel. */}
      <div className={styles.dock}>
        {status !== "idle" && (
          <div
            className={styles.status}
            style={status === "error" ? { color: "#ff8080" } : undefined}
          >
            {status === "uploading" && "Uploading…"}
            {status === "done" && "Memory added — reconstructing…"}
            {status === "error" && error}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length) void upload(files);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        <button
          type="button"
          className={styles.shareBtn}
          onClick={() => fileRef.current?.click()}
          disabled={status === "uploading"}
        >
          share a memory
        </button>
      </div>

      {/* Drag overlay — dims the void and confirms the drop target. */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9,
            pointerEvents: "none",
            display: "grid",
            placeItems: "center",
            background: "rgba(8, 10, 18, 0.55)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 15,
              color: "var(--ink)",
              padding: "18px 28px",
              borderRadius: 10,
              border: "1px dashed var(--ink-mute)",
              background: "rgba(8, 10, 18, 0.6)",
            }}
          >
            Drop a photo to add a memory
          </div>
        </div>
      )}
    </>
  );
}
