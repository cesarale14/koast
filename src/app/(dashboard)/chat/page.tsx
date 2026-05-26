/**
 * /chat — landing route, M13 Phase 1.A redirect (operator msg 3518 A4).
 *
 * Pre-M13: this route dispatched EXPAND to open the chat panel overlay.
 * That pattern (M8 C8 Step D layout-slot inversion) is retired —
 * chat-primary surface is pathname-derived, with `/` and `/chat/*` both
 * counting as chat-primary. The bare `/chat` route exists only as a
 * compatibility redirect to `/`; direct deep-links to a specific
 * conversation still resolve via `/chat/[conversation_id]`.
 *
 * Why redirect to `/` and not render: the canonical chat-primary landing
 * is `/`. Keeping `/chat` as a separate landing surface duplicates the
 * empty-conversation entry point without value; the redirect collapses
 * them. Browser back from `/` does not return to `/chat`; the redirect
 * is a 308 (server-side).
 */

import { redirect } from "next/navigation";

export default function ChatLandingPage() {
  redirect("/");
}
