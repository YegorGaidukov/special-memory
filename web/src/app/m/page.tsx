import type { Viewport } from "next";
import MobileApp from "./MobileApp";

// The phone companion entry (scan a QR -> here). A deliberately minimal, full-bleed
// page that never mounts the WebGL explorer. Lock zoom so the joystick (Phase 5)
// doesn't pinch-zoom the page; cover the notch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#05060a",
};

export default function MobilePage() {
  return <MobileApp />;
}
