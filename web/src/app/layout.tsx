import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// Geist is the app typeface (sans for all UI text, mono for numeric readouts).
// next/font self-hosts it as a static asset — no runtime request to Google. Each
// exposes a CSS variable that globals.css points --font-sans / --font-mono at.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Newsreader is the serif display face for the phone companion's 5b "Beautiful
// shadow" screens (memory titles + floating labels). Light weights only.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Collective Memory City",
  description: "Fly through a city remembered in photoreal Gaussian-splat memories.",
};

// Set data-theme before first paint so a saved light theme doesn't flash dark.
// Mirrors the default ("dark") used by useTheme.
const themeScript = `(function(){try{var t=localStorage.getItem("cmc-theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme is set on the server to the default and adjusted pre-paint by
    // themeScript (from localStorage). suppressHydrationWarning tells React that
    // attribute is intentionally script-managed, so a saved light theme doesn't
    // trip a hydration mismatch.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
