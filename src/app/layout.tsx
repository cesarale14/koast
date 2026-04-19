import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "@fontsource-variable/plus-jakarta-sans";

import "./globals.css";

// Fraunces is the Dashboard greeting + pricing-intelligence display face.
// Loaded via next/font/google so Vercel's build optimizes the weights we use.
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
