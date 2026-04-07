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

  // Fetch property_channels for each property that has channex
  const propertyIds = properties.map((p) => p.id);
  let channels: Record<string, unknown>[] = [];
  if (propertyIds.length > 0) {
    const { data: channelsData } = await supabase
      .from("property_channels")
      .select("*")
      .in("property_id", propertyIds)
      .order("channel_name", { ascending: true });
    channels = (channelsData ?? []) as Record<string, unknown>[];
  }

  // Fetch booking counts grouped by platform for all properties
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("property_id, platform")
    .in("property_id", propertyIds)
    .eq("status", "confirmed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsData ?? []) as any[];

  // Group booking counts by property + platform
  const bookingCounts: Record<string, Record<string, number>> = {};
  for (const b of bookings) {
    const pid = b.property_id;
    const plat = b.platform;
    if (!bookingCounts[pid]) bookingCounts[pid] = {};
    bookingCounts[pid][plat] = (bookingCounts[pid][plat] ?? 0) + 1;
  }

  return (
    <ChannelsOverview
      properties={properties.map((p) => ({
        id: p.id,
        name: p.name,
        channexPropertyId: p.channex_property_id,
      }))}
      channels={channels}
      bookingCounts={bookingCounts}
    />
  );
}
