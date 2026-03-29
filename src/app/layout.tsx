import type { Metadata } from "next";
import "@fontsource-variable/nunito";

import "./globals.css";

export const metadata: Metadata = {
  title: "StayCommand",
  description: "Property management for short-term rentals",
  icons: {
    icon: "/favicon.ico",
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
