import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWeatherForecast } from "@/lib/pricing/weather";

export interface ActionItem {
  id: string;
  type: "pricing" | "event" | "cleaning" | "review" | "weather";
  icon: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  urgency: number; // higher = more urgent
}

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todayStr = new Date().toISOString().split("T")[0];
  const d14 = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  const d7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const tmrw = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // Get user's properties
  const { data: props } = await supabase.from("properties").select("id, name, latitude, longitude").eq("user_id", user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (props ?? []) as any[];
  if (properties.length === 0) return NextResponse.json({ actions: [] });
  const propIds = properties.map((p) => p.id);
  const propMap = new Map(properties.map((p) => [p.id, p]));

  const actions: ActionItem[] = [];

  // 1. Pricing — dates where suggested differs from applied by > 10%
  const { data: rates } = await supabase
    .from("calendar_rates")
    .select("date, applied_rate, suggested_rate, property_id")
    .in("property_id", propIds)
    .is("channel_code", null)
    .gte("date", todayStr).lte("date", d14)
    .not("suggested_rate", "is", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rateRows = (rates ?? []) as any[];
  const pricingGaps = rateRows.filter((r) => {
    if (!r.applied_rate || !r.suggested_rate) return false;
    return Math.abs(r.suggested_rate - r.applied_rate) / r.applied_rate > 0.10;
  });
  if (pricingGaps.length > 0) {
    const avgDiff = Math.round(pricingGaps.reduce((s, r) => s + (r.suggested_rate - r.applied_rate), 0) / pricingGaps.length);
    const dir = avgDiff > 0 ? "below" : "above";
    actions.push({
      id: "pricing-gap", type: "pricing", icon: "🎯", urgency: 80,
      title: `${pricingGaps.length} dates priced $${Math.abs(avgDiff)}+ ${dir} market`,
      description: `Upcoming dates could ${avgDiff > 0 ? "earn" : "save"} $${Math.abs(avgDiff)} more per night`,
      action: { label: "Review Pricing", href: "/pricing" },
    });
  }

  // 2. Events — next 7 days
  const { data: events } = await supabase
    .from("local_events")
    .select("event_name, event_date, venue_name, estimated_attendance, demand_impact, property_id")
    .in("property_id", propIds)
    .gte("event_date", todayStr).lte("event_date", d7)
    .order("event_date");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) {
    const dateLabel = new Date(e.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const att = e.estimated_attendance > 0 ? `${(e.estimated_attendance / 1000).toFixed(0)}K attendees` : "";
    actions.push({
      id: `event-${e.event_name}-${e.event_date}`, type: "event", icon: "🏟", urgency: 40,
      title: `${e.event_name} — ${dateLabel}`,
      description: `${att}${e.venue_name ? ` at ${e.venue_name}` : ""} — demand impact: ${((e.demand_impact ?? 0) * 100).toFixed(0)}%`,
    });
  }

  // 3. Cleaning tasks — today and tomorrow
  const { data: tasks } = await supabase
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, status, cleaner_id")
    .in("property_id", propIds)
    .gte("scheduled_date", todayStr).lte("scheduled_date", tmrw)
    .in("status", ["pending", "assigned", "in_progress"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (tasks ?? []) as any[]) {
    const propName = propMap.get(t.property_id)?.name ?? "Property";
    const when = t.scheduled_date === todayStr ? "today" : "tomorrow";
    const statusLabel = t.status === "pending" && !t.cleaner_id ? "no cleaner assigned" : t.status;
    actions.push({
      id: `clean-${t.id}`, type: "cleaning", icon: "🧹", urgency: t.scheduled_date === todayStr ? 90 : 70,
      title: `Cleaning ${when} at ${propName}`,
      description: `Status: ${statusLabel}`,
      action: { label: "View Task", href: "/turnovers" },
    });
  }

  // 4. Reviews pending
  const { data: bookingsNeedReview } = await supabase
    .from("bookings")
    .select("id")
    .in("property_id", propIds)
    .lte("check_out", todayStr)
    .in("status", ["confirmed", "completed"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookingIds = ((bookingsNeedReview ?? []) as any[]).map((b) => b.id);
  if (bookingIds.length > 0) {
    const { data: existingReviews } = await supabase
      .from("guest_reviews")
      .select("booking_id")
      .in("booking_id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewedIds = new Set(((existingReviews ?? []) as any[]).map((r) => r.booking_id));
    const needReview = bookingIds.filter((id) => !reviewedIds.has(id)).length;
    if (needReview > 0) {
      actions.push({
        id: "reviews-pending", type: "review", icon: "⭐", urgency: 50,
        title: `${needReview} review${needReview > 1 ? "s" : ""} pending`,
        description: "Generate reviews to maintain your search ranking",
        action: { label: "Write Reviews", href: "/reviews" },
      });
    }
  }

  // 5. Weather — this weekend
  const prop0 = properties[0];
  if (prop0?.latitude && prop0?.longitude) {
    const forecast = await fetchWeatherForecast(parseFloat(prop0.latitude), parseFloat(prop0.longitude), supabase);
    const weekend = forecast.filter((f) => {
      const dow = new Date(f.date + "T00:00:00").getDay();
      return (dow === 5 || dow === 6 || dow === 0) && f.date >= todayStr && f.date <= d7;
    });
    if (weekend.length > 0) {
      const best = weekend.reduce((a, b) => a.tempHigh > b.tempHigh ? a : b);
      if (best.precipChance < 30 && best.tempHigh >= 70) {
        actions.push({
          id: "weather-good", type: "weather", icon: "☀️", urgency: 20,
          title: `${best.conditions} this weekend — ${best.tempHigh}°F`,
          description: "Good weather drives last-minute bookings",
        });
      } else if (best.precipChance > 60) {
        actions.push({
          id: "weather-rain", type: "weather", icon: "🌧", urgency: 25,
          title: `Rain expected this weekend — ${best.precipChance}% chance`,
          description: "May reduce last-minute bookings",
        });
      }
    }
  }

  // Sort by urgency, limit to 5
  actions.sort((a, b) => b.urgency - a.urgency);

  return NextResponse.json({ actions: actions.slice(0, 5) });
}
