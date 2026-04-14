import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import PropertiesPage from "@/components/dashboard/PropertiesPage";

const EST_RATE_FALLBACK = 150; // per-night estimate when a booking has no total_price

function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

type BookingRow = {
  id: string;
  property_id: string;
  guest_name: string | null;
  num_guests: number | null;
  check_in: string;
  check_out: string;
  total_price: number | null;
  platform: string;
  status: string;
};

function calcRevenue(list: BookingRow[], rangeStart: string, rangeEnd: string): number {
  let rev = 0;
  for (const b of list) {
    const oStart = Math.max(
      new Date(b.check_in + "T00:00:00Z").getTime(),
      new Date(rangeStart + "T00:00:00Z").getTime()
    );
    const oEnd = Math.min(
      new Date(b.check_out + "T00:00:00Z").getTime(),
      new Date(addDay(rangeEnd) + "T00:00:00Z").getTime()
    );
    const oNights = Math.max(0, Math.round((oEnd - oStart) / 86400000));
    if (b.total_price && b.total_price > 0) {
      const totalNights = Math.max(
        1,
        Math.round(
          (new Date(b.check_out + "T00:00:00Z").getTime() -
            new Date(b.check_in + "T00:00:00Z").getTime()) /
            86400000
        )
      );
      rev += (b.total_price * oNights) / totalNights;
    } else {
      rev += oNights * EST_RATE_FALLBACK;
    }
  }
  return Math.round(rev);
}

export default async function PropertiesServerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const propertiesRes = await svc
    .from("properties")
    .select(
      "id, name, address, city, state, property_type, bedrooms, bathrooms, max_guests, channex_property_id, cover_photo_url"
    )
    .eq("user_id", user.id)
    .order("name");

  const properties = (propertiesRes.data ?? []) as {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    property_type: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    max_guests: number | null;
    channex_property_id: string | null;
    cover_photo_url: string | null;
  }[];

  if (properties.length === 0) {
    return (
      <PropertiesPage
        properties={[]}
        channels={[]}
        bookingCounts={{}}
        occupancy={{}}
        nextCheckins={{}}
        monthlyRevenue={{}}
        rating={{}}
        adr={{}}
        currentBooking={{}}
        nextBookingGuest={{}}
        cleaningToday={{}}
        tonightRate={{}}
      />
    );
  }

  const propertyIds = properties.map((p) => p.id);

  const [
    channelsRes,
    allBookingsRes,
    monthBookingsRes,
    upcomingRes,
    ratingsRes,
    cleaningTodayRes,
    cleanersRes,
    tonightRatesRes,
  ] = await Promise.all([
    svc
      .from("property_channels")
      .select("property_id, channel_code, channel_name, status")
      .in("property_id", propertyIds),

    svc
      .from("bookings")
      .select(
        "id, property_id, guest_name, num_guests, check_in, check_out, total_price, platform, status"
      )
      .in("property_id", propertyIds)
      .in("status", ["confirmed", "completed"]),

    svc
      .from("bookings")
      .select("property_id, check_in, check_out")
      .in("property_id", propertyIds)
      .gte("check_out", monthStart)
      .lte("check_in", monthEnd)
      .in("status", ["confirmed", "completed"]),

    svc
      .from("bookings")
      .select("property_id, check_in, guest_name")
      .in("property_id", propertyIds)
      .gte("check_in", today)
      .in("status", ["confirmed"])
      .order("check_in")
      .limit(200),

    svc
      .from("guest_reviews")
      .select("property_id, rating")
      .in("property_id", propertyIds)
      .not("rating", "is", null),

    svc
      .from("cleaning_tasks")
      .select("property_id, cleaner_id, status, scheduled_date")
      .in("property_id", propertyIds)
      .eq("scheduled_date", today),

    svc.from("cleaners").select("id, name").eq("user_id", user.id),

    svc
      .from("calendar_rates")
      .select("property_id, date, applied_rate, base_rate, suggested_rate")
      .in("property_id", propertyIds)
      .is("channel_code", null)
      .eq("date", today),
  ]);

  const channels = (channelsRes.data ?? []) as {
    property_id: string;
    channel_code: string;
    channel_name: string;
    status: string;
  }[];

  const allBookings = (allBookingsRes.data ?? []) as BookingRow[];

  // Monthly revenue + ADR + occupancy
  const bookingCounts: Record<string, number> = {};
  const monthlyRevenue: Record<string, number> = {};
  const occupancy: Record<string, number> = {};
  const adr: Record<string, number> = {};

  const monthBookings = (monthBookingsRes.data ?? []) as {
    property_id: string;
    check_in: string;
    check_out: string;
  }[];

  for (const b of allBookings) {
    bookingCounts[b.property_id] = (bookingCounts[b.property_id] ?? 0) + 1;
  }

  for (const propId of propertyIds) {
    const propMonth = monthBookings.filter((b) => b.property_id === propId);
    let bookedNights = 0;
    for (const b of propMonth) {
      const ci = new Date(Math.max(new Date(b.check_in + "T00:00:00Z").getTime(), new Date(monthStart + "T00:00:00Z").getTime()));
      const co = new Date(Math.min(new Date(b.check_out + "T00:00:00Z").getTime(), new Date(addDay(monthEnd) + "T00:00:00Z").getTime()));
      bookedNights += Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
    }
    occupancy[propId] = Math.round((bookedNights / daysInMonth) * 100);

    const propMonthFull = allBookings.filter(
      (b) => b.property_id === propId && b.check_in <= monthEnd && b.check_out > monthStart
    );
    const rev = calcRevenue(propMonthFull, monthStart, monthEnd);
    monthlyRevenue[propId] = rev;
    adr[propId] = bookedNights > 0 ? Math.round(rev / bookedNights) : 0;
  }

  // Rating per property
  const rating: Record<string, number> = {};
  const ratingSums = new Map<string, { sum: number; count: number }>();
  for (const r of (ratingsRes.data ?? []) as { property_id: string; rating: number | string | null }[]) {
    const v = Number(r.rating);
    if (!Number.isFinite(v) || v <= 0) continue;
    const cur = ratingSums.get(r.property_id) ?? { sum: 0, count: 0 };
    cur.sum += v;
    cur.count += 1;
    ratingSums.set(r.property_id, cur);
  }
  for (const [id, agg] of Array.from(ratingSums.entries())) {
    rating[id] = Math.round((agg.sum / agg.count) * 10) / 10;
  }

  // Current active booking per property
  const currentBooking: Record<string, { guest: string | null; check_out: string } | null> = {};
  for (const b of allBookings) {
    if (b.check_in <= today && b.check_out > today) {
      currentBooking[b.property_id] = { guest: b.guest_name, check_out: b.check_out };
    }
  }

  // Next check-in (first booking with check_in >= today, taking the SECOND if
  // the first is the current active booking). We keep the existing
  // nextCheckins payload shape and also add a nextBookingGuest map.
  const nextCheckins: Record<string, { date: string; guest: string | null }> = {};
  const nextBookingGuest: Record<string, string | null> = {};
  const upcoming = (upcomingRes.data ?? []) as {
    property_id: string;
    check_in: string;
    guest_name: string | null;
  }[];
  for (const b of upcoming) {
    if (!nextCheckins[b.property_id]) {
      nextCheckins[b.property_id] = { date: b.check_in, guest: b.guest_name };
      nextBookingGuest[b.property_id] = b.guest_name;
    }
  }

  // Cleaning tasks today
  const cleaners = (cleanersRes.data ?? []) as { id: string; name: string }[];
  const cleanerMap = new Map(cleaners.map((c) => [c.id, c.name]));
  const cleaningToday: Record<string, { status: string; cleaner: string | null } | null> = {};
  for (const t of (cleaningTodayRes.data ?? []) as {
    property_id: string;
    cleaner_id: string | null;
    status: string;
  }[]) {
    cleaningToday[t.property_id] = {
      status: t.status,
      cleaner: t.cleaner_id ? cleanerMap.get(t.cleaner_id) ?? null : null,
    };
  }

  // Tonight's applied rate for the Vacant status line
  const tonightRate: Record<string, number> = {};
  for (const r of (tonightRatesRes.data ?? []) as {
    property_id: string;
    applied_rate: number | null;
    base_rate: number | null;
    suggested_rate: number | null;
  }[]) {
    const val = r.applied_rate ?? r.suggested_rate ?? r.base_rate;
    if (val != null) tonightRate[r.property_id] = Math.round(Number(val));
  }

  return (
    <PropertiesPage
      properties={properties}
      channels={channels}
      bookingCounts={bookingCounts}
      occupancy={occupancy}
      nextCheckins={nextCheckins}
      monthlyRevenue={monthlyRevenue}
      rating={rating}
      adr={adr}
      currentBooking={currentBooking}
      nextBookingGuest={nextBookingGuest}
      cleaningToday={cleaningToday}
      tonightRate={tonightRate}
    />
  );
}
