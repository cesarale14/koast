import type { MetadataRoute } from "next";

// PWA manifest — Next App Router convention (auto-emits <link rel="manifest">
// at /manifest.webmanifest). Main had no manifest before the logo unification;
// this adds one so the installed/home-screen app icon is the correct teal
// layered-bands Koast mark (public/icon-192.png + icon-512.png, copied from
// design/brand-final/favicons). Colors track the brand: shore background,
// shore-tinted theme. iOS home-screen uses src/app/apple-icon.png instead.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Koast",
    short_name: "Koast",
    description: "Property management for short-term rentals",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3ec",
    theme_color: "#fafaf7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
