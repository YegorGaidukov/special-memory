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
