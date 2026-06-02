import type { NextConfig } from "next";

// The Gaussian-splat renderer (@mkkellogg/gaussian-splats-3d) sorts splats in a
// Web Worker using SharedArrayBuffer by default. Browsers only expose
// SharedArrayBuffer in a cross-origin-isolated context, which requires these two
// headers. Without them the Viewer throws a SharedArrayBuffer error.
// (Fallback if hosting can't send these: construct the Viewer with
// `sharedMemoryForWorkers: false` — slower, but no headers needed.)
const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: crossOriginIsolationHeaders,
      },
    ];
  },
};

export default nextConfig;
