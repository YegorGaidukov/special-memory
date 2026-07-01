import { describe, expect, it } from "vitest";
import { describeMicError } from "@/lib/audio/micError";

describe("describeMicError", () => {
  it("gives NotAllowedError an iOS settings hint (iOS never re-prompts once denied)", () => {
    const msg = describeMicError("NotAllowedError", "Permission denied");
    expect(msg).toContain("NotAllowedError");
    expect(msg).toContain("Website Settings");
  });

  it("names a missing microphone", () => {
    expect(describeMicError("NotFoundError", "")).toContain("NotFoundError");
  });

  it("falls back to name + message", () => {
    expect(describeMicError("AbortError", "hardware busy")).toBe("AbortError: hardware busy");
    expect(describeMicError("AbortError", "")).toBe("AbortError");
  });
});
