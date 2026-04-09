import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import PropertiesPage from "@/components/dashboard/PropertiesPage";

export default async function PropertiesServerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();

  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  // Fetch properties (service client to avoid RLS issues)
  const propertiesRes = await svc
    .from("properties")
    .select("id, name, address, city, state, property_type, bedrooms, bathrooms, max_guests, channex_property_id, cover_photo_url")
    .eq("user_id", user.id)
    .order("name");

  const properties = (propertiesRes.data ?? []) as {
    id: string; name: string; address: string | null; city: string | null;
    state: string | null; property_type: string | null; bedrooms: number | null;
    bathrooms: number | null; max_guests: number | null; channex_property_id: string | null;
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
      />
    );
  }

  const propertyIds = properties.map((p) => p.id);

  // Fetch all data in parallel using service client
  const [channelsRes, bookingsRes, upcomingRes, monthBookingsRes] = await Promise.all([
    svc
      .from("property_channels")
      .select("property_id, channel_code, channel_name, status")
      .in("property_id", propertyIds),

    svc
      .from("bookings")
      .select("property_id")
      .in("property_id", propertyIds)
      .in("status", ["confirmed", "completed"]),

    svc
      .from("bookings")
      .select("property_id, check_in, guest_name")
      .in("property_id", propertyIds)
      .gte("check_in", today)
      .in("status", ["confirmed"])
      .order("check_in")
      .limit(100),

    svc
      .from("bookings")
      .select("property_id, check_in, check_out")
      .in("property_id", propertyIds)
      .gte("check_out", monthStart)
      .lte("check_in", monthEnd)
      .in("status", ["confirmed", "completed"]),
  ]);

  const channels = (channelsRes.data ?? []) as {
    property_id: string; channel_code: string; channel_name: string; status: string;
  }[];

  // Build booking counts per property
  const bookingCounts: Record<string, number> = {};
  for (const b of (bookingsRes.data ?? []) as { property_id: string }[]) {
    bookingCounts[b.property_id] = (bookingCounts[b.property_id] ?? 0) + 1;
  }

  // Build occupancy per property
  const occupancy: Record<string, number> = {};
  const monthBookings = (monthBookingsRes.data ?? []) as {
    property_id: string; check_in: string; check_out: string;
  }[];
  for (const propId of propertyIds) {
    const propBookings = monthBookings.filter((b) => b.property_id === propId);
    let nights = 0;
    for (const b of propBookings) {
      const ci = new Date(b.check_in + "T00:00:00Z");
      const co = new Date(b.check_out + "T00:00:00Z");
      const ms = Math.max(ci.getTime(), new Date(monthStart + "T00:00:00Z").getTime());
      const me = Math.min(co.getTime(), new Date(monthEnd + "T00:00:00Z").getTime() + 86400000);
      nights += Math.max(0, Math.ceil((me - ms) / 86400000));
    }
    occupancy[propId] = Math.round((nights / daysInMonth) * 100);
  }

  // Build next check-in per property
  const nextCheckins: Record<string, { date: string; guest: string | null }> = {};
  for (const b of (upcomingRes.data ?? []) as { property_id: string; check_in: string; guest_name: string | null }[]) {
    if (!nextCheckins[b.property_id]) {
      nextCheckins[b.property_id] = { date: b.check_in, guest: b.guest_name };
    }
  }

  return (
    <PropertiesPage
      properties={properties}
      channels={channels}
      bookingCounts={bookingCounts}
      occupancy={occupancy}
      nextCheckins={nextCheckins}
    />
  );
}
