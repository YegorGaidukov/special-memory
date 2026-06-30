import type { NextConfig } from "next";

// Deployment model (see docs/superpowers/specs/2026-06-30-s4-...-design.md):
// the frontend is a STATIC export served same-origin behind Caddy on ki-pc, with
// the FastAPI backend at /api + /assets. Caddy sets the cross-origin-isolation
// headers in production. We only export when STATIC_EXPORT=1 (the deploy build);
// `next dev` keeps a server so the headers below still apply during local dev.
const isExport = process.env.STATIC_EXPORT === "1";

// The Gaussian-splat renderer sorts splats in a Web Worker using SharedArrayBuffer,
// which browsers only expose in a cross-origin-isolated context (these two headers).
const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  // StrictMode's dev double-mount tears down the WebGL splat Viewer; off so dev
  // behaves like prod for the canvas.
  reactStrictMode: false,
  // Optional subpath on the shared chair domain (e.g. "/memory-city"); a dedicated
  // subdomain leaves this unset.
  basePath: process.env.NEXT_BASE_PATH || undefined,
  ...(isExport
    ? {
        output: "export",
        // No Next image optimizer in a static export.
        images: { unoptimized: true },
      }
    : {
        // headers() is ignored by `output: export`; keep it for the dev server only,
        // where Caddy isn't in front to provide cross-origin isolation.
        async headers() {
          return [{ source: "/:path*", headers: crossOriginIsolationHeaders }];
        },
        // Dev only: proxy the backend so the frontend uses same-origin relative URLs
        // (mirrors prod behind Caddy) — no CORS, and COEP/require-corp is satisfied.
        async rewrites() {
          const backend = process.env.BACKEND_ORIGIN || "http://localhost:8000";
          return [
            { source: "/api/:path*", destination: `${backend}/api/:path*` },
            { source: "/assets/:path*", destination: `${backend}/assets/:path*` },
          ];
        },
      }),
};

export default nextConfig;
