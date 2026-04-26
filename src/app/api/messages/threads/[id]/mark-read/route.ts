// MSG-S2 Phase B.2 — POST /api/messages/threads/[id]/mark-read
//
// Auth-gated, property-ownership-checked. Stamps read_at on every
// inbound (sender='guest') message in the thread with NULL read_at,
// then refreshes thread aggregates so unread_count → 0.
//
// Channex has no documented mark-read endpoint on /message_threads
// (per skill + probe). Local DB IS the source of truth for read
// state; cross-device sync is best-effort and would arrive when
// Channex eventually exposes per-thread read tracking. The Channex
// helper call is a no-op stub; logged but doesn't affect the
// response. See src/lib/channex/messages.ts markThreadRead.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { markThreadRead as channexMarkThreadRead } from "@/lib/channex/messages";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threadId = params.id;
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tRows } = await (supabase.from("message_threads") as any)
      .select("id, property_id, channex_thread_id")
      .eq("id", threadId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thread = ((tRows as any[] | null) ?? [])[0];
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    const owned = await verifyPropertyOwnership(user.id, thread.property_id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Mark all inbound unread as read (local source of truth)
    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase.from("messages") as any)
      .update({ read_at: nowIso })
      .eq("thread_id", thread.id)
      .eq("sender", "guest")
      .is("read_at", null);
    if (updErr) {
      console.error(`[messages/mark-read] update failed thread=${thread.channex_thread_id.slice(0, 8)}:`, updErr.message);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("message_threads") as any)
      .update({ unread_count: 0, updated_at: nowIso })
      .eq("id", thread.id);

    // Best-effort Channex sync (no-op today; logs if Channex helper
    // ever returns non-200 once the endpoint exists).
    try {
      await channexMarkThreadRead(thread.channex_thread_id);
    } catch (err) {
      console.warn(`[messages/mark-read] Channex mark-read call failed (non-fatal):`, err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ ok: true, unread_count: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/messages/threads/[id]/mark-read] outer error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
