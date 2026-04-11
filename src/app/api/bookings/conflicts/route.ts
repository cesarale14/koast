import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface BookingRow {
  id: string;
  property_id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  total_price: number | null;
  channex_booking_id: string | null;
  platform_booking_id: string | null;
  status: string;
}

interface ConflictPair {
  property_id: string;
  property_name: string;
  booking1: BookingRow;
  booking2: BookingRow;
  overlap_start: string;
  overlap_end: string;
  overlap_nights: number;
}

function overlapRange(a: BookingRow, b: BookingRow): { start: string; end: string; nights: number } | null {
  // Half-open [check_in, check_out) — standard hotel interval semantics.
  // a and b overlap iff a.check_in < b.check_out AND b.check_in < a.check_out.
  if (!(a.check_in < b.check_out && b.check_in < a.check_out)) return null;
  const start = a.check_in > b.check_in ? a.check_in : b.check_in;
  const end = a.check_out < b.check_out ? a.check_out : b.check_out;
  const startMs = Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const endMs = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  const nights = Math.max(0, Math.round((endMs - startMs) / 86400000));
  if (nights === 0) return null;
  return { start, end, nights };
}

/**
 * GET /api/bookings/conflicts
 *
 * Returns every pair of overlapping confirmed bookings per property
 * for the authed user. Used by the dashboard alert banner, the
 * calendar red-tint overlay, and the sidebar Messages badge.
 */
export async function GET() {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = createServiceClient();

    const { data: propsData } = await supabase
      .from("properties")
      .select("id, name")
      .eq("user_id", user.id);
    const properties = (propsData ?? []) as { id: string; name: string }[];
    if (properties.length === 0) {
      return NextResponse.json({ conflicts: [], count: 0, affected_properties: 0 });
    }

    const nameById = new Map(properties.map((p) => [p.id, p.name]));
    const propertyIds = properties.map((p) => p.id);

    const { data: bookingsData } = await supabase
      .from("bookings")
      .select("id, property_id, guest_name, check_in, check_out, platform, total_price, channex_booking_id, platform_booking_id, status")
      .in("property_id", propertyIds)
      .eq("status", "confirmed");
    const bookings = (bookingsData ?? []) as BookingRow[];

    // Group by property
    const byProperty = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const arr = byProperty.get(b.property_id) ?? [];
      arr.push(b);
      byProperty.set(b.property_id, arr);
    }

    const conflicts: ConflictPair[] = [];
    const affected = new Set<string>();
    for (const [propId, list] of Array.from(byProperty.entries())) {
      // O(n^2) — fine for typical per-property booking counts. Sort by
      // check_in so pairs are always reported in chronological order.
      const sorted = [...list].sort((a, b) =>
        a.check_in === b.check_in ? a.check_out.localeCompare(b.check_out) : a.check_in.localeCompare(b.check_in)
      );
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          // Once the later booking starts after the earlier one ends, we're
          // done with this i.
          if (sorted[j].check_in >= sorted[i].check_out) continue;
          const overlap = overlapRange(sorted[i], sorted[j]);
          if (!overlap) continue;
          conflicts.push({
            property_id: propId,
            property_name: nameById.get(propId) ?? "Property",
            booking1: sorted[i],
            booking2: sorted[j],
            overlap_start: overlap.start,
            overlap_end: overlap.end,
            overlap_nights: overlap.nights,
          });
          affected.add(propId);
        }
      }
    }

    return NextResponse.json({
      conflicts,
      count: conflicts.length,
      affected_properties: affected.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "conflicts lookup failed";
    console.error("[bookings/conflicts]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
