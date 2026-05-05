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

export interface LastMessageObject {
  message?: string | null;
  sender?: string | null;
  inserted_at?: string | null;
  attachments?: unknown[] | null;
}

export interface MessageThreadAttrs {
  title: string | null;
  // Channex returns this as an OBJECT (not a string) — keys mirror
  // the per-message entity. Probe-confirmed 2026-04-26 across both
  // AirBNB + BookingCom threads. Always extract `.message` for the
  // text preview before persisting.
  last_message: LastMessageObject | string | null;
  last_message_received_at: string;
  inserted_at: string;
  updated_at: string;
  is_closed: boolean;
  message_count: number;
  provider: string;                                 // 'AirBNB' | 'BookingCom' | …
  ota_message_thread_id: string | null;
  meta?: Record<string, unknown> | null;
}

// Normalize Channex's last_message (object or legacy string) to the
// plain text preview Koast persists in message_threads.last_message_preview.
export function lastMessagePreview(lm: LastMessageObject | string | null | undefined): string | null {
  if (!lm) return null;
  if (typeof lm === "string") return lm;
  return lm.message ?? null;
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

/**
 * MSG-S2 — Channex error type that surfaces both HTTP status and the
 * raw Channex error envelope. The send route surfaces these to the
 * UI verbatim so hosts see why a send failed (e.g. "thread closed",
 * "content rejected by Airbnb").
 */
export class ChannexSendError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ChannexSendError";
    this.status = status;
    this.body = body;
  }
}

async function channexPost<T = unknown>(path: string, body: unknown, cfg?: MessagingClientConfig): Promise<T> {
  const { apiKey, baseUrl } = resolveConfig(cfg);
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "POST",
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
    throw new ChannexSendError(
      `Channex POST ${path} ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      parsed ?? text,
    );
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

// ---------------- Send (slice 2) ----------------

/**
 * POST /message_threads/:id/messages
 *
 * Body shape mirrors the reviews POST pattern (`{review: {…}}` for
 * /reviews/:id/reply, /reviews/:id/guest_review). For messages the
 * wrapper is `{message: {message: <text>}}`. Channex's docs are
 * `D` (documented but unprobed) for this endpoint per
 * channex-expert/endpoint-reference.md:247; the shape was confirmed
 * against the live Channex production at MSG-S2 commit time.
 *
 * Errors surface via ChannexSendError, which carries the parsed
 * Channex body so the route can pass meaningful failure text to
 * the UI (e.g. BDC "thread closed", Airbnb content-filter rejection).
 *
 * No idempotency-key header is supported by Channex on this endpoint
 * (per skill silence + probe). The route layer protects against
 * client double-submit via in-flight dedup.
 */
export async function sendMessage(
  threadId: string,
  body: string,
  cfg?: MessagingClientConfig,
): Promise<ChannexMessageEntity> {
  const res = await channexPost<{ data?: ChannexMessageEntity }>(
    `/message_threads/${threadId}/messages`,
    { message: { message: body } },
    cfg,
  );
  if (!res.data) {
    throw new ChannexSendError("Channex POST /messages returned no data", 200, res);
  }
  return res.data;
}

/**
 * POST /bookings/:channex_booking_id/messages
 *
 * Cold-send: send a message to a booking that doesn't have a local
 * message_threads row yet. Channex maintains a thread shell from
 * booking-creation time even for messageless bookings; this endpoint
 * attaches the new message to that latent shell. The response carries
 * BOTH the new message id AND the thread id under
 * relationships.message_thread.data.id, so the caller can materialize
 * the local message_threads row in one round-trip without a separate
 * /message_threads fetch.
 *
 * Probed 2026-05-05 against Villa Jamaica BDC booking
 * 2fa9468f-8448-408a-a87c-8eec85320ea0; HTTP 200 in ~1.7s, response
 * shape symmetric to POST /message_threads/:id/messages plus the
 * relationships.message_thread enrichment. M7 cold-send path.
 *
 * Same wrapper-singular pattern as the thread-keyed sibling. Same
 * gating (channex_messages app required → 403 without; 422 for OTAs
 * that don't expose messaging through the channel manager). Same
 * ChannexSendError on failure carrying status + parsed body.
 */
export async function sendMessageOnBooking(
  channexBookingId: string,
  body: string,
  cfg?: MessagingClientConfig,
): Promise<ChannexMessageEntity> {
  const res = await channexPost<{ data?: ChannexMessageEntity }>(
    `/bookings/${channexBookingId}/messages`,
    { message: { message: body } },
    cfg,
  );
  if (!res.data) {
    throw new ChannexSendError(
      "Channex POST /bookings/:id/messages returned no data",
      200,
      res,
    );
  }
  return res.data;
}

/**
 * Channex does not document a thread-level mark-read endpoint, and
 * messages don't have a server-side read state in the entity probe
 * (no `is_read` / `read_at` field). Read state is Koast-side
 * bookkeeping only.
 *
 * This stub is here to keep the API surface complete for slice 3+
 * (in case Channex adds the endpoint, or for per-message PATCH if
 * we ever want cross-device sync). For slice 2 the route updates
 * the local DB and skips Channex entirely. See PHASE B.2 in the
 * MSG-S2 brief.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function markThreadRead(
  _threadId: string,
  _cfg?: MessagingClientConfig,
): Promise<{ ok: true; channex_called: false }> {
  // No-op — Channex doesn't expose mark-read on /message_threads.
  // Documented as a follow-up question in MSG-S2 commit body.
  return { ok: true, channex_called: false };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// ---------------- Slice 3+ stubs (forward-compat) ----------------

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function closeThread(
  _threadId: string,
  _cfg?: MessagingClientConfig,
): Promise<void> {
  throw new Error("closeThread not implemented in slice 2 — see MESSAGING_DESIGN.md §8 slice 3");
}

// BDC-only — POST /message_threads/:id/no_reply_needed satisfies BDC's
// "respond to all messages" KPI without sending text.
export async function markThreadNoReplyNeeded(
  _threadId: string,
  _cfg?: MessagingClientConfig,
): Promise<void> {
  throw new Error("markThreadNoReplyNeeded not implemented in slice 2 — see MESSAGING_DESIGN.md §8 slice 3");
}
/* eslint-enable @typescript-eslint/no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */
