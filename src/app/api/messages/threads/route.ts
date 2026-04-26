// MSG-S1 Phase D — GET /api/messages/threads
//
// Lists threads for the authenticated user, scoped to their owned
// properties. Default sort: last_message_received_at desc. Joins to
// bookings (for guest_name where available) and properties (for
// display name + cover photo).
//
// No pagination yet — hosts at slice 1 scale (≤2 properties × tens
// of threads) don't need it. Slice 4 if it becomes a need.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties } = await (supabase.from("properties") as any)
      .select("id, name, city, state, cover_photo_url, channex_property_id, messages_last_synced_at")
      .eq("user_id", user.id)
      .order("name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = ((properties as any[] | null) ?? []);
    const propertyIds = props.map((p) => p.id);

    if (propertyIds.length === 0) {
      return NextResponse.json({ threads: [], properties: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: threadsRaw } = await (supabase.from("message_threads") as any)
      .select(
        "id, property_id, booking_id, channex_thread_id, channel_code, provider_raw, " +
        "title, last_message_preview, last_message_received_at, message_count, unread_count, " +
        "is_closed, status, thread_kind, created_at, updated_at"
      )
      .in("property_id", propertyIds)
      .order("last_message_received_at", { ascending: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threads = ((threadsRaw as any[] | null) ?? []);

    // Booking join for guest_name + dates (only the rows we actually have)
    const bookingIds = Array.from(new Set(threads.map((t) => t.booking_id).filter(Boolean))) as string[];
    let bookingsById = new Map<string, { guest_name: string | null; check_in: string; check_out: string }>();
    if (bookingIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bookings } = await (supabase.from("bookings") as any)
        .select("id, guest_name, check_in, check_out")
        .in("id", bookingIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bookingsById = new Map(((bookings as any[] | null) ?? []).map((b) => [b.id, b]));
    }

    const propsById = new Map(props.map((p) => [p.id, p]));
    const enriched = threads.map((t) => {
      const b = t.booking_id ? bookingsById.get(t.booking_id) : null;
      const p = propsById.get(t.property_id);
      const platform = t.channel_code === "abb" ? "airbnb"
        : t.channel_code === "bdc" ? "booking_com"
        : t.channel_code;
      return {
        ...t,
        platform,
        property_name: p?.name ?? null,
        property_cover_photo_url: p?.cover_photo_url ?? null,
        property_city: p?.city ?? null,
        // AirBNB threads carry no relationships.booking from Channel
        // (channel-asymmetric per MESSAGING_DESIGN §3), so b is usually
        // null. Fall back to thread.title — Channex populates it with
        // the guest's first name on AirBNB ("Shatara", "Makayla", etc).
        // Final fallback is the platform-tagged "Guest" so empty/missing
        // titles still render readably.
        guest_display_name: b?.guest_name ?? (t.title?.trim() || null) ?? "Guest",
        check_in: b?.check_in ?? null,
        check_out: b?.check_out ?? null,
      };
    });

    return NextResponse.json({ threads: enriched, properties: props });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/messages/threads] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
