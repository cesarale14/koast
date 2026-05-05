import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "@fontsource-variable/plus-jakarta-sans";

import "./globals.css";

// Fraunces is the Dashboard greeting + pricing-intelligence display face.
// next/font/google's Fraunces manifest only permits a narrow axes set
// at build time, so we load the expressive axes (opsz / SOFT / WONK)
// separately — see globals.css. next/font still owns the weight +
// italic variants for the rest of the product.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
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

// Mobile viewport: cover the notch (`viewport-fit=cover` so
// safe-area-inset-* env vars become non-zero on iPhone Safari) and let
// iOS's interactive widgets resize the layout instead of shifting it
// (`interactive-widget=resizes-content`, prevents the keyboard from
// pushing fixed elements off-screen). Width follows the device.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
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
