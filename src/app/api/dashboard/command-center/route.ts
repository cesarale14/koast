import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type BookingRow = {
  id: string; property_id: string; guest_name: string | null; num_guests: number | null;
  check_in: string; check_out: string; total_price: number | null; platform: string;
  status: string; created_at: string;
};

function calcRevenue(bookingList: BookingRow[], rangeStart: string, rangeEnd: string): number {
  let rev = 0;
  const EST_RATE = 150; // fallback per-night estimate when no total_price (iCal bookings)
  for (const b of bookingList) {
    const oStart = Math.max(new Date(b.check_in + "T00:00:00Z").getTime(), new Date(rangeStart + "T00:00:00Z").getTime());
    const oEnd = Math.min(new Date(b.check_out + "T00:00:00Z").getTime(), new Date(addDay(rangeEnd) + "T00:00:00Z").getTime());
    const oNights = Math.max(0, Math.round((oEnd - oStart) / 86400000));
    if (b.total_price && b.total_price > 0) {
      const totalNights = Math.max(1, Math.round(
        (new Date(b.check_out + "T00:00:00Z").getTime() - new Date(b.check_in + "T00:00:00Z").getTime()) / 86400000
      ));
      rev += (b.total_price * oNights) / totalNights;
    } else {
      rev += oNights * EST_RATE;
    }
  }
  return Math.round(rev);
}

export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const now = new Date();
    const today = fmt(now);
    const tomorrow = fmt(new Date(Date.now() + 86400000));
    const d14 = fmt(new Date(Date.now() + 14 * 86400000));
    const d30 = fmt(new Date(Date.now() + 30 * 86400000));
    const thisMonthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
    const thisMonthEnd = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const lastMonthStart = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd = fmt(new Date(now.getFullYear(), now.getMonth(), 0));
    const yearStart = `${now.getFullYear()}-01-01`;
    const yearEnd = `${now.getFullYear()}-12-31`;

    // Phase 1: Properties
    const { data: propertiesData } = await supabase
      .from("properties")
      .select("id, name, cover_photo_url")
      .eq("user_id", user.id);
    const props = (propertiesData ?? []) as { id: string; name: string; cover_photo_url: string | null }[];
    if (props.length === 0) return NextResponse.json({ empty: true });
    const propIds = props.map((p) => p.id);
    const propNameMap = new Map(props.map((p) => [p.id, p.name]));

    // Phase 2: All parallel queries
    const [
      bookingsRes,
      listingsRes,
      channelsRes,
      ratesRes,
      cleaningTodayRes,
      cleanersRes,
      eventsRes,
      marketRes,
      recentCleaningsRes,
      recentReviewsRes,
      allReviewsRes,
    ] = await Promise.all([
      // All bookings for current year (revenue, status, activity, occupancy)
      supabase
        .from("bookings")
        .select("id, property_id, guest_name, num_guests, check_in, check_out, total_price, platform, status, created_at")
        .in("property_id", propIds)
        .lt("check_in", addDay(yearEnd))
        .gt("check_out", yearStart)
        .in("status", ["confirmed", "completed"]),
      // Active listings (platform info)
      supabase
        .from("listings")
        .select("property_id, platform")
        .in("property_id", propIds)
        .eq("status", "active"),
      // Property channels (Channex-connected OTAs)
      supabase
        .from("property_channels")
        .select("property_id, channel_code, status")
        .in("property_id", propIds)
        .eq("status", "active"),
      // Calendar rates: today + next 30 days
      supabase
        .from("calendar_rates")
        .select("property_id, date, applied_rate, suggested_rate")
        .in("property_id", propIds)
        .is("channel_code", null)
        .gte("date", today)
        .lte("date", d30),
      // Cleaning tasks today & tomorrow
      supabase
        .from("cleaning_tasks")
        .select("id, property_id, booking_id, cleaner_id, status, scheduled_date")
        .in("property_id", propIds)
        .gte("scheduled_date", today)
        .lte("scheduled_date", tomorrow)
        .in("status", ["pending", "assigned", "in_progress", "completed"]),
      // Cleaners (name lookup)
      supabase.from("cleaners").select("id, name").eq("user_id", user.id),
      // Events next 14 days
      supabase
        .from("local_events")
        .select("event_name, event_date, demand_impact, event_type, property_id")
        .in("property_id", propIds)
        .gte("event_date", today)
        .lte("event_date", d14)
        .order("event_date"),
      // Market snapshots (recent)
      supabase
        .from("market_snapshots")
        .select("property_id, market_adr, market_occupancy, market_demand_score, snapshot_date")
        .in("property_id", propIds)
        .order("snapshot_date", { ascending: false })
        .limit(props.length),
      // Recent completed cleanings (activity feed)
      supabase
        .from("cleaning_tasks")
        .select("property_id, completed_at")
        .in("property_id", propIds)
        .eq("status", "completed")
        .gte("completed_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("completed_at", { ascending: false })
        .limit(5),
      // Recent published reviews (activity feed)
      supabase
        .from("guest_reviews")
        .select("property_id, booking_id, published_at")
        .in("property_id", propIds)
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(5),
      // All reviewed booking IDs (for pending reviews action)
      supabase
        .from("guest_reviews")
        .select("booking_id")
        .in("property_id", propIds),
    ]);

    const bookings = (bookingsRes.data ?? []) as BookingRow[];
    const listings = (listingsRes.data ?? []) as { property_id: string; platform: string }[];
    const channelRows = (channelsRes.data ?? []) as { property_id: string; channel_code: string; status: string }[];
    const rates = (ratesRes.data ?? []) as { property_id: string; date: string; applied_rate: number | null; suggested_rate: number | null }[];
    const cleaningTasks = (cleaningTodayRes.data ?? []) as { id: string; property_id: string; booking_id: string | null; cleaner_id: string | null; status: string; scheduled_date: string }[];
    const allCleaners = (cleanersRes.data ?? []) as { id: string; name: string }[];
    const events = (eventsRes.data ?? []) as { event_name: string; event_date: string; demand_impact: number | null; event_type: string | null; property_id: string }[];
    const marketSnapshots = (marketRes.data ?? []) as { property_id: string; market_adr: string | null; market_occupancy: string | null; market_demand_score: string | null; snapshot_date: string }[];
    const recentCleanings = (recentCleaningsRes.data ?? []) as { property_id: string; completed_at: string }[];
    const recentReviews = (recentReviewsRes.data ?? []) as { property_id: string; booking_id: string; published_at: string }[];
    const allReviewedIds = new Set(((allReviewsRes.data ?? []) as { booking_id: string }[]).map((r) => r.booking_id));

    // Build lookup maps
    const cleanerMap = new Map(allCleaners.map((c) => [c.id, c.name]));
    const listingMap = new Map<string, string>();
    for (const l of listings) {
      if (!listingMap.has(l.property_id)) listingMap.set(l.property_id, l.platform);
    }

    // Channel code (ABB/BDC/VRBO) -> platform slug used by PlatformLogo
    const codeToPlatform = (code: string): string => {
      const c = code.toUpperCase();
      if (c === "ABB") return "airbnb";
      if (c === "BDC") return "booking_com";
      if (c === "VRBO") return "vrbo";
      return code.toLowerCase();
    };
    const channelPlatformMap = new Map<string, string[]>();
    for (const ch of channelRows) {
      const platform = codeToPlatform(ch.channel_code);
      const existing = channelPlatformMap.get(ch.property_id) ?? [];
      if (!existing.includes(platform)) existing.push(platform);
      channelPlatformMap.set(ch.property_id, existing);
    }
    const tonightRateMap = new Map<string, number>();
    for (const r of rates) {
      if (r.date === today && r.applied_rate) {
        tonightRateMap.set(r.property_id, Math.round(Number(r.applied_rate)));
      }
    }

    // ====== SECTION 1: Property Cards ======
    const propertyCards = props.map((prop) => {
      const propBookings = bookings.filter((b) => b.property_id === prop.id);
      const hasCheckOut = propBookings.some((b) => b.check_out === today);
      const hasCheckIn = propBookings.some((b) => b.check_in === today);
      const activeTonight = propBookings.find((b) => b.check_in <= today && b.check_out > today);

      let status: string;
      if (hasCheckOut && hasCheckIn) status = "turnover_today";
      else if (hasCheckIn) status = "checkin_today";
      else if (hasCheckOut) status = "checkout_today";
      else if (activeTonight) status = "occupied";
      else status = "vacant";

      const channelPlatforms = channelPlatformMap.get(prop.id) ?? [];
      const listingPlatform = listingMap.get(prop.id) || null;
      const platforms = channelPlatforms.length > 0
        ? channelPlatforms
        : (listingPlatform ? [listingPlatform] : []);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const card: any = {
        id: prop.id,
        name: prop.name,
        coverPhotoUrl: prop.cover_photo_url,
        platform: platforms[0] ?? null,
        platforms,
        status,
        tonightRate: tonightRateMap.get(prop.id) || null,
      };

      // Guest info for occupied / checkin
      if (status === "occupied" || status === "checkin_today") {
        const booking = activeTonight || propBookings.find((b) => b.check_in === today);
        if (booking) {
          card.guestName = booking.guest_name;
          card.numGuests = booking.num_guests;
          card.checkIn = booking.check_in;
          card.checkOut = booking.check_out;
          card.nights = Math.max(1, Math.round(
            (new Date(booking.check_out + "T00:00:00Z").getTime() - new Date(booking.check_in + "T00:00:00Z").getTime()) / 86400000
          ));
        }
      }

      // Turnover info
      if (status === "turnover_today") {
        const incomingBooking = propBookings.find((b) => b.check_in === today);
        if (incomingBooking) {
          card.guestName = incomingBooking.guest_name;
          card.numGuests = incomingBooking.num_guests;
          card.checkIn = incomingBooking.check_in;
          card.checkOut = incomingBooking.check_out;
        }
        const task = cleaningTasks.find((t) => t.property_id === prop.id && t.scheduled_date === today);
        if (task) {
          card.cleanerName = task.cleaner_id ? cleanerMap.get(task.cleaner_id) || null : null;
          card.cleanerConfirmed = task.status === "assigned" || task.status === "in_progress" || task.status === "completed";
        }
      }

      // Checkout today - cleaner info
      if (status === "checkout_today") {
        const task = cleaningTasks.find((t) => t.property_id === prop.id && t.scheduled_date === today);
        if (task) {
          card.cleanerName = task.cleaner_id ? cleanerMap.get(task.cleaner_id) || null : null;
          card.cleanerConfirmed = task.status === "assigned" || task.status === "in_progress" || task.status === "completed";
        }
      }

      // Vacant / checkout - next check-in
      if (status === "vacant" || status === "checkout_today") {
        const nextBooking = propBookings
          .filter((b) => b.check_in > today && b.status === "confirmed")
          .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
        if (nextBooking) {
          card.nextCheckIn = nextBooking.check_in;
          card.daysUntilBooked = Math.round(
            (new Date(nextBooking.check_in + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000
          );
        }
      }

      return card;
    });

    // ====== SECTION 2: Actions ======
    interface ActionItem {
      id: string; type: string; title: string; description: string;
      action?: { label: string; href: string }; urgency: number;
    }
    const actions: ActionItem[] = [];

    // Pricing gaps
    const pricingGaps = rates.filter((r) => {
      if (!r.applied_rate || !r.suggested_rate) return false;
      return Math.abs(Number(r.suggested_rate) - Number(r.applied_rate)) / Number(r.applied_rate) > 0.10;
    });
    if (pricingGaps.length > 0) {
      const avgDiff = Math.round(
        pricingGaps.reduce((s, r) => s + (Number(r.suggested_rate) - Number(r.applied_rate!)), 0) / pricingGaps.length
      );
      const dir = avgDiff > 0 ? "below" : "above";
      actions.push({
        id: "pricing-gap", type: "pricing", urgency: 80,
        title: `${pricingGaps.length} dates priced $${Math.abs(avgDiff)}+ ${dir} market`,
        description: `Upcoming dates could ${avgDiff > 0 ? "earn" : "save"} $${Math.abs(avgDiff)} more per night`,
        action: { label: "Review Pricing", href: "/pricing" },
      });
    }

    // Cleaning tasks needing attention
    const pendingCleanings = cleaningTasks.filter((t) => t.status !== "completed");
    for (const t of pendingCleanings) {
      const propName = propNameMap.get(t.property_id) ?? "Property";
      const when = t.scheduled_date === today ? "today" : "tomorrow";
      const statusLabel = t.status === "pending" && !t.cleaner_id ? "no cleaner assigned" : t.status;
      actions.push({
        id: `clean-${t.id}`, type: "cleaning", urgency: t.scheduled_date === today ? 90 : 70,
        title: `Cleaning ${when} at ${propName}`,
        description: `Status: ${statusLabel}`,
        action: { label: "View Task", href: "/turnovers" },
      });
    }

    // Revenue opportunity
    const revenueGaps = rates.filter((r) =>
      r.suggested_rate && r.applied_rate && Number(r.suggested_rate) > Number(r.applied_rate)
    );
    if (revenueGaps.length > 0) {
      const totalOpp = Math.round(
        revenueGaps.reduce((s, r) => s + (Number(r.suggested_rate) - Number(r.applied_rate!)), 0)
      );
      actions.push({
        id: "revenue-opportunity", type: "revenue", urgency: 65,
        title: `You could earn $${totalOpp} more this month`,
        description: `Adjusting ${revenueGaps.length} dates to match market demand`,
        action: { label: "Optimize Pricing", href: "/pricing" },
      });
    }

    // Reviews pending
    const completedBookingIds = bookings
      .filter((b) => b.check_out <= today)
      .map((b) => b.id);
    const needReview = completedBookingIds.filter((id) => !allReviewedIds.has(id)).length;
    if (needReview > 0) {
      actions.push({
        id: "reviews-pending", type: "review", urgency: 50,
        title: `${needReview} review${needReview > 1 ? "s" : ""} pending`,
        description: "Generate reviews to maintain your search ranking",
        action: { label: "Write Reviews", href: "/reviews" },
      });
    }

    // Deduplicate events across properties
    const uniqueEvents = new Map<string, typeof events[0]>();
    for (const e of events) {
      const key = `${e.event_name}-${e.event_date}`;
      if (!uniqueEvents.has(key)) uniqueEvents.set(key, e);
    }

    // Event actions
    for (const e of Array.from(uniqueEvents.values())) {
      const dateLabel = new Date(e.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      actions.push({
        id: `event-${e.event_name}-${e.event_date}`, type: "event", urgency: 40,
        title: `${e.event_name} — ${dateLabel}`,
        description: `Demand impact: ${((e.demand_impact ?? 0) * 100).toFixed(0)}%`,
        action: { label: "View Impact", href: "/pricing" },
      });
    }

    actions.sort((a, b) => b.urgency - a.urgency);

    // ====== SECTION 3: Event Pills ======
    const eventPills = Array.from(uniqueEvents.values()).map((e) => {
      const d = new Date(e.event_date + "T00:00:00");
      return {
        name: e.event_name,
        date: e.event_date,
        dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        demandImpact: e.demand_impact ?? 0,
        eventType: e.event_type,
      };
    });

    // ====== SECTION 4: Performance ======
    // Filter bookings for each period
    const thisMonthBookings = bookings.filter((b) => b.check_in <= thisMonthEnd && b.check_out > thisMonthStart);
    const lastMonthBookings = bookings.filter((b) => b.check_in <= lastMonthEnd && b.check_out > lastMonthStart);

    const thisMonthRevenue = calcRevenue(thisMonthBookings, thisMonthStart, thisMonthEnd);
    const lastMonthRevenue = calcRevenue(lastMonthBookings, lastMonthStart, lastMonthEnd);
    const revenueChangePct = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    // YTD revenue
    const ytdBookings = bookings.filter((b) => b.check_in <= today && b.check_out > yearStart);
    const ytdRevenue = calcRevenue(ytdBookings, yearStart, today);

    // Occupancy (this month, per-property average)
    const thisMonthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let totalOccupancy = 0;
    let propsWithBookings = 0;
    for (const prop of props) {
      const pBookings = thisMonthBookings.filter((b) => b.property_id === prop.id);
      const bookedDates = new Set<string>();
      for (const b of pBookings) {
        const ci = new Date(Math.max(new Date(b.check_in + "T00:00:00Z").getTime(), new Date(thisMonthStart + "T00:00:00Z").getTime()));
        const co = new Date(Math.min(new Date(b.check_out + "T00:00:00Z").getTime(), new Date(addDay(thisMonthEnd) + "T00:00:00Z").getTime()));
        for (let d = new Date(ci); d < co; d.setUTCDate(d.getUTCDate() + 1)) {
          bookedDates.add(d.toISOString().split("T")[0]);
        }
      }
      if (bookedDates.size > 0) {
        totalOccupancy += (bookedDates.size / thisMonthDays) * 100;
        propsWithBookings++;
      }
    }
    const occupancyRate = propsWithBookings > 0 ? Math.round(totalOccupancy / props.length) : 0;

    // Revenue chart (12 months)
    const revenueData: { month: string; revenue: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const mStart = new Date(now.getFullYear(), i, 1);
      const mEnd = new Date(now.getFullYear(), i + 1, 0);
      const mBookings = bookings.filter((b) => b.check_in <= fmt(mEnd) && b.check_out > fmt(mStart));
      revenueData.push({
        month: mStart.toLocaleDateString("en-US", { month: "short" }),
        revenue: calcRevenue(mBookings, fmt(mStart), fmt(mEnd)),
      });
    }

    // ====== SECTION 4b: Market Health ======
    // Get most recent snapshot per property, average across all
    const latestSnapshots = new Map<string, typeof marketSnapshots[0]>();
    for (const s of marketSnapshots) {
      if (!latestSnapshots.has(s.property_id)) latestSnapshots.set(s.property_id, s);
    }
    const snapshotValues = Array.from(latestSnapshots.values());

    let marketAdr = 0;
    let marketOccupancy = 0;
    if (snapshotValues.length > 0) {
      marketAdr = Math.round(snapshotValues.reduce((s, v) => s + Number(v.market_adr ?? 0), 0) / snapshotValues.length);
      marketOccupancy = Math.round(snapshotValues.reduce((s, v) => s + Number(v.market_occupancy ?? 0), 0) / snapshotValues.length);
    }

    // Your ADR from bookings (or calendar_rates if no pricing data)
    const bookingsWithPrice = thisMonthBookings.filter((b) => b.total_price && b.total_price > 0);
    let yourAdr = 0;
    if (bookingsWithPrice.length > 0) {
      let totalNights = 0;
      let totalRev = 0;
      for (const b of bookingsWithPrice) {
        const nights = Math.max(1, Math.round(
          (new Date(b.check_out + "T00:00:00Z").getTime() - new Date(b.check_in + "T00:00:00Z").getTime()) / 86400000
        ));
        totalNights += nights;
        totalRev += b.total_price!;
      }
      yourAdr = totalNights > 0 ? Math.round(totalRev / totalNights) : 0;
    }
    // Fallback: average from calendar_rates if no booking prices (iCal bookings)
    if (yourAdr === 0 && propIds.length > 0) {
      const { data: avgRates } = await supabase
        .from("calendar_rates")
        .select("applied_rate")
        .in("property_id", propIds)
        .gte("date", thisMonthStart)
        .lte("date", thisMonthEnd)
        .not("applied_rate", "is", null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rates = ((avgRates ?? []) as any[]).map((r) => Number(r.applied_rate)).filter((v) => v > 0);
      if (rates.length > 0) yourAdr = Math.round(rates.reduce((s, v) => s + v, 0) / rates.length);
    }

    // Market grade
    let grade = "—";
    if (marketAdr > 0 && marketOccupancy > 0 && yourAdr > 0) {
      const adrRatio = yourAdr / marketAdr;
      const occRatio = occupancyRate / marketOccupancy;
      const score = adrRatio * 50 + occRatio * 50;
      if (score >= 110) grade = "A+";
      else if (score >= 100) grade = "A";
      else if (score >= 90) grade = "B+";
      else if (score >= 80) grade = "B";
      else if (score >= 70) grade = "C+";
      else if (score >= 60) grade = "C";
      else if (score >= 50) grade = "D";
      else grade = "F";
    }

    // Demand forecast (next 30 days)
    // Score each day: booked = 0.7, event = 0.5 (additive), max 1.0
    const eventDates = new Set(events.map((e) => e.event_date));
    const demandForecast: { date: string; score: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const ds = fmt(d);
      // Check if any property has a booking on this day
      const isBooked = bookings.some((b) => b.check_in <= ds && b.check_out > ds);
      const hasEvent = eventDates.has(ds);
      let score = 0.15;
      if (isBooked) score += 0.55;
      if (hasEvent) score += 0.3;
      demandForecast.push({ date: ds, score: Math.min(1, score) });
    }

    // ====== SECTION 5: Activity Feed ======
    interface FeedItem { type: string; text: string; timeAgo: string; ts: number }
    const feed: FeedItem[] = [];

    // Recent new bookings (created in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const recentBookings = bookings
      .filter((b) => b.created_at >= sevenDaysAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
    for (const b of recentBookings) {
      const propName = propNameMap.get(b.property_id) ?? "Property";
      const guest = b.guest_name ?? "Guest";
      const ci = new Date(b.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const co = new Date(b.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      feed.push({
        type: "booking",
        text: `New booking: ${guest}${b.num_guests && b.num_guests > 1 ? ` + ${b.num_guests - 1}` : ""} at ${propName} (${ci}–${co})`,
        timeAgo: timeAgo(b.created_at),
        ts: new Date(b.created_at).getTime(),
      });
    }

    // Recent cleanings
    for (const c of recentCleanings) {
      const propName = propNameMap.get(c.property_id) ?? "Property";
      feed.push({
        type: "cleaning",
        text: `Cleaning completed at ${propName}`,
        timeAgo: timeAgo(c.completed_at),
        ts: new Date(c.completed_at).getTime(),
      });
    }

    // Recent reviews
    for (const r of recentReviews) {
      const propName = propNameMap.get(r.property_id) ?? "Property";
      feed.push({
        type: "review",
        text: `Review published for ${propName}`,
        timeAgo: timeAgo(r.published_at),
        ts: new Date(r.published_at).getTime(),
      });
    }

    // Sort by timestamp, take top 5
    feed.sort((a, b) => b.ts - a.ts);
    const activityFeed = feed.slice(0, 5).map(({ type, text, timeAgo }) => ({ type, text, timeAgo }));

    return NextResponse.json({
      propertyCards,
      actions: actions.slice(0, 5),
      events: eventPills,
      performance: {
        thisMonthRevenue,
        lastMonthRevenue,
        revenueChangePct,
        ytdRevenue,
        occupancyRate,
        revenueData,
      },
      market: {
        grade,
        yourAdr,
        marketAdr,
        yourOccupancy: occupancyRate,
        marketOccupancy,
        demandForecast,
      },
      activityFeed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dashboard/command-center] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
