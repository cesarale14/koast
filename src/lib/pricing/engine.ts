import { createServiceClient } from "@/lib/supabase/service";
import {
  runAllSignals,
  type SignalResult,
  type SignalContext,
  type LearnedDowRates,
} from "./signals";
import { getEventsForDate } from "@/lib/events/cache";
import { fetchWeatherForecast } from "./weather";

export interface CalendarRateUpdate {
  property_id: string;
  date: string;
  base_rate: number;
  suggested_rate: number;
  applied_rate: number | null;
  rate_source: "engine";
  factors: Record<string, SignalResult>;
}

export interface PricingConfig {
  base_rate: number;
  min_rate: number;
  max_rate: number;
  max_adjustment: number;
  pricing_mode: "manual" | "review" | "auto";
}

const DEFAULT_CONFIG: PricingConfig = {
  base_rate: 150,
  min_rate: 50,
  max_rate: 500,
  max_adjustment: 0.60,
  pricing_mode: "review",
};

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export class PricingEngine {
  private supabase;

  constructor() {
    this.supabase = createServiceClient();
  }

  async calculateRates(
    propertyId: string,
    startDate: Date,
    endDate: Date,
    config?: Partial<PricingConfig>
  ): Promise<CalendarRateUpdate[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const todayStr = new Date().toISOString().split("T")[0];
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // ---------- Pre-fetch data ----------

    // Market snapshot (demand score)
    const { data: snapshots } = await this.supabase
      .from("market_snapshots")
      .select("market_demand_score, market_supply, snapshot_date")
      .eq("property_id", propertyId)
      .order("snapshot_date", { ascending: false })
      .limit(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotRows = (snapshots ?? []) as any[];
    const demandScore = snapshotRows[0]?.market_demand_score ?? null;
    const currentListings = snapshotRows[0]?.market_supply ?? null;
    const previousListings = snapshotRows[1]?.market_supply ?? null;

    // Comp set
    const { data: comps } = await this.supabase
      .from("market_comps")
      .select("comp_adr, comp_occupancy")
      .eq("property_id", propertyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compData = (comps ?? []) as any[];
    const compAdrs = compData.map((c) => c.comp_adr).filter((v: number) => v > 0);
    const compOccs = compData.map((c) => c.comp_occupancy).filter((v: number) => v > 0);
    const compMedianAdr = compAdrs.length > 0
      ? [...compAdrs].sort((a, b) => a - b)[Math.floor(compAdrs.length / 2)]
      : null;

    // Bookings
    const { data: bookingsData } = await this.supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("property_id", propertyId)
      .lte("check_in", endStr)
      .gte("check_out", startStr)
      .in("status", ["confirmed", "completed"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookings = (bookingsData ?? []) as any[];

    // Existing rates for smoothing
    const { data: existingRates } = await this.supabase
      .from("calendar_rates")
      .select("date, applied_rate")
      .eq("property_id", propertyId)
      .gte("date", startStr)
      .lte("date", endStr);
    const rateMap = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (existingRates ?? []) as any[]) {
      if (r.applied_rate != null) rateMap.set(r.date, r.applied_rate);
    }

    // Property occupancy
    const monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1).toISOString().split("T")[0];
    const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).toISOString().split("T")[0];
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const { data: monthBookings } = await this.supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("property_id", propertyId)
      .lte("check_in", monthEnd)
      .gte("check_out", monthStart)
      .in("status", ["confirmed", "completed"]);
    let bookedNights = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (monthBookings ?? []) as any[]) {
      const ci = new Date(b.check_in);
      const co = new Date(b.check_out);
      const ms = Math.max(ci.getTime(), new Date(monthStart).getTime());
      const me = Math.min(co.getTime(), new Date(monthEnd).getTime() + 86400000);
      bookedNights += Math.max(0, Math.ceil((me - ms) / 86400000));
    }
    const propertyOccupancy = daysInMonth > 0 ? (bookedNights / daysInMonth) * 100 : null;

    // Property coordinates (for weather)
    const { data: propData } = await this.supabase
      .from("properties")
      .select("latitude, longitude")
      .eq("id", propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propRow = ((propData ?? []) as any[])[0];
    const lat = propRow?.latitude ? parseFloat(propRow.latitude) : null;
    const lng = propRow?.longitude ? parseFloat(propRow.longitude) : null;

    // Weather forecast (cached daily)
    const weatherForecast = await fetchWeatherForecast(lat, lng, this.supabase);

    // Learned seasonality from pricing_outcomes (if 30+ data points)
    let learnedDow: LearnedDowRates | null = null;
    let avgLeadTimeDays: number | null = null;
    const { data: outcomes } = await this.supabase
      .from("pricing_outcomes")
      .select("date, was_booked, days_before_checkin")
      .eq("property_id", propertyId)
      .order("date", { ascending: false })
      .limit(180);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcomeRows = (outcomes ?? []) as any[];
    if (outcomeRows.length >= 30) {
      // Learn day-of-week booking rates
      const dowCounts: Record<number, { booked: number; total: number }> = {};
      for (let d = 0; d < 7; d++) dowCounts[d] = { booked: 0, total: 0 };
      for (const o of outcomeRows) {
        const dow = new Date(o.date + "T00:00:00").getDay();
        dowCounts[dow].total++;
        if (o.was_booked) dowCounts[dow].booked++;
      }
      learnedDow = {} as LearnedDowRates;
      for (let d = 0; d < 7; d++) {
        learnedDow[d] = dowCounts[d].total > 0 ? dowCounts[d].booked / dowCounts[d].total : 0.5;
      }

      // Average lead time for booked dates
      const bookedOutcomes = outcomeRows.filter((o) => o.was_booked && o.days_before_checkin != null);
      if (bookedOutcomes.length >= 5) {
        avgLeadTimeDays = Math.round(
          bookedOutcomes.reduce((s, o) => s + o.days_before_checkin, 0) / bookedOutcomes.length
        );
      }
    }

    // ---------- Calculate rates per date ----------
    const results: CalendarRateUpdate[] = [];
    let prevSuggested = cfg.base_rate;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      const isBooked = bookings.some(
        (b: { check_in: string; check_out: string }) => dateStr >= b.check_in && dateStr < b.check_out
      );

      const dateEvents = await getEventsForDate(this.supabase, propertyId, dateStr);
      const currentRate = rateMap.get(dateStr) ?? cfg.base_rate;

      // Build context and run all registered signals
      const ctx: SignalContext = {
        dateStr,
        date: new Date(current),
        todayStr,
        demandScore,
        learnedDow,
        currentRate,
        propertyOccupancy,
        compAdrs,
        compOccs,
        events: dateEvents,
        bookings,
        isBooked,
        avgLeadTimeDays,
        weatherForecast,
        currentListings,
        previousListings,
        compMedianAdr,
      };
      const signals: Record<string, SignalResult> = runAllSignals(ctx);

      let weightedSum = 0;
      for (const s of Object.values(signals)) {
        weightedSum += s.score * s.weight;
      }

      let suggested = cfg.base_rate * (1 + weightedSum * cfg.max_adjustment);
      suggested = Math.max(cfg.min_rate, Math.min(cfg.max_rate, suggested));

      // Smooth: max 15% change from previous day
      const maxChange = prevSuggested * 0.15;
      if (suggested > prevSuggested + maxChange) suggested = prevSuggested + maxChange;
      else if (suggested < prevSuggested - maxChange) suggested = prevSuggested - maxChange;

      suggested = roundToNearest(suggested, 5);
      suggested = Math.max(cfg.min_rate, Math.min(cfg.max_rate, suggested));

      results.push({
        property_id: propertyId,
        date: dateStr,
        base_rate: cfg.base_rate,
        suggested_rate: suggested,
        applied_rate: cfg.pricing_mode === "auto" ? suggested : null,
        rate_source: "engine",
        factors: signals,
      });

      prevSuggested = suggested;
      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  async applyRates(rates: CalendarRateUpdate[]): Promise<number> {
    if (rates.length === 0) return 0;

    const rows = rates.map((rate) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = {
        property_id: rate.property_id,
        date: rate.date,
        suggested_rate: rate.suggested_rate,
        rate_source: rate.rate_source,
        factors: rate.factors,
        base_rate: rate.base_rate,
        is_available: true,
        min_stay: 1,
      };
      if (rate.applied_rate != null) row.applied_rate = rate.applied_rate;
      return row;
    });

    // Single upsert — existing rows update, new rows insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase.from("calendar_rates") as any).upsert(rows, {
      onConflict: "property_id,date",
    });
    if (error) throw new Error(`applyRates upsert failed: ${error.message}`);

    return rates.length;
  }

  async approveRates(propertyId: string, dates: string[]): Promise<number> {
    if (dates.length === 0) return 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = this.supabase.from("calendar_rates") as any;

    // Fetch all matching rows in one query
    const { data } = await table
      .select("id, date, suggested_rate")
      .eq("property_id", propertyId)
      .in("date", dates);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).filter((r: any) => r.suggested_rate != null);
    if (rows.length === 0) return 0;

    // Build upsert rows that copy suggested_rate → applied_rate
    const updates = rows.map((r: { id: string; date: string; suggested_rate: number }) => ({
      id: r.id,
      property_id: propertyId,
      date: r.date,
      applied_rate: r.suggested_rate,
    }));

    const { error } = await table.upsert(updates, { onConflict: "id" });
    if (error) throw new Error(`approveRates upsert failed: ${error.message}`);

    return rows.length;
  }

  async overrideRates(propertyId: string, dates: string[], rate: number): Promise<number> {
    if (dates.length === 0) return 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = this.supabase.from("calendar_rates") as any;

    const { data, error: fetchError } = await table
      .select("id, date")
      .eq("property_id", propertyId)
      .in("date", dates);

    if (fetchError) throw new Error(`overrideRates fetch failed: ${fetchError.message}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return 0;

    const updates = rows.map((r: { id: string; date: string }) => ({
      id: r.id,
      property_id: propertyId,
      date: r.date,
      applied_rate: rate,
      rate_source: "override",
    }));

    const { error } = await table.upsert(updates, { onConflict: "id" });
    if (error) throw new Error(`overrideRates upsert failed: ${error.message}`);

    return rows.length;
  }
}
