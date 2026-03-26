import { searchEvents, TAMPA_EVENTS, type LocalEvent } from "./client";

export async function syncEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  property: { id: string; latitude: number; longitude: number },
  days: number = 90
): Promise<number> {
  const startDate = new Date().toISOString().split("T")[0];
  const endDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];

  // Fetch from Ticketmaster
  const tmEvents = await searchEvents(
    property.latitude,
    property.longitude,
    15, // 15 miles radius
    startDate,
    endDate
  );

  // Combine with hardcoded Tampa events in range
  const hardcoded = TAMPA_EVENTS.filter(
    (e) => e.event_date >= startDate && e.event_date <= endDate
  ).map((e) => ({ ...e, raw_data: { source: "hardcoded" } }));

  const allEvents: LocalEvent[] = [...tmEvents, ...hardcoded];

  // Dedupe by date + name
  const seen = new Set<string>();
  const unique = allEvents.filter((e) => {
    const key = `${e.event_date}:${e.event_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Delete existing events for this property in date range
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("local_events") as any;
  await table
    .delete()
    .eq("property_id", property.id)
    .gte("event_date", startDate)
    .lte("event_date", endDate);

  // Insert new events
  if (unique.length > 0) {
    const rows = unique.map((e) => ({
      property_id: property.id,
      event_name: e.event_name,
      event_date: e.event_date,
      venue_name: e.venue_name,
      event_type: e.event_type,
      estimated_attendance: e.estimated_attendance,
      demand_impact: e.demand_impact,
      source: e.source,
      raw_data: e.raw_data,
    }));

    // Insert in batches
    for (let i = 0; i < rows.length; i += 50) {
      await table.insert(rows.slice(i, i + 50));
    }
  }

  console.log(`[events] Synced ${unique.length} events for property ${property.id} (${tmEvents.length} Ticketmaster + ${hardcoded.length} hardcoded)`);
  return unique.length;
}

export async function getEventsForDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  propertyId: string,
  date: string
): Promise<{ event_name: string; venue_name: string | null; demand_impact: number; estimated_attendance: number; event_type: string }[]> {
  const { data } = await supabase
    .from("local_events")
    .select("event_name, venue_name, demand_impact, estimated_attendance, event_type")
    .eq("property_id", propertyId)
    .eq("event_date", date);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any[];
}
