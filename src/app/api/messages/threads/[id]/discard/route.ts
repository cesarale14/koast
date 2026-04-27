// Session 8a — POST /api/messages/threads/[id]/discard
//
// Discard a pending automation draft. Sets the message's
// draft_status to 'discarded'. The firings row in
// message_automation_firings remains intact — re-fire is gated
// by firings, not by draft state, per D4.
//
// Body: { messageId: string }
// Returns: { ok: true } on success.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threadId = params.id;
    let body: { messageId?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const messageId = (body?.messageId ?? "").trim();
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

    const supabase = createServiceClient();

    // Resolve the message + verify it belongs to this thread + property is owned.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mRows } = await (supabase.from("messages") as any)
      .select("id, thread_id, property_id, draft_status")
      .eq("id", messageId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = ((mRows as any[] | null) ?? [])[0];
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (message.thread_id !== threadId) {
      return NextResponse.json({ error: "Message does not belong to this thread" }, { status: 400 });
    }

    const owned = await verifyPropertyOwnership(user.id, message.property_id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (message.draft_status !== "draft_pending_approval") {
      return NextResponse.json(
        { error: `Only draft_pending_approval messages can be discarded (current: ${message.draft_status})` },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("messages") as any)
      .update({ draft_status: "discarded" })
      .eq("id", messageId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[messages/discard] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
