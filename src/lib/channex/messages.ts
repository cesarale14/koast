// MSG-S1 Phase B — Channex messaging client.
//
// Companion to src/lib/channex/client.ts (reviews methods at :740-810).
// Same auth + pagination + dedup-by-id pattern. Per
// docs/MESSAGING_DESIGN.md §5 + §2.5 — page[limit] is advisory on
// /message_threads/:id/messages (probe sent 5, got 10), so the loop
// bails when a page contributes zero new ids.
//
// Channel-asymmetric booking link is the load-bearing design point:
// BDC threads expose relationships.booking; AirBNB threads expose
// only ota_message_thread_id. deriveBookingLinkFromThread is the
// single helper the sync helper + webhook handler call.
//
// Slice 1 ships read methods + the one-shot webhook updater. Send,
// close, no-reply-needed are stubs that throw — slice 2/3 fill them.

const DEFAULT_BASE_URL = "https://app.channex.io/api/v1";

// ---------------- Types ----------------

export type ChannelCode = "abb" | "bdc" | "unknown";

export interface MessageThreadAttrs {
  title: string | null;
  last_message: string | null;
  last_message_received_at: string;
  inserted_at: string;
  updated_at: string;
  is_closed: boolean;
  message_count: number;
  provider: string;                                 // 'AirBNB' | 'BookingCom' | …
  ota_message_thread_id: string | null;
  meta?: Record<string, unknown> | null;
}

export interface MessageThreadRels {
  property: { data: { id: string; type: "property" } };
  channel: { data: { id: string; type: "channel" } };
  booking?: { data: { id: string; type: "booking" } };
}

export interface MessageThreadEntity {
  id: string;
  type: "message_thread";
  attributes: MessageThreadAttrs;
  relationships: MessageThreadRels;
}

export interface ChannexMessageAttrs {
  message: string;
  sender: "guest" | "property" | "system" | string;  // accept future enum widening
  inserted_at: string;
  updated_at: string;
  attachments: ChannexAttachment[] | null;
  meta?: Record<string, unknown> | null;
}

export interface ChannexMessageEntity {
  id: string;
  type: "message";
  attributes: ChannexMessageAttrs;
  relationships?: { message_thread?: { data: { id: string } } };
}

export interface ChannexAttachment {
  // Probe returned empty arrays. Shape preserved as opaque until
  // slice 4 wires download/upload — captured into channex_meta jsonb.
  url?: string;
  filename?: string;
  size?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export interface ChannexWebhook {
  id: string;
  type: "webhook";
  attributes: {
    callback_url: string;
    event_mask: string;
    is_active: boolean;
    is_global: boolean;
    property_id: string | null;
    send_data: boolean;
    headers: Record<string, string>;
    request_params: Record<string, unknown>;
    protected: boolean;
  };
}

// Channel-asymmetric booking link — see MESSAGING_DESIGN.md §3.
// Discriminated by `kind` so consumers can branch cleanly.
export type ThreadBookingLink =
  | { kind: "channex_booking_id"; channex_booking_id: string; ota_message_thread_id: string | null }
  | { kind: "ota_only"; channex_booking_id: null; ota_message_thread_id: string | null };

export function deriveBookingLinkFromThread(
  thread: Pick<MessageThreadEntity, "relationships" | "attributes">,
): ThreadBookingLink {
  const ota = thread.attributes.ota_message_thread_id ?? null;
  const channexBookingId = thread.relationships.booking?.data?.id ?? null;
  if (channexBookingId) {
    return { kind: "channex_booking_id", channex_booking_id: channexBookingId, ota_message_thread_id: ota };
  }
  return { kind: "ota_only", channex_booking_id: null, ota_message_thread_id: ota };
}

// Provider → Koast channel_code. Probe-confirmed casing: 'AirBNB',
// 'BookingCom'. Uppercased fallback covers future Channex casing
// surprises without mis-bucketing.
export function channelCodeFromProvider(provider: string | null | undefined): ChannelCode {
  const p = (provider ?? "").toLowerCase();
  if (p === "airbnb") return "abb";
  if (p === "bookingcom" || p === "booking_com" || p === "booking.com") return "bdc";
  return "unknown";
}

// ---------------- Client ----------------

export interface MessagingClientConfig {
  apiKey: string;
  baseUrl?: string;
}

function resolveConfig(cfg?: MessagingClientConfig): { apiKey: string; baseUrl: string } {
  const apiKey = cfg?.apiKey ?? process.env.CHANNEX_API_KEY;
  if (!apiKey) throw new Error("CHANNEX_API_KEY is not set");
  return { apiKey, baseUrl: cfg?.baseUrl ?? DEFAULT_BASE_URL };
}

async function channexGet<T = unknown>(path: string, cfg?: MessagingClientConfig): Promise<T> {
  const { apiKey, baseUrl } = resolveConfig(cfg);
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "user-api-key": apiKey, accept: "application/json" },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    throw new Error(`Channex GET ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return parsed as T;
}

async function channexPut<T = unknown>(path: string, body: unknown, cfg?: MessagingClientConfig): Promise<T> {
  const { apiKey, baseUrl } = resolveConfig(cfg);
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "user-api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    throw new Error(`Channex PUT ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return parsed as T;
}

// ---------------- Threads ----------------

/**
 * GET /message_threads?filter[property_id]=<id>
 *
 * Pulls all threads for a property. Channex pagination caps at the
 * default page size (~10) regardless of page[limit] (probe-confirmed
 * 2026-04-26). Same dedup-by-id loop as reviews_sync — bail when a
 * page contributes zero new ids.
 */
export async function listThreads(
  propertyId: string,
  cfg?: MessagingClientConfig,
): Promise<MessageThreadEntity[]> {
  const seen = new Set<string>();
  const out: MessageThreadEntity[] = [];
  let page = 1;
  while (page <= 50) {
    const path = `/message_threads?filter[property_id]=${propertyId}&page[limit]=100&page[number]=${page}`;
    const res = await channexGet<{ data?: MessageThreadEntity[] }>(path, cfg);
    const batch = res.data ?? [];
    if (batch.length === 0) break;
    const before = seen.size;
    for (const t of batch) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    if (seen.size === before) break;
    page += 1;
  }
  return out;
}

/**
 * GET /message_threads/:id
 *
 * Used by the webhook handler when it sees a channex_thread_id we
 * don't have locally — single fetch to populate metadata before the
 * upsert. Cached forever after via the UNIQUE index on
 * message_threads.channex_thread_id.
 */
export async function fetchThread(
  threadId: string,
  cfg?: MessagingClientConfig,
): Promise<MessageThreadEntity | null> {
  try {
    const res = await channexGet<{ data?: MessageThreadEntity }>(`/message_threads/${threadId}`, cfg);
    return res.data ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

/**
 * GET /message_threads/:id/messages
 *
 * Same pagination caveat as listThreads. Default order is
 * inserted_at desc (probe-confirmed). Sync helper relies on the
 * dedup-by-id loop, not on page[limit].
 */
export async function listMessages(
  threadId: string,
  cfg?: MessagingClientConfig,
): Promise<ChannexMessageEntity[]> {
  const seen = new Set<string>();
  const out: ChannexMessageEntity[] = [];
  let page = 1;
  while (page <= 50) {
    const path = `/message_threads/${threadId}/messages?page[limit]=100&page[number]=${page}`;
    const res = await channexGet<{ data?: ChannexMessageEntity[] }>(path, cfg);
    const batch = res.data ?? [];
    if (batch.length === 0) break;
    const before = seen.size;
    for (const m of batch) {
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    if (seen.size === before) break;
    page += 1;
  }
  return out;
}

// ---------------- Webhook subscription (Phase E one-shot) ----------------

export async function getWebhooks(cfg?: MessagingClientConfig): Promise<ChannexWebhook[]> {
  const res = await channexGet<{ data?: ChannexWebhook[] }>(`/webhooks`, cfg);
  return res.data ?? [];
}

export async function getWebhook(
  webhookId: string,
  cfg?: MessagingClientConfig,
): Promise<ChannexWebhook | null> {
  try {
    const res = await channexGet<{ data?: ChannexWebhook }>(`/webhooks/${webhookId}`, cfg);
    return res.data ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

/**
 * PUT /webhooks/:id with a full webhook body. Channex requires the
 * full body — no partial PATCH semantics — so callers must read the
 * current entity and reconstruct, or specify every field.
 *
 * Used once at slice 1 to widen the account event_mask to include
 * the messaging events. See docs/MESSAGING_DESIGN.md §4.4.
 */
export async function updateWebhook(
  webhookId: string,
  body: {
    callback_url: string;
    event_mask: string;
    property_id: string | null;
    is_global: boolean;
    is_active: boolean;
    send_data: boolean;
    headers?: Record<string, string>;
    request_params?: Record<string, unknown>;
    protected?: boolean;
  },
  cfg?: MessagingClientConfig,
): Promise<ChannexWebhook> {
  const res = await channexPut<{ data?: ChannexWebhook }>(`/webhooks/${webhookId}`, { webhook: body }, cfg);
  if (!res.data) throw new Error("Channex PUT /webhooks returned no data");
  return res.data;
}

// ---------------- Slice 2+ stubs (forward-compat) ----------------

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function sendMessage(
  _threadId: string,
  _body: { message: string; attachments?: ChannexAttachment[] },
  _cfg?: MessagingClientConfig,
): Promise<ChannexMessageEntity> {
  throw new Error("sendMessage not implemented in slice 1 — see MESSAGING_DESIGN.md §8 slice 2");
}

export async function closeThread(
  _threadId: string,
  _cfg?: MessagingClientConfig,
): Promise<void> {
  throw new Error("closeThread not implemented in slice 1 — see MESSAGING_DESIGN.md §8 slice 3");
}

// BDC-only — POST /message_threads/:id/no_reply_needed satisfies BDC's
// "respond to all messages" KPI without sending text.
export async function markThreadNoReplyNeeded(
  _threadId: string,
  _cfg?: MessagingClientConfig,
): Promise<void> {
  throw new Error("markThreadNoReplyNeeded not implemented in slice 1 — see MESSAGING_DESIGN.md §8 slice 3");
}
/* eslint-enable @typescript-eslint/no-unused-vars */
