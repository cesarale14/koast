/**
 * /chat/[conversation_id] — deep-linked conversation surface (M8 C8 Step E).
 *
 * Server component (RSC). Fetches conversation history via
 * `loadTurnsForConversation` and renders <ConversationHydrator> client
 * wrapper that dispatches SET_ACTIVE_CONVERSATION + HYDRATE_CONVERSATION
 * + EXPAND on mount. The chat surface itself is at layout scope (Step D
 * mounts ChatClient inside the dashboard layout); this route only
 * hydrates the store and triggers expansion.
 *
 * Auth pattern matches the prior implementation. Foreign or unknown
 * conversation_ids notFound() — host-ownership check is inside
 * loadTurnsForConversation.
 *
 * (γ) path lock per Phase B Step 4 sign-off: route-level RSC fetch +
 * thin client hydrator + empty layout Provider. ChatStoreProvider
 * defaults are at the dashboard layout; this route hydrates with real data.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTurnsForConversation } from "@/lib/agent/conversation";
import { ConversationHydrator } from "@/components/chat/ConversationHydrator";

export const dynamic = "force-dynamic";

type RouteParams = { params: { conversation_id: string } };

export default async function ChatConversationPage({ params }: RouteParams) {
  const { conversation_id } = params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let history;
  try {
    history = await loadTurnsForConversation(conversation_id, user.id);
  } catch {
    notFound();
  }

  return (
    <ConversationHydrator
      conversationId={conversation_id}
      history={history}
    />
  );
}
