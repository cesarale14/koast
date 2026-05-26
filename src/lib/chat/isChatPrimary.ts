/**
 * isChatPrimary — single source of truth for layout surface determination
 * (M13 Phase 1.A; operator msg 3515 R1 binding refinement).
 *
 * The pathname is the only input. Chat-primary routes (`/` and `/chat/*`)
 * render the full chat surface; every other route is inspect-mode with
 * MiniChatBack as the navigation back-affordance.
 *
 * SSR-safe (no `window`, no `document`).
 *
 * USAGE — anywhere the layout needs to know which surface to mount:
 *   const pathname = usePathname();
 *   if (isChatPrimary(pathname)) { ... }
 *
 * INVARIANT — pathname is the ONLY source of truth. Do NOT branch on
 * any client-state boolean (e.g. a `mode` reducer field) as a fallback.
 * Browser back/forward must work for free.
 */

export function isChatPrimary(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  if (pathname === "/chat") return true;
  if (pathname.startsWith("/chat/")) return true;
  return false;
}
