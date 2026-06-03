"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Curator-facing: drag/choose a photo to add a memory. On success we jump to the
// placement page for the new record. Deliberately plain — this is a curation
// tool, not a public page. No auth (open, curated installation).
export default function ContributePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(e.currentTarget);
      const r = await fetch("/api/memories", { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      const { record } = await r.json();
      router.push(`/contribute/${record.id}`);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", font: "16px system-ui", color: "#e6e9f0" }}>
      <h1>Add a memory — Wolfsburg</h1>
      <form onSubmit={upload}>
        <p>Choose a city photo (JPEG/PNG; originals keep their GPS + focal length):</p>
        <input type="file" name="photo" accept="image/jpeg,image/png" required />
        <button type="submit" disabled={busy} style={{ marginTop: 12, padding: "8px 16px" }}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p style={{ color: "#ff8080" }}>{error}</p>}
    </main>
  );
}
