"use client";

import { useCallback, useRef, useState } from "react";
import { pickImage } from "@/lib/upload/pickImage";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import styles from "./mobile.module.css";

// The phone contribution: pick a photo, optionally set the date (auto-filled from
// EXIF server-side; this is the manual fallback) and record a short voice note. The
// memory scatters near the existing cluster (placement=scatter) — no GPS, no camera.
type Status = "idle" | "selected" | "uploading" | "done" | "error";

export default function AddMemory({ onExplore }: { onExplore: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const audio = useAudioRecorder();

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
      form.append("placement", "scatter");
      if (date) form.append("captured_at", date);
      if (audio.blob) form.append("audio", audio.blob, "note");
      const r = await fetch(`${getApiBaseUrl()}/api/memories`, { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [file, date, audio.blob]);

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
            <label className={styles.field}>
              <span className={styles.fieldLabel}>When was this taken? (optional)</span>
              <input
                type="date"
                className={styles.dateInput}
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            {audio.supported ? (
              <div className={styles.audio}>
                {audio.url ? (
                  <>
                    <audio src={audio.url} controls className={styles.player} />
                    <button className={styles.ghost} onClick={audio.reset}>
                      Re-record voice note
                    </button>
                  </>
                ) : audio.recording ? (
                  <button className={styles.recording} onClick={audio.stop}>
                    ● Stop recording
                  </button>
                ) : (
                  <button className={styles.ghost} onClick={audio.start}>
                    🎙 Record a voice note (optional)
                  </button>
                )}
                {audio.error ? <p className={styles.error}>{audio.error}</p> : null}
              </div>
            ) : null}

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
