// MSG-S1 — TS sync helper. Mirrors src/lib/reviews/sync.ts shape.
// Used by:
//   - POST /api/messages/sync (manual refresh route)
//   - On-connect trigger after property import (slice 2 wires those)
//   - The Python worker reads the same DB but uses its own helpers
//     (parity, not shared code).
//
// Single source of truth for upsert shape. The webhook handler in
// src/lib/webhooks/messaging.ts uses the same column set.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listThreads,
  listMessages,
  channelCodeFromProvider,
  type MessageThreadEntity,
  type ChannexMessageEntity,
} from "@/lib/channex/messages";
import {
  buildThreadRowFromChannex,
  resolveLocalBookingIdForThread,
} from "@/lib/webhooks/messaging";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaAny = SupabaseClient<any, any, any>;

export interface SyncResult {
  threads_seen: number;
  threads_new: number;
  threads_updated: number;
  messages_seen: number;
  messages_new: number;
  messages_updated: number;
  errors: string[];
}

export async function syncMessagesForOneProperty(
  supabase: SupaAny,
  prop: { id: string; channex_property_id: string; name?: string | null },
): Promise<SyncResult> {
  const result: SyncResult = {
    threads_seen: 0,
    threads_new: 0,
    threads_updated: 0,
    messages_seen: 0,
    messages_new: 0,
    messages_updated: 0,
    errors: [],
  };

  let threads: MessageThreadEntity[];
  try {
    threads = await listThreads(prop.channex_property_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`listThreads failed: ${msg}`);
    return result;
  }
  result.threads_seen = threads.length;

  // Preload existing thread channex_thread_ids so we count new vs updated cleanly.
  const incomingIds = threads.map((t) => t.id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingThreads } = await (supabase.from("message_threads") as any)
    .select("id, channex_thread_id")
    .in("channex_thread_id", incomingIds.length > 0 ? incomingIds : ["__none__"]);
  const existingThreadRows = (existingThreads ?? []) as Array<{ id: string; channex_thread_id: string }>;
  const existingThreadByChannexId = new Map<string, string>(
    existingThreadRows.map((r) => [r.channex_thread_id, r.id]),
  );

  for (const thread of threads) {
    try {
      const isNew = !existingThreadByChannexId.has(thread.id);
      const row = buildThreadRowFromChannex(thread, prop.id, "message");
      const bookingId = await resolveLocalBookingIdForThread(supabase, prop.id, thread);
      if (bookingId) row.booking_id = bookingId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upserted, error: tErr } = await (supabase.from("message_threads") as any)
        .upsert(row, { onConflict: "channex_thread_id" })
        .select("id")
        .single();
      if (tErr) {
        result.errors.push(`thread upsert ${thread.id}: ${tErr.message}`);
        continue;
      }
      const localThreadId = (upserted as { id: string }).id;
      if (isNew) result.threads_new += 1; else result.threads_updated += 1;

      // Pull messages for this thread
      const msgs = await listMessages(thread.id);
      result.messages_seen += msgs.length;
      const newCount = await upsertMessages(supabase, msgs, {
        threadLocalId: localThreadId,
        propertyId: prop.id,
        platform: platformForChannelCode(channelCodeFromProvider(thread.attributes.provider)),
      });
      result.messages_new += newCount.new;
      result.messages_updated += newCount.updated;

      // Recompute aggregates
      await refreshAggregates(supabase, localThreadId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`thread ${thread.id}: ${msg}`);
    }
  }

  return result;
}

async function upsertMessages(
  supabase: SupaAny,
  msgs: ChannexMessageEntity[],
  ctx: { threadLocalId: string; propertyId: string; platform: string },
): Promise<{ new: number; updated: number }> {
  if (msgs.length === 0) return { new: 0, updated: 0 };

  const ids = msgs.map((m) => m.id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from("messages") as any)
    .select("channex_message_id")
    .in("channex_message_id", ids);
  const existingSet = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((existing as any[] | null) ?? []).map((r) => r.channex_message_id as string),
  );

  let n = 0;
  let u = 0;
  for (const m of msgs) {
    const a = m.attributes;
    const sender = a.sender ?? "guest";
    const direction = sender === "guest" ? "inbound" : "outbound";
    const isNew = !existingSet.has(m.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("messages") as any).upsert(
      {
        channex_message_id: m.id,
        thread_id: ctx.threadLocalId,
        property_id: ctx.propertyId,
        platform: ctx.platform,
        direction,
        sender,
        sender_name: sender === "guest" ? "Guest" : "Host",
        content: a.message,
        attachments: a.attachments ?? [],
        channex_meta: a.meta ?? null,
        channex_inserted_at: a.inserted_at,
        channex_updated_at: a.updated_at,
      },
      { onConflict: "channex_message_id" },
    );
    if (error) {
      console.warn(`[messages/sync] msg upsert failed ${m.id}:`, error.message);
      continue;
    }
    if (isNew) n += 1; else u += 1;
  }
  return { new: n, updated: u };
}

async function refreshAggregates(supabase: SupaAny, threadId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from("messages") as any)
    .select("channex_inserted_at, sender, read_at")
    .eq("thread_id", threadId)
    .order("channex_inserted_at", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data as any[] | null) ?? []);
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

function platformForChannelCode(code: string): string {
  if (code === "abb") return "airbnb";
  if (code === "bdc") return "booking_com";
  return code;
}

export async function syncMessagesForUser(
  supabase: SupaAny,
  userId: string,
): Promise<{ per_property: Record<string, SyncResult>; failures: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: props } = await (supabase.from("properties") as any)
    .select("id, name, channex_property_id")
    .eq("user_id", userId)
    .not("channex_property_id", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = ((props as any[] | null) ?? []) as Array<{ id: string; name: string | null; channex_property_id: string }>;
  const per: Record<string, SyncResult> = {};
  let failures = 0;
  for (const p of list) {
    try {
      per[p.id] = await syncMessagesForOneProperty(supabase, p);
      // Stamp on success
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("properties") as any)
        .update({ messages_last_synced_at: new Date().toISOString() })
        .eq("id", p.id);
    } catch (err) {
      failures += 1;
      console.warn(`[messages/sync] property ${p.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return { per_property: per, failures };
}
