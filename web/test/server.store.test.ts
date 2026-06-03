import { describe, it, expect } from "vitest";
import { addRecord, updateRecord, findById, emptyStore } from "@/server/store";
import type { ContribRecord } from "@/server/types";

function rec(id: string): ContribRecord {
  return {
    id,
    status: "uploaded",
    source_image: `${id}.jpg`,
    thumbnail_url: "",
    splat_url: "",
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    created_at: "2026-06-03T00:00:00.000Z",
  };
}

describe("store ops", () => {
  it("emptyStore has no records", () => {
    expect(emptyStore().records).toEqual([]);
  });

  it("addRecord appends immutably", () => {
    const s0 = emptyStore();
    const s1 = addRecord(s0, rec("a"));
    expect(s1.records).toHaveLength(1);
    expect(s0.records).toHaveLength(0); // original untouched
  });

  it("findById returns the record or undefined", () => {
    const s = addRecord(emptyStore(), rec("a"));
    expect(findById(s, "a")?.id).toBe("a");
    expect(findById(s, "missing")).toBeUndefined();
  });

  it("updateRecord patches a single record by id", () => {
    const s = addRecord(emptyStore(), rec("a"));
    const s2 = updateRecord(s, "a", { status: "ready", splat_url: "a.sog" });
    expect(findById(s2, "a")?.status).toBe("ready");
    expect(findById(s2, "a")?.splat_url).toBe("a.sog");
  });

  it("updateRecord is a no-op for an unknown id", () => {
    const s = addRecord(emptyStore(), rec("a"));
    expect(updateRecord(s, "missing", { status: "failed" })).toEqual(s);
  });

  it("updateRecord does not mutate the input store", () => {
    const s = addRecord(emptyStore(), rec("a"));
    updateRecord(s, "a", { status: "approved" });
    expect(findById(s, "a")?.status).toBe("uploaded");
  });

  it("updateRecord can mark a record failed with an error message", () => {
    const s = addRecord(emptyStore(), rec("a"));
    const s2 = updateRecord(s, "a", { status: "failed", error: "sharp exploded" });
    expect(findById(s2, "a")?.status).toBe("failed");
    expect(findById(s2, "a")?.error).toBe("sharp exploded");
  });
});
