/**
 * DELETE /api/agent/conversations/[conversation_id] — soft-delete (M13 D1).
 *
 * Sets agent_conversations.deleted_at; the row is then filtered from every
 * conversation read via notDeleted(). DELETE (not PATCH): the client expresses
 * "delete this conversation" — soft-ness is a server implementation detail.
 *
 * Auth + ownership: session host from supabase.auth.getUser(); ownership is
 * enforced inside softDeleteConversation's UPDATE WHERE. A foreign/nonexistent
 * id throws → 404 (composes with the N4/S6 redirect when the deleted id is then
 * deep-linked). Idempotent on an already-deleted owned conversation.
 *
 * Response 200: { ok: true }
 * Response 400: missing conversation_id
 * Response 401: unauthenticated
 * Response 404: not found OR not owned by the session host
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { softDeleteConversation } from "@/lib/agent/conversation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { conversation_id: string };
};

export async function DELETE(_req: Request, context: RouteContext) {
  const { conversation_id } = context.params;
  if (!conversation_id || typeof conversation_id !== "string") {
    return NextResponse.json({ error: "missing conversation_id" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await softDeleteConversation(conversation_id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "conversation not found or not accessible", detail: message },
      { status: 404 },
    );
  }
}
