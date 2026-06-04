import type { ContribRecord } from "@/server/types";

/**
 * Records to show as placeholder spheres: reconstruction is in flight
 * (`processing`) or finished (`ready`) but not yet published into the explorer
 * manifest. Once a record is published its id is in `manifestIds`, so it drops
 * out and the real splat takes over.
 */
export function selectPending(
  storeRecords: ContribRecord[],
  manifestIds: ReadonlySet<string>,
): ContribRecord[] {
  return storeRecords.filter(
    (r) => (r.status === "processing" || r.status === "ready") && !manifestIds.has(r.id),
  );
}

/**
 * True when the store has an `approved` record that the loaded manifest doesn't
 * know about yet — the explorer should refetch the manifest so its splat loads.
 */
export function hasUnpublishedApproved(
  storeRecords: ContribRecord[],
  manifestIds: ReadonlySet<string>,
): boolean {
  return storeRecords.some((r) => r.status === "approved" && !manifestIds.has(r.id));
}
