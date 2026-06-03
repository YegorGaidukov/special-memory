"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PlacementMap, { type Placement } from "./PlacementMap";
import type { ContribRecord } from "@/server/types";
import styles from "./page.module.css";

// WebGL/Spark editor — never server-render it (mirrors ExplorerCanvas).
const MemoryEditor3D = dynamic(() => import("@/components/MemoryEditor3D"), {
  ssr: false,
  loading: () => <p className={styles.muted}>Loading 3D editor…</p>,
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

  if (error)
    return (
      <main className={styles.wrap}>
        <p className={styles.error}>{error}</p>
      </main>
    );
  if (!record)
    return (
      <main className={styles.wrap}>
        <p className={styles.muted}>Loading…</p>
      </main>
    );

  return (
    <main className={styles.wrap}>
      <h1 className={styles.title}>Place this memory</h1>
      <p className={styles.lead}>
        {record.source_image}
        {record.geo
          ? " — pin auto-placed from photo GPS; drag to adjust."
          : " — no GPS in photo; drop the pin manually."}
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
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Fine-tune in 3D</h2>
          <p className={styles.sectionLead}>
            Drag the gizmo (or type exact values) to place, rotate, and scale the splat directly.
            Saving here writes the transform straight to the record; re-saving the map above
            recomputes it from the pin.
          </p>
          <MemoryEditor3D record={record} />
        </section>
      ) : (
        <p className={styles.locked}>
          3D placement unlocks once the splat is ingested (status “ready”).
        </p>
      )}
      {done && (
        <div className={styles.note}>
          <span className={styles.noteTitle}>✓ Saved</span>
          <span>
            Next: run SHARP on the inbox image, drop <code className={styles.code}>{record.id}.sog</code>{" "}
            into public/memories, then ingest + approve in{" "}
            <button className={styles.link} onClick={() => router.push("/admin")}>
              the review queue
            </button>
            .
          </span>
        </div>
      )}
    </main>
  );
}
