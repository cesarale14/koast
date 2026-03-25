import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RevenueChart from "@/components/dashboard/RevenueChart";
import WeekCalendar from "@/components/dashboard/WeekCalendar";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getMonthRange(offset: number = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    daysInMonth: end.getDate(),
  };
}

function getNext7Days() {
  const days = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split("T")[0],
      dayLabel: dayNames[d.getDay()],
      dayNum: d.getDate(),
      isToday: i === 0,
    });
  }
  return days;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = getMonthRange(0);
  const next7End = getNext7Days()[6].date;

  // Fire all queries
  const propertiesRes = await supabase.from("properties").select("id, name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string }[];

  const monthBookingsRes = await supabase
    .from("bookings")
    .select("total_price, check_in, check_out")
    .gte("check_in", thisMonth.start)
    .lte("check_in", thisMonth.end)
    .in("status", ["confirmed", "completed"]);
  const monthBookings = (monthBookingsRes.data ?? []) as { total_price: number | null; check_in: string; check_out: string }[];

  const todayCheckInsRes = await supabase
    .from("bookings")
    .select("guest_name, property_id, platform, status")
    .eq("check_in", today)
    .in("status", ["confirmed", "completed"])
    .limit(10);
  const todayCheckIns = (todayCheckInsRes.data ?? []) as { guest_name: string | null; property_id: string; platform: string; status: string }[];

  const todayCheckOutsRes = await supabase
    .from("bookings")
    .select("id, guest_name, property_id, platform")
    .eq("check_out", today)
    .in("status", ["confirmed", "completed"])
    .limit(10);
  const todayCheckOuts = (todayCheckOutsRes.data ?? []) as { id: string; guest_name: string | null; property_id: string; platform: string }[];

  const upcomingCheckInsRes = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .gt("check_in", today)
    .lte("check_in", next7End)
    .in("status", ["confirmed"]);
  const upcomingCheckInsCount = upcomingCheckInsRes.count ?? 0;

  const calendarRatesRes = await supabase
    .from("calendar_rates")
    .select("applied_rate")
    .gte("date", thisMonth.start)
    .lte("date", thisMonth.end)
    .not("applied_rate", "is", null);
  const calendarRates = (calendarRatesRes.data ?? []) as { applied_rate: number | null }[];

  const unreadMessagesRes = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const unreadMsgCount = unreadMessagesRes.count ?? 0;

  const next7BookingsRes = await supabase
    .from("bookings")
    .select("property_id, guest_name, check_in, check_out")
    .lte("check_in", next7End)
    .gte("check_out", today)
    .in("status", ["confirmed", "completed"]);
  const next7Bookings = (next7BookingsRes.data ?? []) as { property_id: string; guest_name: string | null; check_in: string; check_out: string }[];

  // Build property name map
  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  // -- Stats --
  const totalRevenue = monthBookings.reduce(
    (sum, b) => sum + (b.total_price ?? 0),
    0
  );

  // Occupancy: booked nights this month / (properties * days in month)
  let bookedNights = 0;
  for (const b of monthBookings) {
    const ci = new Date(b.check_in);
    const co = new Date(b.check_out);
    const msStart = Math.max(ci.getTime(), new Date(thisMonth.start).getTime());
    const msEnd = Math.min(co.getTime(), new Date(thisMonth.end).getTime() + 86400000);
    const nights = Math.max(0, Math.ceil((msEnd - msStart) / 86400000));
    bookedNights += nights;
  }
  const totalAvailableNights = properties.length * thisMonth.daysInMonth;
  const occupancyRate =
    totalAvailableNights > 0
      ? Math.round((bookedNights / totalAvailableNights) * 100)
      : 0;

  const avgRate =
    calendarRates.length > 0
      ? Math.round(
          calendarRates.reduce((s, r) => s + (r.applied_rate ?? 0), 0) /
            calendarRates.length
        )
      : 0;

  // -- Revenue chart: last 6 months --
  const revenueData: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const range = getMonthRange(-i);
    const monthName = new Date(range.start).toLocaleDateString("en-US", {
      month: "short",
    });
    // For current month we already have data, for past months we'd need separate queries
    // For now, only current month is populated; others show 0 until historical data exists
    if (i === 0) {
      revenueData.push({ month: monthName, revenue: totalRevenue });
    } else {
      revenueData.push({ month: monthName, revenue: 0 });
    }
  }

  // Fetch last 5 months' revenue in parallel
  const pastMonthQueries = await Promise.all(
    [5, 4, 3, 2, 1].map((offset) => {
      const range = getMonthRange(-offset);
      return supabase
        .from("bookings")
        .select("total_price")
        .gte("check_in", range.start)
        .lte("check_in", range.end)
        .in("status", ["confirmed", "completed"]);
    })
  );
  pastMonthQueries.forEach((res, idx) => {
    const data = (res.data ?? []) as { total_price: number | null }[];
    const rev = data.reduce(
      (s, b) => s + (b.total_price ?? 0),
      0
    );
    revenueData[idx].revenue = rev;
  });

  // -- Week calendar --
  const days = getNext7Days();
  const propertyWeeks = properties.map((prop) => ({
    propertyId: prop.id,
    propertyName: prop.name,
    days: days.map((d) => {
      const booking = next7Bookings.find(
        (b) =>
          b.property_id === prop.id &&
          b.check_in <= d.date &&
          b.check_out > d.date
      );
      return {
        date: d.date,
        status: (booking ? "booked" : "available") as
          | "booked"
          | "available"
          | "blocked",
        guestName: booking?.guest_name ?? undefined,
      };
    }),
  }));

  // -- Today's check-outs with cleaning status --
  let cleaningMap = new Map<string, string>();
  if (todayCheckOuts.length > 0) {
    const bookingIds = todayCheckOuts.map((b) => b.id);
    const cleaningRes = await supabase
      .from("cleaning_tasks")
      .select("booking_id, status")
      .in("booking_id", bookingIds);
    const cleaningData = (cleaningRes.data ?? []) as { booking_id: string | null; status: string }[];
    cleaningMap = new Map(
      cleaningData.filter((c) => c.booking_id).map((c) => [c.booking_id!, c.status])
    );
  }

  const hasData = properties.length > 0;

  // Empty state
  if (!hasData) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-gray-500 mb-8">
          Overview of your properties and bookings
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No properties yet
          </h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add your first property to start tracking bookings, revenue, and
            occupancy across all your rentals.
          </p>
          <Link
            href="/properties"
            className="inline-flex px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Your First Property
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-8">
        Overview of your properties and bookings
      </p>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Revenue (MTD)</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {totalRevenue > 0 ? formatCurrency(totalRevenue) : "$0"}
          </p>
          <p className="text-xs text-gray-400 mt-1">This month</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Occupancy Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {occupancyRate}%
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {bookedNights} of {totalAvailableNights} nights booked
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Avg Nightly Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {avgRate > 0 ? formatCurrency(avgRate) : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {calendarRates.length > 0
              ? `From ${calendarRates.length} rate entries`
              : "No rates set yet"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">
            Upcoming Check-ins
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {upcomingCheckInsCount}
          </p>
          <p className="text-xs text-gray-400 mt-1">Next 7 days</p>
        </div>
      </div>

      {/* Today's activity + Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Check-ins today */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Check-ins Today
            </h2>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
              {todayCheckIns.length}
            </span>
          </div>
          {todayCheckIns.length === 0 ? (
            <p className="text-gray-400 text-sm">No check-ins today.</p>
          ) : (
            <div className="space-y-3">
              {todayCheckIns.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {b.guest_name ?? "Unknown Guest"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {propMap.get(b.property_id) ?? "Unknown Property"}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                    {b.platform}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Check-outs today */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Check-outs Today
            </h2>
            <div className="flex items-center gap-3">
              {unreadMsgCount > 0 && (
                <Link
                  href="/messages"
                  className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors"
                >
                  {unreadMsgCount} unread message{unreadMsgCount !== 1 ? "s" : ""}
                </Link>
              )}
              <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-600 font-medium">
                {todayCheckOuts.length}
              </span>
            </div>
          </div>
          {todayCheckOuts.length === 0 ? (
            <p className="text-gray-400 text-sm">No check-outs today.</p>
          ) : (
            <div className="space-y-3">
              {todayCheckOuts.map((b, i) => {
                const cleaningStatus = cleaningMap.get(b.id);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {b.guest_name ?? "Unknown Guest"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {propMap.get(b.property_id) ?? "Unknown Property"}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        cleaningStatus === "completed"
                          ? "bg-emerald-50 text-emerald-600"
                          : cleaningStatus === "in_progress"
                          ? "bg-blue-50 text-blue-600"
                          : cleaningStatus === "assigned"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {cleaningStatus === "completed"
                        ? "Cleaned"
                        : cleaningStatus === "in_progress"
                        ? "Cleaning"
                        : cleaningStatus === "assigned"
                        ? "Assigned"
                        : cleaningStatus === "issue"
                        ? "Issue"
                        : "No task"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Week calendar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Next 7 Days
        </h2>
        <WeekCalendar days={days} properties={propertyWeeks} />
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Monthly Revenue
        </h2>
        <RevenueChart data={revenueData} />
      </div>
    </div>
  );
}
