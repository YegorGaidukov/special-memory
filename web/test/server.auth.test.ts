import { describe, it, expect } from "vitest";
import { checkPassword, AUTH_COOKIE } from "@/server/auth";

describe("checkPassword", () => {
  it("accepts the matching password", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(checkPassword("nope", "hunter2")).toBe(false);
  });

  it("rejects when no curator password is configured", () => {
    expect(checkPassword("anything", undefined)).toBe(false);
    expect(checkPassword("anything", "")).toBe(false);
  });

  it("rejects a length mismatch without throwing", () => {
    expect(checkPassword("short", "a-much-longer-secret")).toBe(false);
  });

  it("exposes a stable cookie name", () => {
    expect(AUTH_COOKIE).toBe("cmc_curator");
  });
});
