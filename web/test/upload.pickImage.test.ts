import { describe, it, expect } from "vitest";
import { pickImage } from "@/lib/upload/pickImage";

// Minimal File-like stub — pickImage only reads `.type` and `.name`. The node
// test env has no DOM File, so we stub the shape we depend on.
const f = (type: string, name = "x") => ({ type, name }) as unknown as File;

describe("pickImage", () => {
  it("returns the first file when it is a JPEG", () => {
    const file = f("image/jpeg", "photo.jpg");
    expect(pickImage([file])).toEqual({ file });
  });

  it("returns the first file when it is a PNG", () => {
    const file = f("image/png", "photo.png");
    expect(pickImage([file])).toEqual({ file });
  });

  it("uses the first file and ignores the rest of a multi-file drop", () => {
    const first = f("image/jpeg", "first.jpg");
    expect(pickImage([first, f("image/png", "second.png")])).toEqual({ file: first });
  });

  it("rejects a first file that is not a JPEG or PNG", () => {
    const result = pickImage([f("text/plain", "notes.txt")]);
    expect(result).toHaveProperty("error");
    expect("file" in result).toBe(false);
  });

  it("rejects an empty drop", () => {
    const result = pickImage([]);
    expect(result).toHaveProperty("error");
  });
});
