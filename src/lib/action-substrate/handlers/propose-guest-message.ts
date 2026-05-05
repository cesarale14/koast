/**
 * Post-approval handler for propose_guest_message (M7 D42).
 *
 * Runs when the host clicks Approve on a GuestMessageProposal artifact.
 * The /api/agent/artifact endpoint resolves the artifact row by
 * audit_id (paired FK on agent_artifacts.audit_log_id), validates host
 * ownership, then dispatches here with the artifact's payload + the
 * artifact's commit_metadata so retries are idempotent.
 *
 * The handler:
 *   1. Idempotency guard — if commit_metadata.channex_message_id is
 *      already set, returns the prior result without re-calling Channex.
 *      Protects Try-again clicks after a transient route-side failure
 *      that succeeded at Channex.
 *   2. Resolves booking → property; verifies host ownership.
 *   3. Resolves the most-recent message_threads row for the booking.
 *   4. Reads text = payload.edited_text ?? payload.message_text.
 *   5. Calls Channex sendMessage. ChannexSendError propagates to the
 *      caller; the route turns it into the §6-amendment failure
 *      encoding (artifact stays state='emitted', audit outcome flips
 *      to 'failed', commit_metadata.last_error carries the detail,
 *      Try-again re-runs the handler).
 *   6. Upserts the messages row mirroring /api/messages/threads/[id]/
 *      send/route.ts:91-114 — host_send_* fields populated, actor_kind
 *      ='agent' + actor_id=null per the M1 voice-extraction-exclusion
 *      convention (CLAUDE.md "Pre-activation gate for
 *      messaging_executor").
 *   7. Refreshes message_threads aggregates so the inbox reflects the
 *      new last-message preview / timestamp.
 *
 * Distinct from src/lib/agent/tools/propose-guest-message.ts (the tool
 * definition that runs at proposal time via the dispatcher fork). The
 * tool's `handler` is intentionally a guard that throws — D35
 * separates proposal from execution at the dispatcher boundary, and
 * post-approval execution lives here.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { verifyPropertyOwnership } from "@/lib/auth/api-auth";
import {
  sendMessage as channexSendMessage,
  sendMessageOnBooking as channexSendMessageOnBooking,
  channelCodeFromProvider,
  type ChannexMessageEntity,
} from "@/lib/channex/messages";
import { ColdSendUnsupportedError } from "./errors";

/**
 * Map message_threads.channel_code (Channex shorthand) to the canonical
 * label the chat shell renders ('airbnb' | 'booking_com' | 'vrbo' |
 * 'direct'). Mirrors src/lib/agent/tools/read-guest-thread.ts —
 * duplicated here to avoid a cross-package import (handlers shouldn't
 * depend on tool definitions).
 */
function canonicalChannel(input: string | null | undefined): string {
  if (!input) return "direct";
  const v = input.toLowerCase();
  if (v === "abb" || v === "airbnb") return "airbnb";
  if (v === "bdc" || v === "booking" || v === "booking_com" || v === "booking.com") return "booking_com";
  if (v === "vrbo" || v === "hma") return "vrbo";
  if (v === "direct" || v === "koast") return "direct";
  return v;
}

export interface ProposeGuestMessageHandlerInput {
  host_id: string;
  conversation_id: string;
  turn_id: string;
  artifact_id: string;
  payload: {
    booking_id: string;
    message_text: string;
    /** Optional host edit applied via /api/agent/artifact action='edit'. */
    edited_text?: string;
  };
  /**
   * Existing artifact.commit_metadata, if any. Carried in so a Try-again
   * after a partially-failed prior attempt (e.g. Channex 200 then DB
   * upsert hiccup) doesn't re-send the same message to the OTA. The
   * route is responsible for passing this in; the handler trusts it.
   */
  commit_metadata?: {
    channex_message_id?: string;
    message_id?: string;
    /** Canonical channel label written at confirm time (M7 channel-display fix). */
    channel?: string;
    last_error?: { message: string; channex_status?: number };
  };
}

export interface ProposeGuestMessageHandlerResult {
  channex_message_id: string;
  message_id: string;
  /**
   * Canonical channel label (airbnb / booking_com / vrbo / direct) the
   * caller writes into commit_metadata so the chat shell can render
   * the 'sent' visual with the correct channel pill without doing a
   * second join on message_threads. Source: thread.channel_code →
   * canonicalChannel.
   */
  channel: string;
}

interface BookingRow {
  id: string;
  property_id: string;
  channex_booking_id: string | null;
  platform: string | null;
}

interface ThreadRow {
  id: string;
  channex_thread_id: string;
  channel_code: string | null;
  property_id: string;
}

export async function proposeGuestMessageHandler(
  input: ProposeGuestMessageHandlerInput,
): Promise<ProposeGuestMessageHandlerResult> {
  // 1. Idempotency — if a prior attempt already round-tripped through
  // Channex successfully, return the recorded ids. The route's failure
  // encoding leaves commit_metadata.channex_message_id UNSET when the
  // Channex call itself failed, so this guard only fires after the
  // narrow window where Channex accepted but the route's local-side
  // bookkeeping hiccupped.
  if (
    input.commit_metadata?.channex_message_id &&
    input.commit_metadata?.message_id
  ) {
    return {
      channex_message_id: input.commit_metadata.channex_message_id,
      message_id: input.commit_metadata.message_id,
      channel:
        (input.commit_metadata as { channel?: string } | undefined)?.channel ?? "direct",
    };
  }

  const supabase = createServiceClient();

  // 2. Resolve booking → property + ownership check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookingsBuilder = supabase.from("bookings") as any;
  const { data: bookingRows, error: bookingError } = await bookingsBuilder
    .select("id, property_id, channex_booking_id, platform")
    .eq("id", input.payload.booking_id)
    .limit(1);
  const booking = ((bookingRows ?? []) as BookingRow[])[0];
  if (bookingError || !booking) {
    throw new Error(
      `[handler:propose_guest_message] Booking ${input.payload.booking_id} not found${
        bookingError ? `: ${bookingError.message}` : ""
      }`,
    );
  }
  const owned = await verifyPropertyOwnership(input.host_id, booking.property_id);
  if (!owned) {
    throw new Error(
      `[handler:propose_guest_message] Host ${input.host_id} does not own property ${booking.property_id}`,
    );
  }

  // 3. Resolve the most-recent thread for the booking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threadsBuilder = supabase.from("message_threads") as any;
  const { data: threadRows, error: threadError } = await threadsBuilder
    .select("id, channex_thread_id, channel_code, property_id")
    .eq("booking_id", input.payload.booking_id)
    .order("last_message_received_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (threadError) {
    throw new Error(
      `[handler:propose_guest_message] Thread lookup failed for booking ${input.payload.booking_id}: ${threadError.message}`,
    );
  }
  let thread = ((threadRows ?? []) as ThreadRow[])[0] as ThreadRow | undefined;

  // 4. Resolve text — host edit takes precedence over the agent's draft.
  const text = input.payload.edited_text ?? input.payload.message_text;

  // 5. Channex send.
  //
  // Two paths:
  //   (a) Existing thread → POST /message_threads/:id/messages
  //   (b) Cold-send (no local thread row) → POST /bookings/:id/messages.
  //       Channex maintains a thread shell from booking-creation
  //       time; this endpoint attaches the message to that shell and
  //       returns relationships.message_thread.data.id so we can
  //       materialize the local message_threads row in the same
  //       round-trip. Probe-confirmed 2026-05-05 against the live
  //       Channex production endpoint.
  //
  // Either way ChannexSendError propagates to the caller; the route
  // turns it into the §6-amendment failure encoding.
  let channexMsg: ChannexMessageEntity;
  if (thread) {
    channexMsg = await channexSendMessage(thread.channex_thread_id, text);
  } else {
    // Cold-send path. Three pre-flight gates before calling Channex:
    //
    //   (G1) Booking has channex_booking_id — pure iCal bookings
    //        (no channex_booking_id at all) can't be messaged.
    //   (G2) property_channels row exists for (property, platform).
    //   (G3) channex_channel_id is a real UUID (not the 'ical-import'
    //        sentinel marking iCal-only properties).
    //   (G4) Platform is BDC. ABB cold-send requires channel_id in
    //        the Channex POST body, which Channex's
    //        POST /bookings/:id/messages docs (status-D) don't yet
    //        spell out the body shape for. Probed 2026-05-05: BDC
    //        works without explicit channel_id (Channex auto-resolves
    //        from the booking's channel relationship); ABB returns
    //        422 {channel_id: "can't be blank"}. CF #45 tracks the
    //        channel_id-in-body work for ABB cold-send.
    //
    // Each gate throws a host-actionable error so the §6 amendment
    // failure encoding surfaces meaningful copy on the failed-state
    // GuestMessageProposal card (instead of Channex's raw "channel_id
    // can't be blank" which doesn't help a host).
    if (!booking.channex_booking_id) {
      throw new ColdSendUnsupportedError(
        `Booking ${booking.id} cannot be messaged via Channex (no channex_booking_id; likely iCal-sourced). Channex only routes messages for bookings synced through the channel manager.`,
        "no-channex-booking",
      );
    }

    // Property name + channel lookup for human-readable error copy.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyBuilder = supabase.from("properties") as any;
    const { data: propertyRows } = await propertyBuilder
      .select("name")
      .eq("id", booking.property_id)
      .limit(1);
    const propertyName =
      ((propertyRows ?? []) as Array<{ name: string }>)[0]?.name ?? "this property";

    const platformLabel =
      booking.platform === "airbnb"
        ? "Airbnb"
        : booking.platform === "booking_com"
          ? "Booking.com"
          : booking.platform === "vrbo"
            ? "Vrbo"
            : (booking.platform ?? "unknown");
    // property_channels.channel_code uses uppercase ABB/BDC/VRBO.
    const upperChannelCode =
      booking.platform === "airbnb"
        ? "ABB"
        : booking.platform === "booking_com"
          ? "BDC"
          : booking.platform === "vrbo"
            ? "VRBO"
            : null;

    if (!upperChannelCode) {
      throw new Error(
        `[handler:propose_guest_message] Unknown booking platform '${booking.platform}'; cannot resolve property_channels mapping.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelsBuilder = supabase.from("property_channels") as any;
    const { data: channelRows } = await channelsBuilder
      .select("channex_channel_id, channel_code, status")
      .eq("property_id", booking.property_id)
      .eq("channel_code", upperChannelCode)
      .limit(1);
    const propertyChannel = ((channelRows ?? []) as Array<{
      channex_channel_id: string;
      channel_code: string;
      status: string | null;
    }>)[0];

    // Gate G2 — no row.
    if (!propertyChannel) {
      throw new ColdSendUnsupportedError(
        `${propertyName} is not yet configured for messaging on ${platformLabel}. Add the channel via Channex to enable Koast messaging.`,
        "no-property-channel",
      );
    }

    // Gate G3 — sentinel for iCal-import properties (channex_channel_id
    // starts with 'ical-' rather than being a real UUID). This is the
    // explicit category-exclusion case Cesar named: "iCal bookings are
    // a category exclusion, not a gap" — the iCal feed doesn't expose
    // outbound messaging.
    if (propertyChannel.channex_channel_id.startsWith("ical-")) {
      throw new ColdSendUnsupportedError(
        `${propertyName} is connected via iCal only on ${platformLabel}. Messaging requires channel-managed integration through Channex (the iCal calendar feed doesn't support outbound messages). The first message must be sent through ${platformLabel}'s native interface.`,
        "ical-import",
      );
    }

    // Gate G4 — ABB cold-send temporary constraint (CF #45). BDC cold-
    // send is probe-validated end-to-end (Gretter Rodriguez probe
    // 2026-05-05); ABB cold-send requires channel_id in the body,
    // which lands in CF #45. recoverable: true once CF #45 ships.
    if (upperChannelCode === "ABB") {
      throw new ColdSendUnsupportedError(
        `Cold-send to ${propertyName} via ${platformLabel} is not yet supported in Koast (CF #45 — Channex POST /bookings/:id/messages requires channel_id in the body for Airbnb, integration tracked for a follow-up). Send the first message via ${platformLabel} directly; subsequent messages will work through Koast.`,
        "abb-cold-send-cf45",
      );
    }

    channexMsg = await channexSendMessageOnBooking(booking.channex_booking_id, text);

    // Materialize the local message_threads row from the response.
    // relationships.message_thread.data.id is the canonical Channex
    // thread id (probe-confirmed). On conflict (webhook race fired
    // first), DO NOTHING — webhook is canonical for thread state;
    // our INSERT only wins when the row genuinely doesn't exist.
    const newChannexThreadId = channexMsg.relationships?.message_thread?.data?.id;
    if (!newChannexThreadId) {
      throw new Error(
        `[handler:propose_guest_message] Channex POST /bookings/:id/messages returned no relationships.message_thread.data.id; cannot materialize local thread row.`,
      );
    }

    const channelCode = channelCodeFromProvider(booking.platform);
    const providerRaw = booking.platform ?? "unknown";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threadInsertBuilder = supabase.from("message_threads") as any;
    const { error: threadInsertError } = await threadInsertBuilder.upsert(
      {
        property_id: booking.property_id,
        booking_id: booking.id,
        channex_thread_id: newChannexThreadId,
        channel_code: channelCode,
        provider_raw: providerRaw,
        last_message_received_at: channexMsg.attributes.inserted_at,
        last_message_preview: (channexMsg.attributes.message ?? "").slice(0, 200),
        message_count: 1,
        unread_count: 0,
      },
      { onConflict: "channex_thread_id", ignoreDuplicates: true },
    );

    if (threadInsertError) {
      // Non-fatal at the substrate boundary: Channex already accepted
      // the message; even if the local thread INSERT failed, the
      // webhook will reconcile. But we MUST resolve the local thread
      // row id before the messages upsert (FK on thread_id), so
      // re-throw if the SELECT below also fails.
      console.warn(
        `[handler:propose_guest_message] message_threads upsert failed after Channex 200 (channex_thread_id=${newChannexThreadId}): ${threadInsertError.message}; will re-select.`,
      );
    }

    // SELECT the row by channex_thread_id — covers both the case
    // where our INSERT succeeded AND the race where the webhook
    // beat us. Webhook is canonical for thread state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threadSelectBuilder = supabase.from("message_threads") as any;
    const { data: threadResolveRows, error: threadResolveError } = await threadSelectBuilder
      .select("id, channex_thread_id, channel_code, property_id")
      .eq("channex_thread_id", newChannexThreadId)
      .limit(1);
    const resolvedThread = ((threadResolveRows ?? []) as ThreadRow[])[0];
    if (threadResolveError || !resolvedThread) {
      throw new Error(
        `[handler:propose_guest_message] Could not resolve local message_threads row after cold-send (channex_thread_id=${newChannexThreadId}): ${
          threadResolveError?.message ?? "no row"
        }`,
      );
    }
    thread = resolvedThread;
  }

  // 6. Persist the message row. Mirrors the send route's upsert shape
  // (channex_message_id ON CONFLICT). actor_kind='agent' is the M1
  // voice-extraction-exclusion flag — agent-drafted messages must NEVER
  // feed back into voice-extraction reads, even after host approval.
  const platform =
    thread.channel_code === "abb"
      ? "airbnb"
      : thread.channel_code === "bdc"
        ? "booking_com"
        : (thread.channel_code ?? "unknown");

  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messagesBuilder = supabase.from("messages") as any;
  const { data: inserted, error: insertError } = await messagesBuilder
    .upsert(
      {
        channex_message_id: channexMsg.id,
        thread_id: thread.id,
        property_id: thread.property_id,
        platform,
        direction: "outbound",
        sender: channexMsg.attributes.sender ?? "property",
        sender_name: "Host",
        content: channexMsg.attributes.message,
        attachments: channexMsg.attributes.attachments ?? [],
        channex_meta: channexMsg.attributes.meta ?? null,
        channex_inserted_at: channexMsg.attributes.inserted_at,
        channex_updated_at: channexMsg.attributes.updated_at,
        host_send_submitted_at: nowIso,
        host_send_channex_acked_at: nowIso,
        sent_at: channexMsg.attributes.inserted_at,
        draft_status: "sent",
        actor_kind: "agent",
        actor_id: null,
      },
      { onConflict: "channex_message_id" },
    )
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Channex accepted but local DB upsert failed. This is the narrow
    // partial-success window the idempotency guard at step 1 protects
    // future Try-agains from. Surface as an error so the route encodes
    // failure (commit_metadata.last_error) AND records what Channex
    // already received — Try-again reads commit_metadata.channex_
    // message_id (set below) and short-circuits the re-send.
    throw new Error(
      `[handler:propose_guest_message] DB upsert failed after Channex 200 (channex_message_id=${channexMsg.id}): ${
        insertError?.message ?? "no inserted row"
      }`,
    );
  }

  // 7. Refresh thread aggregates so the inbox surfaces the new send.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("message_threads") as any)
    .update({
      last_message_received_at: channexMsg.attributes.inserted_at,
      last_message_preview: (channexMsg.attributes.message ?? "").slice(0, 200),
      updated_at: nowIso,
    })
    .eq("id", thread.id);

  return {
    channex_message_id: channexMsg.id,
    message_id: inserted.id,
    channel: canonicalChannel(thread.channel_code),
  };
}
