/**
 * GET /api/agent/conversations/[conversation_id]/turns
 *
 * M13 Phase 1.B follow-on (deep-link conversation loading bug fix).
 *
 * Client-side fetch of a conversation's history. Used by the chat-primary
 * surface's URL-sync watcher (src/components/chat/ChatURLSync.tsx) to
 * hydrate the store reactively when the URL conversation_id changes
 * during soft client-side navigation.
 *
 * Why this endpoint exists: the M13 Phase 1.A chat-primary surface owns
 * the viewport and does NOT render Next.js `{children}` — which means
 * the /chat/[id]/page.tsx server component (which used to render
 * <ConversationHydrator>) never mounts. Soft nav from /chat/[idA] →
 * /chat/[idB] changes the URL but ConversationHydrator's effect never
 * fires (it doesn't mount at all). The chat surface remains stuck on
 * whatever conversation was last loaded. Operator-reported bug.
 *
 * Fix shape: ChatURLSync watches `usePathname()`, calls this endpoint
 * on conversation_id changes, dispatches SET_ACTIVE_CONVERSATION +
 * HYDRATE_CONVERSATION via the chat store.
 *
 * Auth + ownership: same shape as the prior loadTurnsForConversation
 * call from /chat/[id]/page.tsx (RSC). Auth via supabase session;
 * ownership check inside loadTurnsForConversation (throws if foreign).
 *
 * Response 200: { turns: UITurn[] }
 * Response 401: unauthenticated
 * Response 404: conversation not found OR not owned by session host
 * Response 500: load threw an unexpected error
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadTurnsForConversation } from "@/lib/agent/conversation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { conversation_id: string };
};

export async function GET(_req: Request, context: RouteContext) {
  const { conversation_id } = context.params;
  if (!conversation_id || typeof conversation_id !== "string") {
    return NextResponse.json(
      { error: "missing conversation_id" },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const turns = await loadTurnsForConversation(conversation_id, user.id);
    return NextResponse.json({ turns });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // loadTurnsForConversation throws for "does not belong to host" and
    // for "cannot fetch" (no row). Both surface as 404 from the client's
    // perspective — the host either doesn't own the conversation or it
    // doesn't exist. Internal-error detail in the body for diagnostics.
    return NextResponse.json(
      { error: "conversation not found or not accessible", detail: message },
      { status: 404 },
    );
  }
}
