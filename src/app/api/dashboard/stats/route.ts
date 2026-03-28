import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

type TimeRange = "this_week" | "this_month" | "next_30" | "next_90" | "this_year";

function getDateRange(range: TimeRange): { start: string; end: string; totalDays: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case "this_week": {
      // Start on Monday of the current week
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(monday.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { start: fmt(monday), end: fmt(sunday), totalDays: 7 };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const totalDays = end.getDate();
      return { start: fmt(start), end: fmt(end), totalDays };
    }
    case "next_30": {
      const end = new Date(today);
      end.setDate(end.getDate() + 29);
      return { start: fmt(today), end: fmt(end), totalDays: 30 };
    }
    case "next_90": {
      const end = new Date(today);
      end.setDate(end.getDate() + 89);
      return { start: fmt(today), end: fmt(end), totalDays: 90 };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
      return { start: fmt(start), end: fmt(end), totalDays };
    }
  }
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getRevenueMonths(range: TimeRange): { offset: number; count: number } {
  switch (range) {
    case "this_year":
      return { offset: 0, count: 12 };
    case "next_90":
      return { offset: 0, count: 3 };
    default:
      return { offset: -5, count: 6 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const range: TimeRange = body.range || "next_30";
    const { start, end, totalDays } = getDateRange(range);
    const today = fmt(new Date());

    const supabase = createServiceClient();

    // Fetch properties — scoped to authenticated user
    const { data: properties } = await supabase.from("properties").select("id, name").eq("user_id", user.id);
    const props = (properties ?? []) as { id: string; name: string }[];

    if (props.length === 0) {
      return NextResponse.json({ empty: true });
    }

    const propIds = props.map((p) => p.id);

    // Fetch bookings that overlap with the date range — scoped to user's properties
    const { data: rangeBookings } = await supabase
      .from("bookings")
      .select("id, property_id, guest_name, platform, check_in, check_out, total_price, status")
      .in("property_id", propIds)
      .lt("check_in", addDay(end))
      .gt("check_out", start)
      .in("status", ["confirmed", "completed"]);
    const bookings = (rangeBookings ?? []) as {
      id: string; property_id: string; guest_name: string | null;
      platform: string; check_in: string; check_out: string;
      total_price: number | null; status: string;
    }[];

    // === REVENUE ===
    // Sum total_price for all overlapping bookings, prorated by nights in range
    let revenue = 0;
    for (const b of bookings) {
      if (!b.total_price || b.total_price <= 0) continue;
      const totalNights = Math.max(1, Math.round(
        (new Date(b.check_out + "T00:00:00Z").getTime() - new Date(b.check_in + "T00:00:00Z").getTime()) / 86400000
      ));
      const overlapStart = Math.max(new Date(b.check_in + "T00:00:00Z").getTime(), new Date(start + "T00:00:00Z").getTime());
      const overlapEnd = Math.min(new Date(b.check_out + "T00:00:00Z").getTime(), new Date(addDay(end) + "T00:00:00Z").getTime());
      const overlapNights = Math.max(0, Math.round((overlapEnd - overlapStart) / 86400000));
      revenue += (b.total_price * overlapNights) / totalNights;
    }
    revenue = Math.round(revenue * 100) / 100;

    // === OCCUPANCY (per-property, only properties with bookings) ===
    const propBookings = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const arr = propBookings.get(b.property_id) ?? [];
      arr.push(b);
      propBookings.set(b.property_id, arr);
    }

    let totalOccupancy = 0;
    let propertiesWithBookings = 0;
    let totalBookedNights = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debugPerProperty: any[] = [];

    propBookings.forEach((pBookings, propertyId) => {
      // Count unique booked nights for this property in the range
      const bookedDates = new Set<string>();
      for (const b of pBookings) {
        const ci = new Date(Math.max(new Date(b.check_in + "T00:00:00Z").getTime(), new Date(start + "T00:00:00Z").getTime()));
        const co = new Date(Math.min(new Date(b.check_out + "T00:00:00Z").getTime(), new Date(addDay(end) + "T00:00:00Z").getTime()));
        for (let d = new Date(ci); d < co; d.setUTCDate(d.getUTCDate() + 1)) {
          bookedDates.add(d.toISOString().split("T")[0]);
        }
      }
      const nights = bookedDates.size;
      debugPerProperty.push({
        propertyId: propertyId.slice(0, 8),
        bookingCount: pBookings.length,
        bookedNights: nights,
        occupancy: totalDays > 0 ? Math.round((nights / totalDays) * 100) : 0,
        dates: Array.from(bookedDates).sort().slice(0, 10),
      });
      if (nights > 0) {
        totalOccupancy += (nights / totalDays) * 100;
        propertiesWithBookings++;
        totalBookedNights += nights;
      }
    });

    const occupancyRate = propertiesWithBookings > 0
      ? Math.round(totalOccupancy / propertiesWithBookings)
      : 0;

    // === AVG NIGHTLY RATE ===
    // Calculate from booked nights: total revenue / total booked nights across range
    const bookingsWithPrice = bookings.filter((b) => b.total_price && b.total_price > 0);
    let avgRate = 0;
    if (bookingsWithPrice.length > 0) {
      let totalNightsWithPrice = 0;
      let totalRevenueForRate = 0;
      for (const b of bookingsWithPrice) {
        const ci = new Date(b.check_in + "T00:00:00Z");
        const co = new Date(b.check_out + "T00:00:00Z");
        const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
        totalNightsWithPrice += nights;
        totalRevenueForRate += (b.total_price ?? 0);
      }
      avgRate = totalNightsWithPrice > 0 ? Math.round(totalRevenueForRate / totalNightsWithPrice) : 0;
    }
    // Fallback to calendar_rates if no booking prices
    if (avgRate === 0) {
      const { data: rates } = await supabase
        .from("calendar_rates")
        .select("applied_rate")
        .in("property_id", propIds)
        .gte("date", start)
        .lte("date", end)
        .not("applied_rate", "is", null);
      const rateEntries = (rates ?? []) as { applied_rate: number }[];
      if (rateEntries.length > 0) {
        avgRate = Math.round(rateEntries.reduce((s, r) => s + r.applied_rate, 0) / rateEntries.length);
      }
    }

    // === UPCOMING CHECK-INS ===
    const upcomingCheckIns = bookings.filter(
      (b) => b.check_in > today && b.check_in <= end && b.status === "confirmed"
    ).length;

    // === TODAY'S CHECK-INS/OUTS ===
    const { data: todayCIData } = await supabase
      .from("bookings")
      .select("guest_name, property_id, platform, status")
      .in("property_id", propIds)
      .eq("check_in", today)
      .in("status", ["confirmed", "completed"])
      .limit(10);
    const todayCheckIns = (todayCIData ?? []) as { guest_name: string | null; property_id: string; platform: string; status: string }[];

    const { data: todayCOData } = await supabase
      .from("bookings")
      .select("id, guest_name, property_id, platform")
      .in("property_id", propIds)
      .eq("check_out", today)
      .in("status", ["confirmed", "completed"])
      .limit(10);
    const todayCheckOuts = (todayCOData ?? []) as { id: string; guest_name: string | null; property_id: string; platform: string }[];

    // Cleaning status for check-outs
    const cleaningStatuses: Record<string, string> = {};
    if (todayCheckOuts.length > 0) {
      const { data: cleaningData } = await supabase
        .from("cleaning_tasks")
        .select("booking_id, status")
        .in("booking_id", todayCheckOuts.map((b) => b.id));
      for (const c of (cleaningData ?? []) as { booking_id: string | null; status: string }[]) {
        if (c.booking_id) cleaningStatuses[c.booking_id] = c.status;
      }
    }

    // === UNREAD MESSAGES ===
    const { count: unreadMsgCount } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("property_id", propIds)
      .eq("direction", "inbound")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // === WEEK CALENDAR ===
    const next7End = fmt(new Date(Date.now() + 6 * 86400000));
    const { data: next7Data } = await supabase
      .from("bookings")
      .select("property_id, guest_name, check_in, check_out")
      .in("property_id", propIds)
      .lte("check_in", next7End)
      .gte("check_out", today)
      .in("status", ["confirmed", "completed"]);
    const next7Bookings = (next7Data ?? []) as { property_id: string; guest_name: string | null; check_in: string; check_out: string }[];

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days: { date: string; dayLabel: string; dayNum: number; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        date: fmt(d),
        dayLabel: dayNames[d.getDay()],
        dayNum: d.getDate(),
        isToday: i === 0,
      });
    }

    const propertyWeeks = props.map((prop) => ({
      propertyId: prop.id,
      propertyName: prop.name,
      days: days.map((d) => {
        const booking = next7Bookings.find(
          (b) => b.property_id === prop.id && b.check_in <= d.date && b.check_out > d.date
        );
        return {
          date: d.date,
          status: (booking ? "booked" : "available") as "booked" | "available" | "blocked",
          guestName: booking?.guest_name ?? undefined,
        };
      }),
    }));

    // === REVENUE CHART ===
    const { offset: monthOffset, count: monthCount } = getRevenueMonths(range);
    const now = new Date();
    const revenueMonthRanges = [];
    for (let i = 0; i < monthCount; i++) {
      const mo = range === "this_year" ? i : monthOffset + i;
      const mStart = new Date(now.getFullYear(), now.getMonth() + mo, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() + mo + 1, 0);
      revenueMonthRanges.push({
        month: mStart.toLocaleDateString("en-US", { month: "short" }),
        start: fmt(mStart),
        end: fmt(mEnd),
      });
    }

    const revenueQueries = await Promise.all(
      revenueMonthRanges.map((r) =>
        supabase
          .from("bookings")
          .select("total_price, check_in, check_out")
          .in("property_id", propIds)
          .lt("check_in", addDay(r.end))
          .gt("check_out", r.start)
          .in("status", ["confirmed", "completed"])
      )
    );

    const revenueData = revenueMonthRanges.map((r, idx) => {
      const mBookings = (revenueQueries[idx].data ?? []) as { total_price: number | null; check_in: string; check_out: string }[];
      const rev = mBookings.reduce((s, b) => s + (b.total_price ?? 0), 0);
      return { month: r.month, revenue: rev };
    });

    // Log occupancy debug info
    console.log(`[dashboard] range=${range} period=${start}..${end} (${totalDays}d) bookings=${bookings.length} occupancy=${occupancyRate}%`);
    for (const dp of debugPerProperty) {
      console.log(`[dashboard]   property=${dp.propertyId} bookings=${dp.bookingCount} nights=${dp.bookedNights} occ=${dp.occupancy}% dates=${dp.dates.join(",")}`);
    }

    return NextResponse.json({
      range,
      dateRange: { start, end, totalDays },
      stats: {
        revenue,
        occupancyRate,
        bookedNights: totalBookedNights,
        propertiesWithBookings,
        totalProperties: props.length,
        avgRate,
        upcomingCheckIns,
      },
      todayCheckIns,
      todayCheckOuts,
      cleaningStatuses,
      unreadMsgCount: unreadMsgCount ?? 0,
      days,
      propertyWeeks,
      revenueData,
      properties: props,
      debug: { totalBookingsInRange: bookings.length, perProperty: debugPerProperty },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dashboard/stats] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}
