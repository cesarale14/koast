const TM_BASE = "https://app.ticketmaster.com/discovery/v2";

interface TMEvent {
  name: string;
  dates: { start: { localDate: string } };
  _embedded?: {
    venues?: { name: string; city?: { name: string }; location?: { latitude: string; longitude: string }; generalInfo?: { generalRule?: string } }[];
  };
  classifications?: { segment?: { name: string }; genre?: { name: string } }[];
  seatmap?: { staticUrl?: string };
}

export interface LocalEvent {
  event_name: string;
  event_date: string;
  venue_name: string | null;
  event_type: string;
  estimated_attendance: number;
  demand_impact: number;
  source: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: any;
}

function classifyEvent(event: TMEvent): { type: string; attendance: number; impact: number } {
  const segment = event.classifications?.[0]?.segment?.name?.toLowerCase() ?? "";
  const genre = event.classifications?.[0]?.genre?.name?.toLowerCase() ?? "";
  const name = event.name.toLowerCase();

  if (segment.includes("sport") || genre.includes("football") || genre.includes("basketball") || genre.includes("hockey")) {
    if (name.includes("nfl") || name.includes("buccaneers") || name.includes("super bowl")) {
      return { type: "sports", attendance: 65000, impact: 0.7 };
    }
    if (name.includes("lightning") || name.includes("nhl")) {
      return { type: "sports", attendance: 19000, impact: 0.5 };
    }
    return { type: "sports", attendance: 15000, impact: 0.4 };
  }
  if (segment.includes("music")) {
    if (name.includes("festival") || name.includes("fest")) {
      return { type: "festival", attendance: 30000, impact: 0.7 };
    }
    return { type: "music", attendance: 8000, impact: 0.4 };
  }
  if (segment.includes("arts") || segment.includes("theatre")) {
    return { type: "arts", attendance: 2000, impact: 0.2 };
  }
  if (name.includes("conference") || name.includes("convention") || name.includes("expo")) {
    return { type: "conference", attendance: 10000, impact: 0.5 };
  }
  if (name.includes("festival") || name.includes("fest")) {
    return { type: "festival", attendance: 20000, impact: 0.6 };
  }
  return { type: "other", attendance: 3000, impact: 0.2 };
}

export async function searchEvents(
  lat: number,
  lng: number,
  radiusMiles: number,
  startDate: string,
  endDate: string
): Promise<LocalEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.warn("[events] TICKETMASTER_API_KEY not set, skipping event search");
    return [];
  }

  const url = `${TM_BASE}/events.json?apikey=${apiKey}&latlong=${lat},${lng}&radius=${radiusMiles}&unit=miles&startDateTime=${startDate}T00:00:00Z&endDateTime=${endDate}T23:59:59Z&size=200&sort=date,asc`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[events] Ticketmaster error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const events: TMEvent[] = data._embedded?.events ?? [];

  return events.map((e) => {
    const cls = classifyEvent(e);
    const venue = e._embedded?.venues?.[0];
    return {
      event_name: e.name,
      event_date: e.dates.start.localDate,
      venue_name: venue?.name ?? null,
      event_type: cls.type,
      estimated_attendance: cls.attendance,
      demand_impact: cls.impact,
      source: "ticketmaster",
      raw_data: { name: e.name, segment: e.classifications?.[0]?.segment?.name },
    };
  });
}

// Tampa-specific hardcoded events
export const TAMPA_EVENTS: Omit<LocalEvent, "raw_data">[] = [
  // Gasparilla - late January
  { event_name: "Gasparilla Pirate Festival", event_date: "2027-01-24", venue_name: "Bayshore Blvd", event_type: "festival", estimated_attendance: 300000, demand_impact: 0.9, source: "hardcoded" },
  // Strawberry Festival - Feb/Mar
  { event_name: "Florida Strawberry Festival", event_date: "2027-02-25", venue_name: "Plant City", event_type: "festival", estimated_attendance: 500000, demand_impact: 0.4, source: "hardcoded" },
  { event_name: "Florida Strawberry Festival", event_date: "2027-03-01", venue_name: "Plant City", event_type: "festival", estimated_attendance: 500000, demand_impact: 0.4, source: "hardcoded" },
  // Tampa Bay Boat Show
  { event_name: "Tampa Bay Boat Show", event_date: "2027-03-15", venue_name: "Tampa Convention Center", event_type: "conference", estimated_attendance: 25000, demand_impact: 0.3, source: "hardcoded" },
  // Spring Break
  { event_name: "Spring Break (Peak)", event_date: "2027-03-14", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.6, source: "hardcoded" },
  { event_name: "Spring Break (Peak)", event_date: "2027-03-15", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.6, source: "hardcoded" },
  { event_name: "Spring Break (Peak)", event_date: "2027-03-21", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.6, source: "hardcoded" },
  // Holidays
  { event_name: "New Year's Eve", event_date: "2026-12-31", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.6, source: "hardcoded" },
  { event_name: "Independence Day", event_date: "2027-07-04", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.7, source: "hardcoded" },
  { event_name: "Labor Day Weekend", event_date: "2027-09-06", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.5, source: "hardcoded" },
  { event_name: "Memorial Day Weekend", event_date: "2027-05-31", venue_name: "Tampa Bay Area", event_type: "festival", estimated_attendance: 0, demand_impact: 0.5, source: "hardcoded" },
];
