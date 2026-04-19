import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "@fontsource-variable/plus-jakarta-sans";

import "./globals.css";

// Fraunces is the Dashboard greeting + pricing-intelligence display face.
// The handwritten greeting uses Fraunces' expressive variable-font axes
// (opsz, SOFT, WONK) for a looser, pen-like rendering at large sizes;
// we load them via next/font/google `axes` so the UI can hit
// font-variation-settings: "opsz" 144, "SOFT" 100, "WONK" 1 directly.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Koast",
  description: "Property management for short-term rentals",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body>{children}</body>
    </html>
  );
}
