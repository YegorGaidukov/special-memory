"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ContribRecord } from "@/server/types";

// Curator review queue: list every record with its lifecycle status, run ingest
// (scan public/memories for the splat) and approve (publish to the explorer).
// Open (no auth).
export default function AdminPage() {
  const [records, setRecords] = useState<ContribRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/memories");
    if (!r.ok) {
      setError(await r.text());
      return;
    }
    setError(null);
    setRecords((await r.json()).records);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function act(id: string, action: "ingest" | "approve") {
    const r = await fetch(`/api/memories/${id}/${action}`, { method: "POST" });
    if (!r.ok) setError(`${action} failed: ${await r.text()}`);
    await refresh();
  }

  return (
    <main style={{ maxWidth: 760, margin: "6vh auto", font: "15px system-ui", color: "#e6e9f0" }}>
      <h1>Review queue — Wolfsburg</h1>
      {error && <p style={{ color: "#ff8080" }}>{error}</p>}
      {!records ? (
        <p>Loading…</p>
      ) : records.length === 0 ? (
        <p>No memories yet. Add one by dropping a photo on the <Link href="/">explorer</Link>.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2f3a" }}>
              <th>id</th><th>status</th><th>geo</th><th>actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #1a1f29" }}>
                <td style={{ fontFamily: "monospace" }}>{r.id}</td>
                <td>{r.status}</td>
                <td>{r.geo ? `${r.geo.lat.toFixed(3)}, ${r.geo.lon.toFixed(3)}` : "—"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => act(r.id, "ingest")} disabled={r.status === "approved"}>
                    Ingest splat
                  </button>
                  <button onClick={() => act(r.id, "approve")} disabled={r.status !== "ready" && r.status !== "approved"}>
                    Approve
                  </button>
                  <a href={`/contribute/${r.id}`}>Re-place</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
