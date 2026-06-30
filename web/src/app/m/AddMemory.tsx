"use client";

import { useCallback, useRef, useState } from "react";
import { pickImage } from "@/lib/upload/pickImage";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import styles from "./mobile.module.css";

// Phase 2: photo pick + upload. Phase 3 adds the (auto/manual) date and the audio
// recording, and switches placement to scatter-near-cluster. Kept intentionally bare.
type Status = "idle" | "selected" | "uploading" | "done" | "error";

export default function AddMemory({ onExplore }: { onExplore: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const choose = useCallback((files: FileList | null) => {
    if (!files) return;
    const picked = pickImage(files);
    if ("error" in picked) {
      setStatus("error");
      setError(picked.error);
      return;
    }
    setFile(picked.file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked.file);
    });
    setError(null);
    setStatus("selected");
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const r = await fetch(`${getApiBaseUrl()}/api/memories`, { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [file]);

  if (status === "done") {
    return (
      <main className={styles.screen}>
        <div className={styles.center}>
          <div className={styles.tick} aria-hidden>✓</div>
          <h1 className={styles.title}>Memory added</h1>
          <p className={styles.sub}>It’s finding its place in the city.</p>
          <button className={styles.primary} onClick={onExplore}>
            Explore the city
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <h1 className={styles.title}>Add a memory</h1>
        <p className={styles.sub}>Choose a photo to place in the shared city.</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => choose(e.target.files)}
        />

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className={styles.preview} />
        ) : null}

        {status === "selected" || status === "uploading" ? (
          <>
            <button
              className={styles.primary}
              onClick={upload}
              disabled={status === "uploading"}
            >
              {status === "uploading" ? "Adding…" : "Add to the city"}
            </button>
            <button className={styles.ghost} onClick={() => inputRef.current?.click()}>
              Choose another
            </button>
          </>
        ) : (
          <button className={styles.pick} onClick={() => inputRef.current?.click()}>
            <span className={styles.plus} aria-hidden>+</span>
            Choose a photo
          </button>
        )}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </main>
  );
}
