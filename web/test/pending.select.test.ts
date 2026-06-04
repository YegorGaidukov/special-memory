import { describe, it, expect } from "vitest";
import { selectPending, hasUnpublishedApproved } from "@/lib/pending/select";
import type { ContribRecord } from "@/server/types";

function rec(id: string, status: ContribRecord["status"]): ContribRecord {
  return {
    id,
    status,
    source_image: `${id}.jpg`,
    thumbnail_url: "",
    splat_url: status === "processing" ? "" : `${id}.sog`,
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

describe("selectPending", () => {
  it("returns processing/ready records not yet in the manifest", () => {
    const store = [rec("a", "processing"), rec("b", "ready"), rec("c", "approved")];
    const ids = selectPending(store, new Set<string>()).map((r) => r.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("drops a record once it appears in the manifest", () => {
    const store = [rec("a", "ready")];
    expect(selectPending(store, new Set(["a"]))).toEqual([]);
  });

  it("ignores failed/uploaded records", () => {
    const store = [rec("a", "failed"), rec("b", "uploaded")];
    expect(selectPending(store, new Set<string>())).toEqual([]);
  });
});

describe("hasUnpublishedApproved", () => {
  it("is true when an approved record is missing from the manifest", () => {
    expect(hasUnpublishedApproved([rec("a", "approved")], new Set<string>())).toBe(true);
  });

  it("is false once it is published", () => {
    expect(hasUnpublishedApproved([rec("a", "approved")], new Set(["a"]))).toBe(false);
  });
});
