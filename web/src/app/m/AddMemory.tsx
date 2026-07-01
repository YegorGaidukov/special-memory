"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "@untitledui/icons";
import { pickImage } from "@/lib/upload/pickImage";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import { captureIsoDay } from "@/lib/exif/captureDate";
import { advance, mayAdvance, showsAdded, type AddPhase } from "@/lib/upload/addFlow";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import DatePicker from "./DatePicker";
import styles from "./mobile.module.css";

// 5b Add screen: a feathered photo circle + inline serif fields (Name / Date / Narrate),
// all floating on the shadow field — no boxes. Tap the circle to choose a photo; name
// it, optionally date it (manual fallback for missing EXIF) and record a voice note;
// then ADD TO THE CITY shows "Memory added" immediately (optimistic — the photo is
// still uploading behind it) and drifts to Explore only once the POST succeeds.
export default function AddMemory({ onAdded }: { onAdded: () => void }) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<AddPhase>("idle");
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

  // Guards a slow EXIF parse of an older pick from overwriting a newer one.
  const pickSeq = useRef(0);

  const choose = useCallback((files: FileList | null) => {
    if (!files) return;
    const picked = pickImage(files);
    if ("error" in picked) {
      setError(picked.error);
      return;
    }
    setFile(picked.file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked.file);
    });
    setError(null);
    // The date belongs to the photo: reset it, then prefill from EXIF when present.
    // exifr is imported lazily so the page load stays light.
    setDate("");
    const seq = ++pickSeq.current;
    void (async () => {
      try {
        const exifr = (await import("exifr")).default;
        const raw: unknown = await exifr.parse(picked.file, ["DateTimeOriginal"]);
        const day = captureIsoDay(raw);
        if (day && pickSeq.current === seq) setDate(day);
      } catch {
        // No/unreadable EXIF (iOS sometimes strips it converting HEIC) — manual date remains.
      }
    })();
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setPhase((p) => advance(p, "submit")); // optimistic: added screen shows now
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
      setPhase((p) => advance(p, "succeed"));
    } catch (err) {
      // Back to the form (all entered state is retained) with the error line shown.
      setPhase((p) => advance(p, "fail"));
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [file, name, date, audio.blob]);

  // "Memory added" shows immediately; the drift to Explore starts only after the POST
  // succeeds (a slow upload just lingers on the calm added screen). Tapping advances
  // immediately — once settled.
  useEffect(() => {
    if (!mayAdvance(phase)) return;
    const t = setTimeout(onAdded, 2600);
    return () => clearTimeout(t);
  }, [phase, onAdded]);

  if (showsAdded(phase)) {
    return (
      <main className={styles.screen} onClick={() => mayAdvance(phase) && onAdded()}>
        <h1 className={styles.addedTitle}>Memory added</h1>
        <p className={styles.addedSub}>
          It’s finding its place
          <br />
          in the city
        </p>
      </main>
    );
  }

  const narrateLabel = audio.url
    ? "Voice note added"
    : audio.recording
      ? "Recording — tap to stop"
      : audio.requesting
        ? "Allow microphone…"
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
          placeholder="Name the Memory"
          onChange={(e) => setName(e.target.value)}
          aria-label="Name the Memory"
        />

        <DatePicker value={date} onChange={setDate} />

        {mounted && audio.supported && (
          <>
            <button
              type="button"
              className={`${styles.serifButton} ${audio.url ? styles.serifButtonSet : ""}`}
              onClick={onNarrate}
              disabled={audio.requesting}
            >
              {narrateLabel}
            </button>
            {audio.error && <p className={styles.addError}>{audio.error}</p>}
          </>
        )}

        <button
          type="button"
          className={styles.addAction}
          onClick={upload}
          disabled={!file}
        >
          Add to the city
        </button>

        {error && <p className={styles.addError}>{error}</p>}
      </div>

    </main>
  );
}
