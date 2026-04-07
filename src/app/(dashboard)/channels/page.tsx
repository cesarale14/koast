import { createClient } from "@/lib/supabase/server";
import ChannelsOverview from "@/components/dashboard/ChannelsOverview";

export default async function ChannelsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch user's properties with channex info
  const { data: propertiesData } = await supabase
    .from("properties")
    .select("id, name, channex_property_id")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (propertiesData ?? []) as any[];
  const propertyIds = properties.map((p) => p.id);

  // Fetch channels, room types, rate plans, and booking counts in parallel
  const [channelsRes, roomTypesRes, ratePlansRes, bookingsRes] = await Promise.all([
    propertyIds.length > 0
      ? supabase.from("property_channels").select("*").in("property_id", propertyIds).order("channel_name")
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase.from("channex_room_types").select("*").in("property_id", propertyIds).order("title")
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase.from("channex_rate_plans").select("*").in("property_id", propertyIds).order("title")
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase.from("bookings").select("property_id, platform").in("property_id", propertyIds).eq("status", "confirmed")
      : Promise.resolve({ data: [] }),
  ]);

  const channels = (channelsRes.data ?? []) as Record<string, unknown>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomTypes = (roomTypesRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ratePlans = (ratePlansRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[];

  // Group booking counts by property + platform
  const bookingCounts: Record<string, Record<string, number>> = {};
  for (const b of bookings) {
    if (!bookingCounts[b.property_id]) bookingCounts[b.property_id] = {};
    bookingCounts[b.property_id][b.platform] = (bookingCounts[b.property_id][b.platform] ?? 0) + 1;
  }

  return (
    <ChannelsOverview
      properties={properties.map((p: { id: string; name: string; channex_property_id: string | null }) => ({
        id: p.id,
        name: p.name,
        channexPropertyId: p.channex_property_id,
      }))}
      channels={channels}
      roomTypes={roomTypes}
      ratePlans={ratePlans}
      bookingCounts={bookingCounts}
    />
  );
}
