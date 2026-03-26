import { createServiceClient } from "@/lib/supabase/service";
import {
  demandSignal,
  seasonalitySignal,
  competitorSignal,
  gapNightSignal,
  bookingPaceSignal,
  eventSignal,
  type SignalResult,
} from "./signals";
import { getEventsForDate } from "@/lib/events/cache";

export interface CalendarRateUpdate {
  property_id: string;
  date: string;
  base_rate: number;
  suggested_rate: number;
  applied_rate: number | null; // only set in auto mode
  rate_source: "engine";
  factors: Record<string, SignalResult>;
}

export interface PricingConfig {
  base_rate: number;
  min_rate: number;
  max_rate: number;
  max_adjustment: number; // default 0.60 = ±60%
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

    // Fetch market snapshot
    const { data: snapshots, error: snapErr } = await this.supabase
      .from("market_snapshots")
      .select("market_demand_score")
      .eq("property_id", propertyId)
      .order("snapshot_date", { ascending: false })
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotRows = (snapshots ?? []) as any[];
    if (snapErr) console.error("[PricingEngine] snapshot query error:", snapErr);
    console.log(`[PricingEngine] market_snapshots rows: ${snapshotRows.length}`, snapshotRows[0] ?? "none");
    const demandScore = snapshotRows[0]?.market_demand_score ?? null;
    console.log(`[PricingEngine] demandScore: ${demandScore}`);

    // Fetch comp set
    const { data: comps } = await this.supabase
      .from("market_comps")
      .select("comp_adr, comp_occupancy")
      .eq("property_id", propertyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compData = (comps ?? []) as any[];
    const compAdrs = compData.map((c) => c.comp_adr).filter((v: number) => v > 0);
    const compOccs = compData.map((c) => c.comp_occupancy).filter((v: number) => v > 0);

    // Fetch bookings for the date range
    const { data: bookingsData } = await this.supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("property_id", propertyId)
      .lte("check_in", endStr)
      .gte("check_out", startStr)
      .in("status", ["confirmed", "completed"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookings = (bookingsData ?? []) as any[];

    // Fetch existing applied_rates for smoothing
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

    // Fetch property occupancy (this month approximation)
    const monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      .toISOString().split("T")[0];
    const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
      .toISOString().split("T")[0];
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

    // Generate rates for each date
    const results: CalendarRateUpdate[] = [];
    let prevSuggested = cfg.base_rate;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      const isBooked = bookings.some(
        (b: { check_in: string; check_out: string }) =>
          dateStr >= b.check_in && dateStr < b.check_out
      );

      // Fetch events for this date
      const dateEvents = await getEventsForDate(this.supabase, propertyId, dateStr);

      // Calculate all 6 signals
      const signals: Record<string, SignalResult> = {
        demand: demandSignal(demandScore),
        seasonality: seasonalitySignal(current),
        competitor: competitorSignal(
          rateMap.get(dateStr) ?? cfg.base_rate,
          propertyOccupancy,
          compAdrs,
          compOccs
        ),
        event: eventSignal(dateEvents),
        gap_night: gapNightSignal(dateStr, bookings),
        booking_pace: bookingPaceSignal(dateStr, todayStr, isBooked),
      };

      // Weighted sum
      let weightedSum = 0;
      for (const s of Object.values(signals)) {
        weightedSum += s.score * s.weight;
      }

      // Calculate suggested rate
      let suggested = cfg.base_rate * (1 + weightedSum * cfg.max_adjustment);

      // Guardrail: clamp to min/max
      suggested = Math.max(cfg.min_rate, Math.min(cfg.max_rate, suggested));

      // Guardrail: smooth — never change more than 15% from previous day's suggested rate
      const maxChange = prevSuggested * 0.15;
      if (suggested > prevSuggested + maxChange) {
        suggested = prevSuggested + maxChange;
      } else if (suggested < prevSuggested - maxChange) {
        suggested = prevSuggested - maxChange;
      }

      // Round to nearest $5
      suggested = roundToNearest(suggested, 5);

      // Re-clamp after rounding
      suggested = Math.max(cfg.min_rate, Math.min(cfg.max_rate, suggested));

      const update: CalendarRateUpdate = {
        property_id: propertyId,
        date: dateStr,
        base_rate: cfg.base_rate,
        suggested_rate: suggested,
        applied_rate: cfg.pricing_mode === "auto" ? suggested : null,
        rate_source: "engine",
        factors: signals,
      };

      results.push(update);
      prevSuggested = suggested;

      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  async applyRates(rates: CalendarRateUpdate[]): Promise<number> {
    let updated = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = this.supabase.from("calendar_rates") as any;

    for (const rate of rates) {
      const updateData: Record<string, unknown> = {
        suggested_rate: rate.suggested_rate,
        rate_source: rate.rate_source,
        factors: rate.factors,
        base_rate: rate.base_rate,
      };

      if (rate.applied_rate != null) {
        updateData.applied_rate = rate.applied_rate;
      }

      // Check if entry exists
      const { data: existing } = await table
        .select("id")
        .eq("property_id", rate.property_id)
        .eq("date", rate.date)
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (existing && (existing as any[]).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await table.update(updateData).eq("id", (existing as any[])[0].id);
      } else {
        await table.insert({
          property_id: rate.property_id,
          date: rate.date,
          is_available: true,
          min_stay: 1,
          ...updateData,
        });
      }
      updated++;
    }

    return updated;
  }

  async approveRates(propertyId: string, dates: string[]): Promise<number> {
    let approved = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = this.supabase.from("calendar_rates") as any;

    for (const date of dates) {
      const { data } = await table
        .select("id, suggested_rate")
        .eq("property_id", propertyId)
        .eq("date", date)
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      if (rows.length > 0 && rows[0].suggested_rate != null) {
        await table
          .update({ applied_rate: rows[0].suggested_rate })
          .eq("id", rows[0].id);
        approved++;
      }
    }

    return approved;
  }
}
