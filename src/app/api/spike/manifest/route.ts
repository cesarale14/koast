/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — dynamic web app manifest.
 * NOT production. Served under /api/* (middleware-excluded, public).
 *
 * `start_url` is taken from ?start= so the installed PWA opens the SPECIFIC
 * job page the cleaner installed from (iOS launches start_url when present).
 * ==========================================================================*/

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start") || "/";
  // Only allow same-site relative start_urls.
  const safeStart = start.startsWith("/") ? start : "/";

  const manifest = {
    name: "Koast for Cleaners",
    short_name: "Koast Clean",
    description: "Cleaner job alerts (de-risking spike)",
    start_url: safeStart,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#17392a",
    theme_color: "#17392a",
    icons: [
      { src: "/icons/spike/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/spike/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
