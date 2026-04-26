// MSG-S1 Phase F — /messages page wired to real data.
//
// Reads from message_threads + bookings + properties directly via the
// service-role client (server component — same pattern as the previous
// version of this page, the only change is the data shape). Shape is
// the same /api/messages/threads payload, just without the HTTP round
// trip.
//
// Slice 1: read-only. Composer disabled in UnifiedInbox; templates tab
// preserved.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import UnifiedInbox, { type ThreadRow } from "@/components/dashboard/UnifiedInbox";
import TemplateManager from "@/components/dashboard/TemplateManager";
import MessagesPageTabs from "@/components/dashboard/MessagesPageTabs";
import EmptyState from "@/components/ui/EmptyState";
import { MessageCircle } from "lucide-react";

export default async function MessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();

  const propertiesRes = await svc
    .from("properties")
    .select("id, name, city, state, cover_photo_url, channex_property_id, messages_last_synced_at")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (propertiesRes.data ?? []) as any[];
  const propertyIds = properties.map((p: { id: string }) => p.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threadsRes: any = propertyIds.length > 0
    ? await svc
        .from("message_threads")
        .select(
          "id, property_id, booking_id, channex_thread_id, channel_code, provider_raw, " +
          "title, last_message_preview, last_message_received_at, message_count, " +
          "unread_count, is_closed, status, thread_kind, created_at, updated_at"
        )
        .in("property_id", propertyIds)
        .order("last_message_received_at", { ascending: false, nullsFirst: false })
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threadsRaw = (threadsRes.data ?? []) as any[];

  // Booking join (only for threads that have one) — guest_name + dates
  const bookingIds = Array.from(
    new Set(threadsRaw.map((t) => t.booking_id).filter(Boolean) as string[])
  );
  let bookingsById = new Map<
    string,
    { guest_name: string | null; check_in: string; check_out: string; total_price?: number; num_guests?: number }
  >();
  if (bookingIds.length > 0) {
    const bookingsRes = await svc
      .from("bookings")
      .select("id, guest_name, check_in, check_out, total_price, num_guests")
      .in("id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookingsById = new Map(((bookingsRes.data ?? []) as any[]).map((b) => [b.id, b]));
  }

  // Templates tab data (unchanged from prior shape)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templatesRes: any = propertyIds.length > 0
    ? await svc
        .from("message_templates")
        .select(
          "id, property_id, template_type, subject, body, is_active, trigger_type, trigger_days_offset, trigger_time"
        )
        .in("property_id", propertyIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templates = (templatesRes.data ?? []) as any[];

  if (properties.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto p-8">
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          description="Messages will appear here when guests contact you through connected channels."
          action={{ label: "Add a Property", href: "/properties" }}
        />
      </div>
    );
  }

  // Enrich thread rows server-side so the client component is purely
  // presentational. Same shape as /api/messages/threads.
  const propsById = new Map(properties.map((p) => [p.id, p]));
  const threads: ThreadRow[] = threadsRaw.map((t) => {
    const b = t.booking_id ? bookingsById.get(t.booking_id) : null;
    const p = propsById.get(t.property_id);
    const platform = t.channel_code === "abb" ? "airbnb"
      : t.channel_code === "bdc" ? "booking_com"
      : (t.channel_code as string);
    return {
      id: t.id,
      channex_thread_id: t.channex_thread_id,
      property_id: t.property_id,
      property_name: p?.name ?? "Unknown Property",
      property_cover_photo_url: p?.cover_photo_url ?? null,
      property_city: p?.city ?? null,
      booking_id: t.booking_id,
      // AirBNB threads have no booking link (channel-asymmetric per
      // MESSAGING_DESIGN §3), so b is null. Channex's thread.title is
      // the guest's first name on AirBNB; fall back to it before the
      // generic "Guest" label.
      guest_display_name: b?.guest_name ?? (t.title?.trim() || null) ?? "Guest",
      check_in: b?.check_in ?? null,
      check_out: b?.check_out ?? null,
      total_price: b?.total_price ?? null,
      num_guests: b?.num_guests ?? null,
      platform,
      channel_code: t.channel_code,
      provider_raw: t.provider_raw,
      title: t.title,
      last_message_preview: t.last_message_preview,
      last_message_received_at: t.last_message_received_at,
      message_count: t.message_count,
      unread_count: t.unread_count,
      is_closed: !!t.is_closed,
      status: t.status,
      thread_kind: t.thread_kind,
    };
  });

  return (
    <MessagesPageTabs
      inboxContent={<UnifiedInbox threads={threads} properties={properties} />}
      templatesContent={<TemplateManager templates={templates} properties={properties} />}
    />
  );
}
