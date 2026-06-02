import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests cover only the pure, WebGL-free logic under src/lib (manifest
// parsing, LOD decisions, camera/tween math, transform passthrough). The WebGL
// Viewer is the mocked seam and is exercised by the manual smoke test, not here
// — so a plain `node` environment is enough (no jsdom needed).
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
