import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import PropertyDetail from "@/components/dashboard/PropertyDetail";

export default async function PropertyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const endDate730 = new Date();
  endDate730.setDate(endDate730.getDate() + 730);
  const end60 = endDate730.toISOString().split("T")[0]; // 24 months for calendar
  // PD-B1: backward window for stats. Replaces the prior "last 200 by
  // check_in DESC" sample with an explicit 6-month look-back. For our
  // current fleet (≤2 properties, ~50 active bookings) the populations
  // are identical; for a future power-host the windowed view is
  // arguably more correct than a row-count cap anyway.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const windowStart = sixMonthsAgo.toISOString().split("T")[0];

  // Fetch property
  const propRes = await supabase
    .from("properties")
    .select(
      "id, name, address, city, state, zip, bedrooms, bathrooms, max_guests, property_type, channex_property_id, cover_photo_url"
    )
    .eq("id", params.id)
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propData = (propRes.data ?? []) as any[];
  if (propData.length === 0) notFound();
  const property = propData[0];

  // Fetch related data — check both legacy listings table AND property_channels
  const svc = createServiceClient();
  const [listingsRes, channelsRes] = await Promise.all([
    supabase.from("listings").select("id, platform, platform_listing_id, listing_url, status").eq("property_id", params.id),
    svc.from("property_channels").select("id, channel_code, channel_name, status, settings").eq("property_id", params.id),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listings = (listingsRes.data ?? []) as any[];
  // If no legacy listings, build from property_channels
  if (listings.length === 0) {
    const channelToPlatform: Record<string, string> = { ABB: "airbnb", BDC: "booking_com", VRBO: "vrbo" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listings = ((channelsRes.data ?? []) as any[]).map((ch) => ({
      id: ch.id,
      platform: channelToPlatform[ch.channel_code] ?? ch.channel_code,
      platform_listing_id: null,
      listing_url: null,
      status: ch.status === "active" ? "active" : ch.status,
    }));
  }

  // PD-B1: single bookings query covering [-6mo, +24mo]. Replaces the prior
  // pair of queries (`last 200 by check_in DESC` for stats + `next 24 months
  // active` for the Calendar tab). The Calendar slice is derived in JS below.
  const bookingsRes = await supabase
    .from("bookings")
    .select("id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, platform, total_price, num_guests, status, notes")
    .eq("property_id", params.id)
    .lte("check_in", end60)
    .gte("check_out", windowStart)
    .order("check_in", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBookings = (bookingsRes.data ?? []) as any[];

  // Month bookings for stats
  const monthBookings = allBookings.filter(
    (b: { check_in: string; check_out: string; status: string }) =>
      b.status !== "cancelled" && b.check_in <= monthEnd && b.check_out >= monthStart
  );

  let bookedNights = 0;
  for (const b of monthBookings) {
    const ci = new Date(b.check_in);
    const co = new Date(b.check_out);
    const ms = Math.max(ci.getTime(), new Date(monthStart).getTime());
    const me = Math.min(co.getTime(), new Date(monthEnd).getTime() + 86400000);
    bookedNights += Math.max(0, Math.ceil((me - ms) / 86400000));
  }
  const occupancy = daysInMonth > 0 ? Math.round((bookedNights / daysInMonth) * 100) : 0;

  const revenue = monthBookings.reduce(
    (s: number, b: { total_price: number | null }) => s + (b.total_price ?? 0),
    0
  );
  const totalBookingsCount = allBookings.filter((b: { status: string }) => b.status !== "cancelled").length;

  // PD-B1: single calendar_rates query covering [monthStart, end60].
  // Replaces the prior pair (`current month base rates` for ADR + `next 24
  // months base` for the Calendar tab). Both downstream consumers derive
  // their slice in JS.
  const ratesRes = await supabase
    .from("calendar_rates")
    .select("property_id, date, base_rate, suggested_rate, applied_rate, min_stay, is_available, rate_source")
    .eq("property_id", params.id)
    .is("channel_code", null)
    .gte("date", monthStart)
    .lte("date", end60);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRates = (ratesRes.data ?? []) as any[];
  const monthRates = allRates.filter(
    (r: { date: string; applied_rate: number | null }) =>
      r.date >= monthStart && r.date <= monthEnd && r.applied_rate != null
  );
  const adr =
    monthRates.length > 0
      ? Math.round(
          monthRates.reduce(
            (s: number, r: { applied_rate: number | null }) => s + (r.applied_rate ?? 0),
            0
          ) / monthRates.length
        )
      : 0;

  // Rating (avg of guest_reviews.rating). PD-B1: capped at the most
  // recent 1000 reviews so the payload stays bounded for power-hosts.
  // For our current fleet the cap is well above the actual review count.
  const ratingRes = await supabase
    .from("guest_reviews")
    .select("rating")
    .eq("property_id", params.id)
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  const ratingRows = (ratingRes.data ?? []) as { rating: number | string | null }[];
  let rating = 0;
  if (ratingRows.length > 0) {
    const vals = ratingRows.map((r) => Number(r.rating)).filter((v) => Number.isFinite(v) && v > 0);
    if (vals.length > 0) {
      rating = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    }
  }

  // Average length of stay (all-time, from non-cancelled bookings)
  let avgLOS = 0;
  {
    const sample = allBookings.filter((b: { status: string }) => b.status !== "cancelled");
    if (sample.length > 0) {
      const total = sample.reduce((s: number, b: { check_in: string; check_out: string }) => {
        const nights = Math.round(
          (Date.UTC(+b.check_out.slice(0, 4), +b.check_out.slice(5, 7) - 1, +b.check_out.slice(8, 10)) -
            Date.UTC(+b.check_in.slice(0, 4), +b.check_in.slice(5, 7) - 1, +b.check_in.slice(8, 10))) /
            86400000
        );
        return s + Math.max(1, nights);
      }, 0);
      avgLOS = Math.round((total / sample.length) * 10) / 10;
    }
  }

  // Cleaning task today → drives the "Turnover today" banner
  const cleaningRes = await svc
    .from("cleaning_tasks")
    .select("id, status, cleaner_id")
    .eq("property_id", params.id)
    .eq("scheduled_date", today)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaningRow = ((cleaningRes.data ?? []) as any[])[0] ?? null;
  let cleaningToday: { status: string; cleaner: string | null } | null = null;
  if (cleaningRow) {
    let cleanerName: string | null = null;
    if (cleaningRow.cleaner_id) {
      const { data: cn } = await svc
        .from("cleaners")
        .select("name")
        .eq("id", cleaningRow.cleaner_id)
        .limit(1);
      cleanerName = ((cn ?? []) as { name: string }[])[0]?.name ?? null;
    }
    cleaningToday = { status: cleaningRow.status, cleaner: cleanerName };
  }

  // Per-channel revenue breakdown (all time, confirmed/completed only)
  const channelRevenue: Record<string, number> = {};
  for (const b of allBookings) {
    if (b.status === "cancelled") continue;
    const key = (b.platform as string | null) ?? "unknown";
    channelRevenue[key] = (channelRevenue[key] ?? 0) + (b.total_price ?? 0);
  }

  // Pricing recommendations are now fetched client-side by the
  // polish-pass PricingTab via usePricingTab (PR D). No server prefetch.

  // PD-B1: derive Calendar slices from the wider single queries.
  const ACTIVE_STATUSES = new Set(["confirmed", "completed", "pending"]);
  const calendarBookings = allBookings.filter(
    (b: { check_in: string; check_out: string; status: string }) =>
      b.check_in <= end60 && b.check_out >= today && ACTIVE_STATUSES.has(b.status)
  );
  const calendarRates = allRates.filter(
    (r: { date: string }) => r.date >= today && r.date <= end60
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels = ((channelsRes.data ?? []) as any[]).map((ch) => ({
    channel_code: ch.channel_code as string,
    status: ch.status as string,
    settings: (ch.settings ?? {}) as Record<string, unknown>,
  }));

  return (
    <PropertyDetail
      property={property}
      listings={listings}
      allBookings={allBookings}
      stats={{ occupancy, revenue, adr, totalBookings: totalBookingsCount, rating, avgLOS }}
      channelRevenue={channelRevenue}
      cleaningToday={cleaningToday}
      calendarBookings={calendarBookings as never[]}
      calendarRates={calendarRates as never[]}
      channels={channels}
    />
  );
}
