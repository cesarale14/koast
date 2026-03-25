import { createClient } from "@/lib/supabase/server";
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
  const endDate60 = new Date();
  endDate60.setDate(endDate60.getDate() + 60);
  const end60 = endDate60.toISOString().split("T")[0];

  // Fetch property
  const propRes = await supabase
    .from("properties")
    .select("id, name, address, city, state, zip, bedrooms, bathrooms, max_guests, property_type, channex_property_id")
    .eq("id", params.id)
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propData = (propRes.data ?? []) as any[];
  if (propData.length === 0) notFound();
  const property = propData[0];

  // Fetch related data
  const listingsRes = await supabase
    .from("listings")
    .select("id, platform, platform_listing_id, listing_url, status")
    .eq("property_id", params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listings = (listingsRes.data ?? []) as any[];

  const bookingsRes = await supabase
    .from("bookings")
    .select("id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, platform, total_price, num_guests, status, notes")
    .eq("property_id", params.id)
    .order("check_in", { ascending: false })
    .limit(50);
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

  const revenue = monthBookings.reduce((s: number, b: { total_price: number | null }) => s + (b.total_price ?? 0), 0);
  const totalBookingsCount = allBookings.filter((b: { status: string }) => b.status !== "cancelled").length;

  // ADR
  const ratesRes = await supabase
    .from("calendar_rates")
    .select("applied_rate")
    .eq("property_id", params.id)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .not("applied_rate", "is", null);
  const rates = (ratesRes.data ?? []) as { applied_rate: number | null }[];
  const adr = rates.length > 0
    ? Math.round(rates.reduce((s, r) => s + (r.applied_rate ?? 0), 0) / rates.length)
    : 0;

  // Calendar data (next 60 days)
  const calBookingsRes = await supabase
    .from("bookings")
    .select("id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, platform, total_price, num_guests, status, notes")
    .eq("property_id", params.id)
    .lte("check_in", end60)
    .gte("check_out", today)
    .in("status", ["confirmed", "completed", "pending"]);

  const calRatesRes = await supabase
    .from("calendar_rates")
    .select("property_id, date, base_rate, suggested_rate, applied_rate, min_stay, is_available, rate_source")
    .eq("property_id", params.id)
    .gte("date", today)
    .lte("date", end60);

  return (
    <PropertyDetail
      property={property}
      listings={listings}
      allBookings={allBookings}
      stats={{ occupancy, revenue, adr, totalBookings: totalBookingsCount }}
      calendarBookings={(calBookingsRes.data ?? []) as never[]}
      calendarRates={(calRatesRes.data ?? []) as never[]}
    />
  );
}
