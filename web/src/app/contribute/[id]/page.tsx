"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PlacementMap, { type Placement } from "./PlacementMap";
import type { ContribRecord } from "@/server/types";

// WebGL/Spark editor — never server-render it (mirrors ExplorerCanvas).
const MemoryEditor3D = dynamic(() => import("@/components/MemoryEditor3D"), {
  ssr: false,
  loading: () => <p style={{ color: "#9aa3b8" }}>Loading 3D editor…</p>,
});

export default function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [record, setRecord] = useState<ContribRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/memories/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((d) => setRecord(d.record))
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  async function save(p: Placement) {
    const r = await fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!r.ok) {
      setError(await r.text());
      return;
    }
    setDone(true);
  }

  if (error) return <main style={wrap}><p style={{ color: "#ff8080" }}>{error}</p></main>;
  if (!record) return <main style={wrap}><p>Loading…</p></main>;

  return (
    <main style={wrap}>
      <h1>Place this memory</h1>
      <p style={{ color: "#9aa3b8" }}>
        {record.source_image}
        {record.geo ? " — pin auto-placed from photo GPS; drag to adjust." : " — no GPS in photo; drop the pin manually."}
      </p>
      <PlacementMap
        initial={{
          lat: record.geo?.lat,
          lon: record.geo?.lon,
          heading_deg: record.heading_deg ?? 0,
          scale: 1,
        }}
        onSave={save}
      />
      {record.status === "ready" || record.status === "approved" ? (
        <section style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Fine-tune in 3D</h2>
          <p style={{ color: "#9aa3b8", margin: 0 }}>
            Drag the gizmo to place, rotate, and scale the splat directly. Saving here writes
            the transform straight to the record (re-saving the map above recomputes it from the
            pin).
          </p>
          <MemoryEditor3D record={record} />
        </section>
      ) : (
        <p style={{ color: "#6b7488" }}>
          3D placement unlocks once the splat is ingested (status “ready”).
        </p>
      )}
      {done && (
        <p style={{ color: "#80ff9f" }}>
          Saved. Next: run SHARP on the inbox image, drop <code>{record.id}.sog</code> into
          public/memories, then ingest + approve in{" "}
          <button onClick={() => router.push("/admin")} style={{ textDecoration: "underline" }}>
            the review queue
          </button>.
        </p>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 640,
  margin: "6vh auto",
  font: "16px system-ui",
  color: "#e6e9f0",
};
