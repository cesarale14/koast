/**
 * read_guest_thread — M7 D44.
 *
 * Reads the existing message thread for a guest booking from the PMS
 * substrate (`message_threads` + `messages`) and surfaces it to the
 * agent alongside booking + channel context. Mirrors M3's read-memory.ts
 * pattern: non-gated, model-facing Zod schemas, ownership-checked at
 * handler time.
 *
 * Channel-aware drafting (M7 D41 + D48): the booking's channel surfaces
 * here so the agent can calibrate `propose_guest_message` tone per OTA
 * convention. The system prompt teaches the per-channel rules; this
 * tool's output is the input to that reasoning.
 *
 * Most-recent thread tiebreaker: when a booking has multiple threads
 * (multi-channel bookings — rare today), v1 returns only the most
 * recently active thread (`order by last_message_received_at desc
 * limit 1`). Carry-forward CF #43 if real use surfaces the need to
 * render all threads.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

// ---------- Input schema ----------

const ReadGuestThreadInputSchema = z.object({
  booking_id: z.string().uuid(),
  /**
   * Cap on returned messages. Defaults to 20 (recent enough to capture
   * the active conversation, small enough to stay context-friendly).
   * The model can re-call with a larger value if the recent slice
   * doesn't carry the full thread it needs.
   */
  max_messages: z.number().int().min(1).max(50).default(20),
});

// ---------- Output schema ----------

const ThreadMessageSchema = z.object({
  sender: z.enum(["guest", "host", "system"]),
  /** ISO-8601; sourced from messages.channex_inserted_at (canonical Channex timestamp). */
  timestamp: z.string(),
  text: z.string(),
  /** Per-message channel label, mirrors booking.channel for v1 (single-thread). */
  channel: z.string(),
});

const BookingContextSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  guest_name: z.string(),
  /** ISO date (YYYY-MM-DD) from bookings.check_in. */
  check_in: z.string(),
  /** ISO date (YYYY-MM-DD) from bookings.check_out. */
  check_out: z.string(),
  /**
   * Canonical channel label (`'airbnb' | 'booking_com' | 'vrbo' |
   * 'direct'` for the cases v1 sees). Sourced from `message_threads.
   * channel_code` when a thread exists; falls back to `bookings.platform`
   * when no thread is on file yet.
   */
  channel: z.string(),
});

const ReadGuestThreadOutputSchema = z.object({
  thread: z.array(ThreadMessageSchema),
  booking: BookingContextSchema,
});

type ReadGuestThreadInput = z.infer<typeof ReadGuestThreadInputSchema>;
type ReadGuestThreadOutput = z.infer<typeof ReadGuestThreadOutputSchema>;

// ---------- Description (model-facing) ----------

const DESCRIPTION = `Retrieve the message thread for a guest booking, plus booking + channel context (check-in/out dates, guest name, OTA).

Call this BEFORE proposing any guest message via propose_guest_message — drafting without thread context risks repeating questions, missing prior commitments the host already made, or misjudging tone. Always read first; even when the thread looks short, the channel + booking dates inform the reply.

Inputs:
  - booking_id (required, UUID): the booking whose thread to fetch.
  - max_messages (optional, default 20, max 50): cap on messages returned, ordered oldest→newest. If the recent slice looks insufficient (you're missing earlier context the guest is referencing), call again with a larger max_messages.

Returns:
  - thread: each message with sender ('guest' | 'host' | 'system'), timestamp, text, channel
  - booking: id, property_id, guest_name, check_in, check_out, and channel — calibrate tone per channel (airbnb conversational; booking_com formal; vrbo family-oriented; direct friendly-professional)

If the booking has no thread on file (a fresh booking before the guest writes in), thread is empty but booking context is still returned — useful for drafting opening messages.`;

// ---------- Channel-code → canonical label ----------

/**
 * Map message_threads.channel_code (the Channex shorthand stored on
 * the thread) to the canonical channel label the agent reasons about.
 * Falls through to the input value if unknown — keeps the surface
 * forward-compatible if Channex adds new codes before the system prompt
 * gets a refresh.
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

/**
 * Map messages.sender ('guest' | 'property' | other) → the canonical
 * agent-facing sender label. 'property' is internal terminology for
 * Koast/host-side; the agent reasons about it as 'host'. Anything
 * else (rare platform/system rows) collapses to 'system'.
 */
function canonicalSender(raw: string | null | undefined): "guest" | "host" | "system" {
  if (raw === "guest") return "guest";
  if (raw === "property") return "host";
  return "system";
}

// ---------- Tool ----------

interface BookingRow {
  id: string;
  property_id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  platform: string | null;
}

interface ThreadRow {
  id: string;
  channel_code: string | null;
}

interface MessageRow {
  sender: string | null;
  content: string;
  channex_inserted_at: string | null;
  created_at: string | null;
}

export const readGuestThreadTool: Tool<ReadGuestThreadInput, ReadGuestThreadOutput> = {
  name: "read_guest_thread",
  description: DESCRIPTION,
  inputSchema: ReadGuestThreadInputSchema,
  outputSchema: ReadGuestThreadOutputSchema,
  requiresGate: false,
  handler: async (input, context) => {
    const supabase = createServiceClient();

    // 1. Resolve booking row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookingsBuilder = supabase.from("bookings") as any;
    const { data: bookingData, error: bookingError } = await bookingsBuilder
      .select("id, property_id, guest_name, check_in, check_out, platform")
      .eq("id", input.booking_id)
      .limit(1);

    const booking = ((bookingData ?? []) as BookingRow[])[0];
    if (bookingError || !booking) {
      throw new Error(
        `[read_guest_thread] Booking ${input.booking_id} not found${
          bookingError ? `: ${bookingError.message}` : ""
        }`,
      );
    }

    // 2. Ownership check (defense-in-depth — service client bypasses
    // RLS, so the explicit check is the gate).
    const owned = await verifyPropertyOwnership(context.host.id, booking.property_id);
    if (!owned) {
      throw new Error(
        `[read_guest_thread] Host ${context.host.id} does not own property ${booking.property_id}`,
      );
    }

    // 3. Most-recent thread for this booking. Multi-channel bookings
    // would have multiple threads; v1 returns the most recently active
    // (CF #43 to render all threads when real use shows the need).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threadsBuilder = supabase.from("message_threads") as any;
    const { data: threadData, error: threadError } = await threadsBuilder
      .select("id, channel_code")
      .eq("booking_id", input.booking_id)
      .order("last_message_received_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (threadError) {
      throw new Error(`[read_guest_thread] Thread lookup failed: ${threadError.message}`);
    }
    const thread = ((threadData ?? []) as ThreadRow[])[0];

    // 4. Resolve booking channel — prefer thread.channel_code, fall
    // back to bookings.platform when no thread exists yet.
    const bookingChannel = canonicalChannel(thread?.channel_code ?? booking.platform);

    if (!thread) {
      return {
        thread: [],
        booking: {
          id: booking.id,
          property_id: booking.property_id,
          guest_name: booking.guest_name ?? "",
          check_in: booking.check_in,
          check_out: booking.check_out,
          channel: bookingChannel,
        },
      };
    }

    // 5. Fetch messages for the thread, oldest → newest.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messagesBuilder = supabase.from("messages") as any;
    const { data: messageData, error: messageError } = await messagesBuilder
      .select("sender, content, channex_inserted_at, created_at")
      .eq("thread_id", thread.id)
      .order("channex_inserted_at", { ascending: true, nullsFirst: true })
      .limit(input.max_messages);

    if (messageError) {
      throw new Error(`[read_guest_thread] Messages lookup failed: ${messageError.message}`);
    }

    const messages = ((messageData ?? []) as MessageRow[]).map((m) => ({
      sender: canonicalSender(m.sender),
      timestamp: m.channex_inserted_at ?? m.created_at ?? "",
      text: m.content,
      channel: bookingChannel,
    }));

    return {
      thread: messages,
      booking: {
        id: booking.id,
        property_id: booking.property_id,
        guest_name: booking.guest_name ?? "",
        check_in: booking.check_in,
        check_out: booking.check_out,
        channel: bookingChannel,
      },
    };
  },
};

// Exported helpers for tests.
export { canonicalChannel, canonicalSender };
