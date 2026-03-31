import type { Metadata } from "next";
import "@fontsource-variable/nunito";

import "./globals.css";

export const metadata: Metadata = {
  title: "StayCommand",
  description: "Property management for short-term rentals",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-icon.png",
  },
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
