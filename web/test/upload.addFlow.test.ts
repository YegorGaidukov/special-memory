import { describe, expect, it } from "vitest";
import { advance, mayAdvance, showsAdded, type AddPhase } from "@/lib/upload/addFlow";

describe("advance", () => {
  it("submit starts sending from idle and from error (retry)", () => {
    expect(advance("idle", "submit")).toBe("sending");
    expect(advance("error", "submit")).toBe("sending");
  });

  it("sending settles on success and drops to error on failure", () => {
    expect(advance("sending", "succeed")).toBe("settled");
    expect(advance("sending", "fail")).toBe("error");
  });

  it("ignores events that don't apply to the phase", () => {
    expect(advance("idle", "succeed")).toBe("idle");
    expect(advance("idle", "fail")).toBe("idle");
    expect(advance("settled", "submit")).toBe("settled");
    expect(advance("sending", "submit")).toBe("sending");
  });
});

describe("screen predicates", () => {
  it("the added screen shows while sending and once settled", () => {
    const shown: AddPhase[] = ["sending", "settled"];
    for (const p of ["idle", "sending", "settled", "error"] as const) {
      expect(showsAdded(p)).toBe(shown.includes(p));
    }
  });

  it("advancing to Explore is armed only after the POST succeeded", () => {
    for (const p of ["idle", "sending", "settled", "error"] as const) {
      expect(mayAdvance(p)).toBe(p === "settled");
    }
  });
});
