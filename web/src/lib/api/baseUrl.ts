// Where the FastAPI backend lives. In production the static frontend is served
// same-origin behind Caddy on ki-pc, so the base is "" (relative /api + /assets).
// In local dev the Next dev server proxies /api + /assets to the backend on :8000
// via rewrites (see next.config.ts), so "" works there too. NEXT_PUBLIC_API_BASE_URL
// overrides both (e.g. pointing a static build at a remote exhibition box).

const ENV_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  return ENV_BASE ? stripTrailingSlash(ENV_BASE) : "";
}

/** Base URL for memory assets (splats / previews / thumbnails / audio / manifest). */
export function getAssetsBaseUrl(): string {
  return `${getApiBaseUrl()}/assets`;
}

const DEV_PORTS = new Set(["3000", "3001", "3002"]);

/**
 * Full ws(s):// URL for a backend WebSocket path (e.g. "/ws/control"). Unlike HTTP
 * (proxied same-origin via Next rewrites in dev), the socket connects straight to the
 * backend: ws://localhost:8000 in dev, wss://<same-origin> in prod behind Caddy.
 * NEXT_PUBLIC_API_BASE_URL overrides the base.
 */
export function getWebSocketUrl(path: string): string {
  let base = ENV_BASE ? stripTrailingSlash(ENV_BASE) : "";
  if (!base && typeof window !== "undefined") {
    const { hostname, port, protocol, host } = window.location;
    base =
      (hostname === "localhost" || hostname === "127.0.0.1") && DEV_PORTS.has(port)
        ? "http://localhost:8000"
        : `${protocol}//${host}`;
  }
  return `${base.replace(/^http/, "ws")}${path}`;
}
