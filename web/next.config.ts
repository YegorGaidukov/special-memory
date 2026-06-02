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
  // The explorer is a single, full-page WebGL canvas. React StrictMode's dev-only
  // double-mount tears down and recreates the splat Viewer (aborting an in-flight
  // load and racing GPU teardown against the live instance), which manifests as a
  // lost WebGL context. Production never double-mounts, so turning StrictMode off
  // makes dev behave like prod for this canvas. (Diagnostic isolation step.)
  reactStrictMode: false,
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
