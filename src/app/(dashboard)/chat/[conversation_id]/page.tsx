/**
 * /chat/[conversation_id] — existing conversation surface.
 *
 * Server component (D-Q6). Loads conversation list (rail) + this
 * conversation's full turn history (D-Q8). Host-ownership check is
 * inside loadTurnsForConversation; unauthorized access throws and
 * Next surfaces the error page.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listConversations,
  listProperties,
  loadTurnsForConversation,
} from "@/lib/agent/conversation";
import { ChatClient } from "@/components/chat/ChatClient";

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
    // Foreign conversation_id, or doesn't exist — both 404 from the
    // host's perspective (we don't disclose existence of others' threads).
    notFound();
  }

  const [conversations, properties] = await Promise.all([
    listConversations(user.id),
    listProperties(user.id),
  ]);

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "Host";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "K";

  return (
    <ChatClient
      conversations={conversations.map((c) => ({
        id: c.id,
        last_turn_at: c.last_turn_at,
        preview: c.preview,
        propertyName: c.propertyName,
      }))}
      activeConversationId={conversation_id}
      history={history}
      user={{ initials, name: displayName, org: "koast" }}
      properties={properties}
    />
  );
}
