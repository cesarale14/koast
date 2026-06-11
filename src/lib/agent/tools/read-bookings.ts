/**
 * read_bookings — P3.1 read tool. Returns the host's upcoming bookings (checkout
 * today onward) as a `blocks` render payload of booking blocks, so the agent
 * answers "who's checking in this week" / "what's on the calendar" as the app's
 * own booking cards, not a text summary.
 *
 * Non-gated (read-only). The query is scoped to the host's own properties
 * (ownership via properties.user_id) and excludes cancelled bookings. Blocks are
 * id-LEAN (no booking/property ids) — a rendered booking card here is read-only
 * display. When the render flag is off the model still receives this data as the
 * tool_result JSON and answers in prose; the card is the gated enhancement.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { renderPayloadSchema, type RenderPayload } from "@/lib/agent/render/types";
import type { BlockData } from "@/lib/agent/render/blocks";

const ReadBookingsInputSchema = z.object({});
type ReadBookingsInput = z.infer<typeof ReadBookingsInputSchema>;

const DESCRIPTION = `List the host's upcoming bookings (checkout from today onward) — guest, check-in → check-out, platform (airbnb / booking_com / vrbo / direct), guest count, and payout — as booking cards. Use this for "who's checking in", "what's on the calendar this week", "any arrivals today".

Read-only; the data is built server-side from live Koast bookings (you do not pass it in). Pair the cards with a short prose summary leading with the nearest arrival/checkout.`;

/** Host-local today (YYYY-MM-DD) from the primary property timezone (ET default). */
async function hostLocalToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  hostId: string,
): Promise<string> {
  const { data } = await supabase
    .from("properties")
    .select("timezone")
    .eq("user_id", hostId)
    .not("timezone", "is", null)
    .limit(1);
  const tz = (data?.[0]?.timezone as string | undefined) || "America/New_York";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const readBookingsTool: Tool<ReadBookingsInput, RenderPayload> = {
  name: "read_bookings",
  description: DESCRIPTION,
  inputSchema: ReadBookingsInputSchema,
  outputSchema: renderPayloadSchema,
  requiresGate: false,
  handler: async (_input, context) => {
    const supabase = createServiceClient();
    const hostId = context.host.id;
    const today = await hostLocalToday(supabase, hostId);

    // Ownership scope: the host's own properties (id → name).
    const { data: propRows } = await supabase
      .from("properties")
      .select("id, name")
      .eq("user_id", hostId);
    const props = (propRows ?? []) as { id: string; name: string | null }[];
    if (props.length === 0) return { v: 1, kind: "blocks", blocks: [] };
    const nameById = new Map(props.map((p) => [p.id, p.name ?? "Property"]));

    // Upcoming, non-cancelled bookings on those properties, nearest first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookingRows } = await (supabase.from("bookings") as any)
      .select("property_id, platform, guest_name, check_in, check_out, num_guests, total_price, status")
      .in("property_id", Array.from(nameById.keys()))
      .neq("status", "cancelled")
      .gte("check_out", today)
      .order("check_in", { ascending: true })
      .limit(25);

    const blocks: BlockData[] = ((bookingRows ?? []) as Array<{
      property_id: string;
      platform: string;
      guest_name: string | null;
      check_in: string;
      check_out: string;
      num_guests: number | null;
      total_price: string | number | null;
    }>).map((b) => ({
      kind: "booking",
      data: {
        guestName: b.guest_name,
        checkIn: b.check_in,
        checkOut: b.check_out,
        platform: b.platform,
        totalPrice: b.total_price != null ? Number(b.total_price) : null,
        numGuests: b.num_guests ?? null,
        propertyName: nameById.get(b.property_id) ?? null,
      },
    }));

    return { v: 1, kind: "blocks", blocks };
  },
};
