import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js + manifest.webmanifest exempted (TURN-S2-send): the root-scoped
    // service worker and PWA manifest must be served without auth-session
    // middleware so the cleaner PWA registers cleanly at scope "/".
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
