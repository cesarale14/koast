import type { Metadata } from "next";
import "@fontsource-variable/nunito-sans";

import "./globals.css";

export const metadata: Metadata = {
  title: "StayCommand",
  description: "Property management for short-term rentals",
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
