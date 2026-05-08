/**
 * GET /api/agent/conversations — list of host's chat conversations.
 *
 * Created in M8 C8 substrate Step F.3 to support layout-mounted ChatClient's
 * client-side rail data fetch. Pre-Step-D, /chat routes server-fetched
 * conversations via listConversations() and passed as props. Post-Step-E
 * thin shells stopped passing props; layout-scope ChatClient now fetches
 * client-side on mount.
 *
 * Auth: createClient + supabase.auth.getUser() per existing API pattern
 * (mirrors /api/audit-feed/since shape). host_id derived from the session,
 * never from query params.
 *
 * Response 200:
 *   { conversations: ConversationListItem[] } where each item has
 *   { id, status, started_at, last_turn_at, preview, propertyName, ... }
 *   per the listConversations() return shape.
 *
 * Response 401: unauthenticated.
 * Response 500: helper threw (rare; e.g., Supabase connectivity).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/agent/conversation";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conversations = await listConversations(user.id);
    return NextResponse.json({ conversations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "list failed";
    return NextResponse.json(
      { error: "Conversations list failed", detail: message },
      { status: 500 },
    );
  }
}
