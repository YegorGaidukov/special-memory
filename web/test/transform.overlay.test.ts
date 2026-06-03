import { describe, it, expect } from "vitest";
import { applyEdits, recordsSignature } from "@/lib/transform/overlay";
import type { StoredTransform } from "@/lib/transform/apply";
import type { MemoryRecord } from "@/lib/manifest/types";

function record(id: string, over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    status: "approved",
    thumbnail_url: `${id}.jpg`,
    splat_url: `${id}.sog`,
    transform: {
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    ...over,
  };
}

const EDIT: StoredTransform = {
  position: [10, 20, 30],
  quaternion: [0, 0.7071, 0, 0.7071],
  scale: 2,
};

describe("applyEdits", () => {
  it("overlays the stored transform onto the matching record", () => {
    const memories = [record("mem-01"), record("mem-02")];
    const out = applyEdits(memories, { "mem-01": EDIT });
    expect(out[0].transform).toEqual({
      position: [10, 20, 30],
      quaternion: [0, 0.7071, 0, 0.7071],
      scale: 2,
    });
  });

  it("keeps the scalar scale as a scalar", () => {
    const out = applyEdits([record("mem-01")], { "mem-01": EDIT });
    expect(out[0].transform.scale).toBe(2);
  });

  it("returns the SAME record reference for unedited records", () => {
    const memories = [record("mem-01"), record("mem-02")];
    const out = applyEdits(memories, { "mem-01": EDIT });
    expect(out[1]).toBe(memories[1]);
  });

  it("returns the SAME array reference when edits is empty", () => {
    const memories = [record("mem-01")];
    expect(applyEdits(memories, {})).toBe(memories);
  });

  it("returns the SAME array reference when no edit matches a record", () => {
    const memories = [record("mem-01")];
    expect(applyEdits(memories, { "mem-99": EDIT })).toBe(memories);
  });

  it("does not mutate the input records or array", () => {
    const memories = [record("mem-01")];
    const before = JSON.parse(JSON.stringify(memories));
    applyEdits(memories, { "mem-01": EDIT });
    expect(memories).toEqual(before);
  });
});

describe("recordsSignature", () => {
  it("is identical for arrays that differ only in transform", () => {
    const a = [record("mem-01"), record("mem-02")];
    const b = [
      record("mem-01", { transform: { position: [9, 9, 9], quaternion: [0, 0, 0, 1], scale: 5 } }),
      record("mem-02"),
    ];
    expect(recordsSignature(a)).toBe(recordsSignature(b));
  });

  it("differs when a memory is added or removed", () => {
    const a = [record("mem-01")];
    const b = [record("mem-01"), record("mem-02")];
    expect(recordsSignature(a)).not.toBe(recordsSignature(b));
  });

  it("differs when a splat_url changes", () => {
    const a = [record("mem-01")];
    const b = [record("mem-01", { splat_url: "other.sog" })];
    expect(recordsSignature(a)).not.toBe(recordsSignature(b));
  });

  it("is order-independent", () => {
    const a = [record("mem-01"), record("mem-02")];
    const b = [record("mem-02"), record("mem-01")];
    expect(recordsSignature(a)).toBe(recordsSignature(b));
  });
});
