// MSG-S1 Phase C — Channex messaging webhook handler.
//
// Per docs/MESSAGING_DESIGN.md §4. Dispatched from
// src/app/api/webhooks/channex/route.ts when the event matches the
// MESSAGING_EVENTS list. Handler:
//   1. Idempotent upsert on channex_thread_id + channex_message_id.
//   2. One-shot fetchThread() if we don't have the parent thread yet.
//   3. Recompute thread.unread_count from messages (no +1 increment —
//      tolerates retry races).
//   4. Per-event try/catch; logs loudly, returns gracefully so a single
//      bad event can't 500 the whole webhook request.
//
// Channel inference (MESSAGING_DESIGN.md §3): channel_code is stamped
// at sync from attributes.provider, never derived at read-time.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchThread,
  channelCodeFromProvider,
  deriveBookingLinkFromThread,
  lastMessagePreview,
  type MessageThreadEntity,
} from "@/lib/channex/messages";

// Documented messaging-class events from
// channex-expert/references/endpoint-reference.md:303-304.
export const MESSAGING_EVENTS = new Set<string>([
  "message",
  "inquiry",
  "reservation_request",
  "accepted_reservation",
  "declined_reservation",
  "alteration_request",
]);

function threadKindForEvent(event: string): "message" | "inquiry" | "reservation_request" {
  if (event === "inquiry") return "inquiry";
  if (event === "reservation_request" || event === "accepted_reservation"
      || event === "declined_reservation" || event === "alteration_request") {
    return "reservation_request";
  }
  return "message";
}

// Webhook envelope for messaging events. Per
// channex-expert/references/domain-concepts.md:206-207.
export interface MessageWebhookEnvelope {
  event: string;
  property_id?: string;          // Channex property uuid (matches properties.channex_property_id)
  user_id?: string | null;
  timestamp?: string;
  payload?: {
    id?: string;                  // channex_message_id
    message?: string;
    sender?: string;              // 'guest' | 'property' | 'system'
    property_id?: string;
    booking_id?: string;
    message_thread_id?: string;
    attachments?: unknown[];
    have_attachment?: boolean;
    [k: string]: unknown;
  };
}

interface HandleResult {
  action_taken: string;
  thread_id?: string;
  message_id?: string;
  thread_was_new?: boolean;
  message_was_new?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaAny = SupabaseClient<any, any, any>;

/**
 * Main entry. Called from /api/webhooks/channex when event matches
 * MESSAGING_EVENTS. Caller wraps in try/catch and 200-acks.
 */
export async function handleMessagingEvent(
  envelope: MessageWebhookEnvelope,
  supabase: SupaAny,
): Promise<HandleResult> {
  const event = envelope.event;
  const payload = envelope.payload ?? {};
  const channexMessageId = payload.id;
  const channexThreadId = payload.message_thread_id;
  const channexPropertyId = envelope.property_id ?? payload.property_id;

  if (!channexThreadId) {
    console.warn(`[webhook/messaging] event=${event} missing message_thread_id; skipping`);
    return { action_taken: "skipped_no_thread_id" };
  }
  if (!channexPropertyId) {
    console.warn(`[webhook/messaging] event=${event} thread=${channexThreadId} missing property_id; skipping`);
    return { action_taken: "skipped_no_property_id" };
  }

  // Resolve property_id → local uuid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRows } = await (supabase.from("properties") as any)
    .select("id")
    .eq("channex_property_id", channexPropertyId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = (propRows as any[] | null)?.[0];
  if (!prop?.id) {
    console.warn(`[webhook/messaging] event=${event} channex_property_id=${channexPropertyId} not in DB; skipping`);
    return { action_taken: "skipped_unknown_property" };
  }
  const propertyId: string = prop.id;

  // Upsert thread first (may need to fetch from Channex if new)
  const { threadId: localThreadId, wasNew: threadWasNew } = await upsertThreadByChannexId({
    supabase,
    channexThreadId,
    propertyId,
    threadKindHint: threadKindForEvent(event),
  });

  // Upsert message (skip if event has no message id — inquiry/
  // reservation_request envelopes may carry only state-change info).
  let messageWasNew = false;
  let localMessageId: string | undefined;
  if (channexMessageId && payload.message) {
    const sender = (payload.sender as string | undefined) ?? "guest";
    const direction = sender === "guest" ? "inbound" : "outbound";
    const insertedAt = (payload as Record<string, unknown>).inserted_at as string | undefined
      ?? envelope.timestamp
      ?? new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("messages") as any)
      .select("id")
      .eq("channex_message_id", channexMessageId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasExisting = ((existing as any[] | null) ?? []).length > 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upserted, error } = await (supabase.from("messages") as any)
      .upsert(
        {
          channex_message_id: channexMessageId,
          thread_id: localThreadId,
          property_id: propertyId,
          platform: await platformForThread(supabase, localThreadId),
          direction,
          sender,
          sender_name: sender === "guest" ? "Guest" : "Host",
          content: payload.message,
          attachments: payload.attachments ?? [],
          channex_meta: { event, have_attachment: payload.have_attachment ?? false },
          channex_inserted_at: insertedAt,
          channex_updated_at: insertedAt,
        },
        { onConflict: "channex_message_id" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(`[webhook/messaging] message upsert failed channex_message_id=${channexMessageId}:`, error.message);
      throw new Error(`message upsert failed: ${error.message}`);
    }
    localMessageId = (upserted as { id: string } | null)?.id;
    messageWasNew = !wasExisting;

    // Recompute thread freshness + unread count. SELECT COUNT(*),
    // never +1 — tolerates duplicate deliveries.
    await refreshThreadAggregates(supabase, localThreadId);
  } else if (event !== "message") {
    // State-change events without a message body — just ensure thread
    // metadata is current. fetchThread() refreshes is_closed etc.
    await refreshThreadFromChannex(supabase, localThreadId, channexThreadId);
  }

  console.log(
    `[webhook/messaging] ok event=${event} thread=${channexThreadId.slice(0, 8)}` +
    ` thread_new=${threadWasNew} msg_new=${messageWasNew}`,
  );

  return {
    action_taken: messageWasNew ? "messaging_new" : "messaging_updated",
    thread_id: localThreadId,
    message_id: localMessageId,
    thread_was_new: threadWasNew,
    message_was_new: messageWasNew,
  };
}

// ---------------- Helpers ----------------

async function upsertThreadByChannexId(args: {
  supabase: SupaAny;
  channexThreadId: string;
  propertyId: string;
  threadKindHint: "message" | "inquiry" | "reservation_request";
}): Promise<{ threadId: string; wasNew: boolean }> {
  const { supabase, channexThreadId, propertyId, threadKindHint } = args;

  // Existing?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from("message_threads") as any)
    .select("id")
    .eq("channex_thread_id", channexThreadId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingRow = ((existing as any[] | null) ?? [])[0];

  // Always fetch fresh from Channex for new threads. For existing
  // threads, the message-level upsert and refreshThreadAggregates
  // handle the freshness; skip the extra GET.
  if (existingRow?.id) {
    return { threadId: existingRow.id, wasNew: false };
  }

  const channexThread = await fetchThread(channexThreadId);
  if (!channexThread) {
    // Channex doesn't have this thread (404). Insert a minimal stub
    // so the message can still attach; mark provider unknown.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stub, error } = await (supabase.from("message_threads") as any)
      .insert({
        channex_thread_id: channexThreadId,
        property_id: propertyId,
        channel_code: "unknown",
        provider_raw: "Unknown",
        thread_kind: threadKindHint,
      })
      .select("id")
      .single();
    if (error) throw new Error(`thread stub insert failed: ${error.message}`);
    return { threadId: (stub as { id: string }).id, wasNew: true };
  }

  const row = buildThreadRowFromChannex(channexThread, propertyId, threadKindHint);
  const bookingId = await resolveLocalBookingIdForThread(supabase, propertyId, channexThread);
  if (bookingId) row.booking_id = bookingId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (supabase.from("message_threads") as any)
    .upsert(row, { onConflict: "channex_thread_id" })
    .select("id")
    .single();
  if (error) throw new Error(`thread upsert failed: ${error.message}`);
  return { threadId: (inserted as { id: string }).id, wasNew: true };
}

export function buildThreadRowFromChannex(
  thread: MessageThreadEntity,
  propertyId: string,
  threadKindHint: "message" | "inquiry" | "reservation_request" = "message",
): Record<string, unknown> {
  const a = thread.attributes;
  const link = deriveBookingLinkFromThread(thread);
  return {
    channex_thread_id: thread.id,
    property_id: propertyId,
    channex_channel_id: thread.relationships.channel?.data?.id ?? null,
    channex_booking_id: link.channex_booking_id,
    ota_message_thread_id: link.ota_message_thread_id,
    channel_code: channelCodeFromProvider(a.provider),
    provider_raw: a.provider,
    title: a.title,
    last_message_preview: lastMessagePreview(a.last_message),
    last_message_received_at: a.last_message_received_at,
    message_count: a.message_count ?? 0,
    is_closed: !!a.is_closed,
    thread_kind: threadKindHint,
    meta: a.meta ?? null,
    channex_inserted_at: a.inserted_at,
    channex_updated_at: a.updated_at,
    updated_at: new Date().toISOString(),
  };
}

/**
 * BDC threads carry channex_booking_id directly; AirBNB don't. Both
 * paths join through the RDX-3 join-key fix:
 *   - BDC: bookings WHERE channex_booking_id = $1
 *   - AirBNB: bookings WHERE platform_booking_id = ota_message_thread_id
 *     (best-effort — Airbnb's conversation id often == HM-code suffix
 *      for confirmed bookings; falls through to NULL otherwise)
 */
export async function resolveLocalBookingIdForThread(
  supabase: SupaAny,
  propertyId: string,
  thread: MessageThreadEntity,
): Promise<string | null> {
  const link = deriveBookingLinkFromThread(thread);
  if (link.kind === "channex_booking_id") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("bookings") as any)
      .select("id")
      .eq("property_id", propertyId)
      .eq("channex_booking_id", link.channex_booking_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[] | null) ?? [])[0]?.id ?? null;
  }
  if (link.ota_message_thread_id) {
    // AirBNB best-effort fallback. RDX-3 populated
    // bookings.ota_reservation_code; the conversation thread id
    // sometimes matches it. Cheap query, NULL on no-match.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("bookings") as any)
      .select("id")
      .eq("property_id", propertyId)
      .eq("ota_reservation_code", link.ota_message_thread_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[] | null) ?? [])[0]?.id ?? null;
  }
  return null;
}

async function platformForThread(supabase: SupaAny, threadId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from("message_threads") as any)
    .select("channel_code")
    .eq("id", threadId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = ((data as any[] | null) ?? [])[0];
  const code = row?.channel_code ?? "unknown";
  if (code === "abb") return "airbnb";
  if (code === "bdc") return "booking_com";
  return code;
}

async function refreshThreadAggregates(supabase: SupaAny, threadId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agg } = await (supabase.from("messages") as any)
    .select("channex_inserted_at, sender, read_at")
    .eq("thread_id", threadId)
    .order("channex_inserted_at", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (agg as any[] | null) ?? [];
  const newest = rows[0]?.channex_inserted_at ?? null;
  const messageCount = rows.length;
  const unread = rows.filter((r) => r.sender === "guest" && !r.read_at).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("message_threads") as any)
    .update({
      last_message_received_at: newest,
      message_count: messageCount,
      unread_count: unread,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);
}

async function refreshThreadFromChannex(supabase: SupaAny, localThreadId: string, channexThreadId: string): Promise<void> {
  const fresh = await fetchThread(channexThreadId);
  if (!fresh) return;
  const a = fresh.attributes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("message_threads") as any)
    .update({
      title: a.title,
      last_message_preview: lastMessagePreview(a.last_message),
      last_message_received_at: a.last_message_received_at,
      message_count: a.message_count ?? 0,
      is_closed: !!a.is_closed,
      channex_updated_at: a.updated_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", localThreadId);
}
