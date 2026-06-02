import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collective Memory City",
  description: "Fly through a city remembered in photoreal Gaussian-splat memories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
