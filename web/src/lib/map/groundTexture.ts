import maplibregl, { type StyleSpecification } from "maplibre-gl";

/**
 * Browser/MapLibre seam (not unit-tested): render a static map of `bounds` into
 * an offscreen `size`×`size` canvas and resolve a 2D canvas usable as a
 * THREE.CanvasTexture. The map is non-interactive and removed after one render.
 */
export function renderMapToCanvas(
  style: StyleSpecification,
  bounds: [number, number, number, number],
  size: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.style.cssText = `position:absolute;left:-9999px;top:0;width:${size}px;height:${size}px;`;
    document.body.appendChild(host);

    const cleanup = (map: maplibregl.Map) => {
      map.remove();
      host.remove();
    };

    const map = new maplibregl.Map({
      container: host,
      style,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // required to read pixels out of the GL canvas
      bounds: [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      fitBoundsOptions: { padding: 0, animate: false },
    });

    let done = false;
    map.on("idle", () => {
      if (done) return;
      done = true;
      try {
        const out = document.createElement("canvas");
        out.width = size;
        out.height = size;
        out.getContext("2d")!.drawImage(map.getCanvas(), 0, 0, size, size);
        cleanup(map);
        resolve(out);
      } catch (e) {
        cleanup(map);
        reject(e);
      }
    });
    map.on("error", (e) => {
      if (done) return;
      done = true;
      cleanup(map);
      reject(e.error ?? new Error("maplibre render error"));
    });
  });
}
