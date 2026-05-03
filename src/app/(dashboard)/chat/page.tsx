/**
 * /chat — fresh-thread landing surface.
 *
 * Server component (D-Q6). Fetches the host's conversation list via
 * D-Q8 (listConversations), then hands a typed prop to <ChatClient>
 * which owns the live SSE state machine.
 *
 * Auth pattern matches src/app/(dashboard)/messages/page.tsx —
 * createClient() + auth.getUser(); unauthenticated visitors get null
 * (the layout group is already inside the authenticated dashboard
 * shell, so a return null behaves the same as the messages page).
 */

import { createClient } from "@/lib/supabase/server";
import { listConversations, listProperties } from "@/lib/agent/conversation";
import { ChatClient } from "@/components/chat/ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatLandingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [conversations, properties] = await Promise.all([
    listConversations(user.id),
    listProperties(user.id),
  ]);

  // Initials for the rail foot — pulled from user_metadata when present,
  // otherwise the first character of the email. Matches the dashboard's
  // existing convention; no new schema work needed.
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
      activeConversationId={null}
      history={[]}
      user={{ initials, name: displayName, org: "koast" }}
      properties={properties}
    />
  );
}
