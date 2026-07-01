"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "@untitledui/icons";
import { pickImage } from "@/lib/upload/pickImage";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import styles from "./mobile.module.css";

// 5b Add screen: a feathered photo circle + inline serif fields (Name / Date / Narrate),
// all floating on the shadow field — no boxes. Tap the circle to choose a photo; name
// it, optionally date it (manual fallback for missing EXIF) and record a voice note;
// then ADD TO THE CITY uploads (placement=scatter, near the cluster). On success the
// transient "Memory added" state auto-advances to Explore.
type Status = "idle" | "uploading" | "done" | "error";

export default function AddMemory({ onAdded }: { onAdded: () => void }) {
  const photoInput = useRef<HTMLInputElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const audio = useAudioRecorder();
  // `audio.supported` reads client-only globals (navigator/MediaRecorder), so it's
  // false during SSR and true after hydration — gating the Narrate button on it
  // directly would mismatch the server HTML. Defer it until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    setStatus("idle");
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("placement", "scatter");
      if (name.trim()) form.append("name", name.trim());
      if (date) form.append("captured_at", date);
      if (audio.blob) form.append("audio", audio.blob, "note");
      const r = await fetch(`${getApiBaseUrl()}/api/memories`, { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [file, name, date, audio.blob]);

  // "Memory added" is a transient state — it settles, then drifts to Explore. Tapping
  // it advances immediately.
  useEffect(() => {
    if (status !== "done") return;
    const t = setTimeout(onAdded, 2600);
    return () => clearTimeout(t);
  }, [status, onAdded]);

  if (status === "done") {
    return (
      <main className={styles.screen} onClick={onAdded}>
        <h1 className={styles.addedTitle}>Memory added</h1>
        <p className={styles.addedSub}>
          It’s finding its place
          <br />
          in the city
        </p>
      </main>
    );
  }

  const openDate = () => {
    const el = dateInput.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };
  const dateLabel = date
    ? new Date(date).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "Add a date";

  const narrateLabel = audio.url
    ? "Voice note added"
    : audio.recording
      ? "Recording — tap to stop"
      : "Narrate";
  const onNarrate = () => {
    if (audio.url) audio.reset();
    else if (audio.recording) audio.stop();
    else audio.start();
  };

  return (
    <main className={styles.screen}>
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png"
        className={styles.hiddenInput}
        onChange={(e) => choose(e.target.files)}
      />
      <input
        ref={dateInput}
        type="date"
        className={styles.hiddenInput}
        max={new Date().toISOString().slice(0, 10)}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <div className={styles.addContent}>
        <button
          type="button"
          className={styles.photo}
          onClick={() => photoInput.current?.click()}
          aria-label={file ? "Change photo" : "Choose a photo"}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className={styles.photoImg} />
          ) : (
            <>
              <span className={styles.photoWell} />
              <Plus className={styles.photoPlus} aria-hidden />
            </>
          )}
        </button>

        <input
          className={styles.serifField}
          value={name}
          placeholder="Name this memory"
          onChange={(e) => setName(e.target.value)}
          aria-label="Name this memory"
        />

        <button
          type="button"
          className={`${styles.serifButton} ${date ? styles.serifButtonSet : ""}`}
          onClick={openDate}
        >
          {dateLabel}
        </button>

        {mounted && audio.supported && (
          <button
            type="button"
            className={`${styles.serifButton} ${audio.url ? styles.serifButtonSet : ""}`}
            onClick={onNarrate}
          >
            {narrateLabel}
          </button>
        )}

        <button
          type="button"
          className={styles.addAction}
          onClick={upload}
          disabled={!file || status === "uploading"}
        >
          {status === "uploading" ? "Adding…" : "Add to the city"}
        </button>

        {error && <p className={styles.addError}>{error}</p>}
      </div>

      <button className={styles.addSecondary} onClick={() => photoInput.current?.click()}>
        Choose another photo
      </button>
    </main>
  );
}
