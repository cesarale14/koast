// MSG-S1 Phase D — GET /api/messages/threads/[id]
//
// Single thread + its messages, sorted ascending by
// channex_inserted_at (chronological). Auth-gated by ownership of
// the parent property.
//
// Session 8a.1 extends the response with a `context` field that
// resolves the booking or inquiry anchoring the thread. Frontend
// renders this as a ConversationContextCard at the top of the
// message list (replaces the "No messages in this conversation
// yet" empty state for booking-anchored threads).

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface ThreadContextBooking {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  num_guests: number | null;
  platform: string;
  ota_reservation_code: string | null;
  total_price: number | null;
  currency: string | null;
}

interface ThreadContext {
  type: "booking" | "inquiry" | "unknown";
  booking?: ThreadContextBooking;
  inquiry?: { guest_name: string | null; first_message_preview: string | null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveContext(supabase: any, thread: Row, firstInbound: Row | null): Promise<ThreadContext> {
  // Tier 1: direct booking_id link (BDC threads + Airbnb threads
  // post-reconcile via worker).
  if (thread.booking_id) {
    const { data } = await (supabase.from("bookings") as Row)
      .select("id, guest_name, check_in, check_out, num_guests, platform, ota_reservation_code, total_price, currency")
      .eq("id", thread.booking_id)
      .limit(1);
    const b = ((data as Row[] | null) ?? [])[0] as ThreadContextBooking | undefined;
    if (b) return { type: "booking", booking: b };
  }

  // Tier 2: Airbnb threads that haven't been reconciled yet —
  // resolve via ota_message_thread_id ↔ bookings.platform_booking_id.
  if (thread.ota_message_thread_id) {
    const { data } = await (supabase.from("bookings") as Row)
      .select("id, guest_name, check_in, check_out, num_guests, platform, ota_reservation_code, total_price, currency")
      .eq("platform_booking_id", thread.ota_message_thread_id)
      .eq("property_id", thread.property_id)
      .limit(1);
    const b = ((data as Row[] | null) ?? [])[0] as ThreadContextBooking | undefined;
    if (b) return { type: "booking", booking: b };
  }

  // Tier 3: inquiry — no resolved booking, but the thread itself or
  // the first inbound message carries enough context to anchor the
  // conversation (typically Airbnb pre-booking inquiries).
  const guestName = thread.title ?? firstInbound?.sender_name ?? null;
  const preview = firstInbound?.content ?? thread.last_message_preview ?? null;
  if (guestName || preview) {
    return {
      type: "inquiry",
      inquiry: { guest_name: guestName, first_message_preview: preview },
    };
  }

  return { type: "unknown" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threadId = params.id;
    const supabase = createServiceClient();

    const { data: tRows } = await (supabase.from("message_threads") as Row)
      .select("*")
      .eq("id", threadId)
      .limit(1);
    const thread = ((tRows as Row[] | null) ?? [])[0];
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const owned = await verifyPropertyOwnership(user.id, thread.property_id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: msgs } = await (supabase.from("messages") as Row)
      .select(
        "id, thread_id, channex_message_id, direction, sender, sender_name, content, " +
        "attachments, read_at, channex_inserted_at, created_at, " +
        // Session 8a: surface ai_draft + draft_status so the inbox
        // can render pending automation drafts inline.
        "ai_draft, draft_status, sent_at"
      )
      .eq("thread_id", threadId)
      .order("channex_inserted_at", { ascending: true });

    const messages = (msgs as Row[] | null) ?? [];
    const firstInbound = messages.find((m) => m.direction === "inbound") ?? null;

    const context = await resolveContext(supabase, thread, firstInbound);

    return NextResponse.json({ thread, messages, context });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/messages/threads/[id]] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
