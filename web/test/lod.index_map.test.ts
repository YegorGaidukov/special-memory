import { describe, it, expect } from "vitest";
import {
  sceneIndexOf,
  withSceneAdded,
  withSceneRemoved,
} from "@/lib/lod/index_map";

describe("scene index bookkeeping", () => {
  it("adds scenes in order and reports their index", () => {
    let order: string[] = [];
    order = withSceneAdded(order, "A");
    order = withSceneAdded(order, "B");
    order = withSceneAdded(order, "C");
    expect(order).toEqual(["A", "B", "C"]);
    expect(sceneIndexOf(order, "C")).toBe(2);
  });

  it("removing a middle scene returns its index and re-indexes the rest", () => {
    const order = ["A", "B", "C"];
    const { order: next, index } = withSceneRemoved(order, "B");
    expect(index).toBe(1);
    expect(next).toEqual(["A", "C"]);
    expect(sceneIndexOf(next, "C")).toBe(1); // C shifted down from 2 to 1
  });

  it("returns -1 when removing an unknown id", () => {
    expect(withSceneRemoved(["A"], "Z").index).toBe(-1);
  });

  // The off-by-one risk: after a mid-list removal, the next removal must target
  // the re-indexed position, kept in sync with the viewer's own scene list.
  it("stays in sync with a fake viewer across add/remove sequences", () => {
    const viewer: string[] = [];
    let order: string[] = [];

    const add = (id: string) => {
      order = withSceneAdded(order, id);
      viewer.push(id); // viewer appends at the same index
    };
    const remove = (id: string) => {
      const r = withSceneRemoved(order, id);
      order = r.order;
      viewer.splice(r.index, 1); // viewer removes at the index we computed
    };

    add("A");
    add("B");
    add("C");
    remove("B");
    expect(viewer).toEqual(["A", "C"]);
    expect(viewer[sceneIndexOf(order, "C")]).toBe("C");

    remove("C"); // must hit index 1, not 2
    expect(viewer).toEqual(["A"]);
    expect(order).toEqual(["A"]);
  });
});
