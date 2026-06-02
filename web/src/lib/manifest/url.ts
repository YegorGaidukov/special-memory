// Resolve a memory asset (splat or thumbnail) to a fetchable URL by joining the
// configurable base (NEXT_PUBLIC_MEMORIES_BASE_URL) with the manifest's relative
// path. An already-absolute asset URL is returned untouched so the manifest can
// point individual memories at an external host.
export function resolveAssetUrl(base: string, assetPath: string): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = assetPath.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedPath}`;
}
