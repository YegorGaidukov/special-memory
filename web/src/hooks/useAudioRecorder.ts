"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeMicError } from "@/lib/audio/micError";

// Thin wrapper over the MediaRecorder API (the manual/un-unit-tested seam) for the
// phone's optional voice note. getUserMedia requires a secure context (HTTPS), which
// the exhibition's Caddy domain provides. Picks the best supported container/codec
// (Chrome: webm/opus; Safari/iOS: mp4/aac) — the server maps the blob's type to an
// on-disk extension, so we don't hardcode one.

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export interface AudioRecorder {
  supported: boolean;
  requesting: boolean; // getUserMedia permission request in flight
  recording: boolean;
  blob: Blob | null;
  url: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useAudioRecorder(): AudioRecorder {
  const [requesting, setRequesting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const b = new Blob(chunksRef.current, { type });
        setBlob(b);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(b);
        });
        cleanupStream();
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof DOMException
          ? describeMicError(err.name, err.message)
          : String(err instanceof Error ? err.message : err),
      );
      cleanupStream();
    } finally {
      setRequesting(false);
    }
  }, [cleanupStream]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }, []);

  // Stop the mic + free the object URL if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      cleanupStream();
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [cleanupStream]);

  return { supported, requesting, recording, blob, url, error, start, stop, reset };
}
