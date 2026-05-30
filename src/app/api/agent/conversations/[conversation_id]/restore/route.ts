/**
 * POST /api/agent/conversations/[conversation_id]/restore — undo soft-delete
 * (M13 D1). Nulls agent_conversations.deleted_at so the conversation surfaces
 * again in every read.
 *
 * Same auth/ownership shape as DELETE: session host from supabase.auth.getUser();
 * ownership enforced inside restoreConversation's UPDATE WHERE. Foreign /
 * nonexistent id → 404. Idempotent on an already-live conversation.
 *
 * Response 200: { ok: true }
 * Response 400: missing conversation_id
 * Response 401: unauthenticated
 * Response 404: not found OR not owned by the session host
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { restoreConversation } from "@/lib/agent/conversation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { conversation_id: string };
};

export async function POST(_req: Request, context: RouteContext) {
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
    await restoreConversation(conversation_id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "conversation not found or not accessible", detail: message },
      { status: 404 },
    );
  }
}
