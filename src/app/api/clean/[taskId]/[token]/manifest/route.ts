/**
 * GET /api/clean/[taskId]/[token]/manifest  — per-task PWA manifest.
 *
 * The global manifest (src/app/manifest.ts) has start_url "/", so installing
 * the cleaner portal from the home screen would open the host cockpit, not the
 * job. This per-task manifest sets start_url to THIS job so the installed icon
 * opens the cleaner straight to their cleaning page (where Enable-alerts lives).
 *
 * Param-only — no DB lookup; the manifest is derived entirely from the route.
 * Served under /api so it is already exempt from the auth-session middleware.
 * The /clean segment layout points its <link rel="manifest"> here via
 * generateMetadata, overriding the global manifest for cleaner pages only;
 * host routes keep the global "/" manifest.
 */

export const runtime = "nodejs";

export function GET(
  _request: Request,
  { params }: { params: { taskId: string; token: string } },
) {
  const jobUrl = `/clean/${params.taskId}/${params.token}`;
  const manifest = {
    name: "Koast Cleaning",
    short_name: "Koast",
    description: "Your cleaning job",
    start_url: jobUrl,
    // scope "/clean/" keeps the installed cleaner app focused on cleaning
    // pages while start_url stays within it (avoids exact-path prefix edge
    // cases). Independent of the service-worker scope ("/").
    scope: "/clean/",
    display: "standalone",
    background_color: "#f7f3ec",
    theme_color: "#fafaf7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
