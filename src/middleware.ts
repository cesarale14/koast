import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // SPIKE (throwaway): `sw\.js` added so an unauthenticated cleaner can fetch
    // the root service worker. Without it, middleware redirects /sw.js to
    // /login and SW registration fails. A real S2 dispatch build needs this
    // exemption (or serves the SW from a public path) too.
    "/((?!_next/static|_next/image|favicon.ico|api/|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
