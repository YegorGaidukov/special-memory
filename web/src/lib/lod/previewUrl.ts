// A distant memory is shown as a decimated point cloud (its `.preview.ply`)
// until the camera flies near and the full splat loads. The preview asset sits
// next to the splat with the same stem, so its URL is derived by swapping the
// splat extension for `.preview.ply` — no extra manifest field needed.
const SPLAT_EXT = /\.(sog|ply|ksplat|spz|splat)$/i;

export function previewUrlFor(splatUrl: string): string {
  return splatUrl.replace(SPLAT_EXT, "") + ".preview.ply";
}
