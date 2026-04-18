import { createServiceClient } from "@/lib/supabase/service";
import {
  runAllSignals,
  type SignalResult,
  type SignalContext,
  type LearnedDowRates,
} from "./signals";
import { getEventsForDate } from "@/lib/events/cache";
import { fetchWeatherForecast } from "./weather";
import { applyPricingRules, type PricingRulesRow, type GuardrailTrip } from "./apply-rules";

export interface RecommendationClamps {
  raw_engine_suggestion: number;
  clamped_by: Array<"min_rate" | "max_rate">;
  guardrail_trips: GuardrailTrip[];
}

export type RecommendationUrgency = "act_now" | "coming_up" | "review";

export interface CalendarRateUpdate {
  property_id: string;
  date: string;
  base_rate: number;
  suggested_rate: number;
  applied_rate: number | null;
  rate_source: "engine";
  factors: Record<string, SignalResult>;
  /** PR B — rules-layer outcome, surfaced through to pricing_recommendations.reason_signals.clamps. */
  clamps: RecommendationClamps;
  /** PR B — plain-English summary of the clamp outcome. null if no clamps tripped. */
  reason_text: string | null;
  /** PR B — urgency classification from |raw - current| / current gap. */
  urgency: RecommendationUrgency;
}

function buildReasonText(
  clamps: RecommendationClamps,
  adjusted: number,
  rules: PricingRulesRow
): string | null {
  const { raw_engine_suggestion, clamped_by, guardrail_trips } = clamps;
  const raw = Math.round(raw_engine_suggestion);
  const adj = Math.round(adjusted);
  // Priority: guardrail trips surface first (they're more specific than min/max clamps).
  const delta = guardrail_trips.find((t) => t.guardrail === "max_daily_delta");
  if (delta) {
    return `Koast suggested $${raw} — limited to $${adj} by your max daily change rule (${Math.round(rules.max_daily_delta_pct * 100)}%).`;
  }
  const floor = guardrail_trips.find((t) => t.guardrail === "comp_floor" && !t.skipped_reason);
  if (floor) {
    return `Koast suggested $${raw} — raised to $${adj} to stay within ${Math.round(rules.comp_floor_pct * 100)}% of local comps.`;
  }
  if (clamped_by.includes("max_rate")) {
    return `Koast suggested $${raw} — clamped to your max of $${Math.round(rules.max_rate)}. Raise max_rate in rules to unlock higher pricing.`;
  }
  if (clamped_by.includes("min_rate")) {
    return `Koast suggested $${raw} — raised to your min of $${Math.round(rules.min_rate)}.`;
  }
  return null;
}

function classifyUrgency(rawSuggestion: number, currentRate: number | null): RecommendationUrgency {
  if (currentRate == null || currentRate <= 0) return "review";
  const gap = Math.abs(rawSuggestion - currentRate) / currentRate;
  if (gap > 0.15) return "act_now";
  if (gap > 0.05) return "coming_up";
  return "review";
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

    // Comp set + quality marker (PR B — competitor signal uses the quality
    // to report confidence; engine aggregation multiplies weight by it).
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propQualityRow } = await (this.supabase.from("properties") as any)
      .select("comp_set_quality")
      .eq("id", propertyId)
      .maybeSingle();
    const compSetQuality: "precise" | "fallback" | "insufficient" | "unknown" =
      (propQualityRow?.comp_set_quality as "precise" | "fallback" | "insufficient" | "unknown") ?? "unknown";

    // Pre-computed comp set 25th percentile for the comp-floor guardrail.
    const compSetP25: number | null = compAdrs.length > 0
      ? [...compAdrs].sort((a, b) => a - b)[Math.floor(compAdrs.length * 0.25)]
      : null;

    // Pricing rules row (PR B). If absent, we fall back to the cfg-based
    // defaults — same behavior as before rules landed. If present, the
    // rules supersede cfg for clamp bounds and daily-delta semantics.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rulesRow } = await (this.supabase.from("pricing_rules") as any)
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle();
    const effectiveRules: PricingRulesRow = rulesRow
      ? {
          base_rate: Number(rulesRow.base_rate),
          min_rate: Number(rulesRow.min_rate),
          max_rate: Number(rulesRow.max_rate),
          channel_markups: rulesRow.channel_markups ?? {},
          max_daily_delta_pct: Number(rulesRow.max_daily_delta_pct),
          comp_floor_pct: Number(rulesRow.comp_floor_pct),
          seasonal_overrides: rulesRow.seasonal_overrides ?? {},
          auto_apply: rulesRow.auto_apply === true,
        }
      : {
          base_rate: cfg.base_rate,
          min_rate: cfg.min_rate,
          max_rate: cfg.max_rate,
          channel_markups: {},
          max_daily_delta_pct: 0.15,
          comp_floor_pct: 0.85,
          seasonal_overrides: {},
          auto_apply: false,
        };

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
      .is("channel_code", null)
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
        compSetQuality,
      };
      const signals: Record<string, SignalResult> = runAllSignals(ctx);

      // Confidence-aware aggregation (PR B). Each signal's effective
      // weight = weight * confidence (default 1.0). Total effective weight
      // is usually <1.0 when any signal returns low confidence; we normalize
      // back to 1.0 so dropped weight redistributes proportionally across
      // the remaining signals. Example: if Competitor (w=0.20) reports
      // confidence=0.5, its effective contribution drops to 0.10 pre-norm,
      // and the other 8 signals' effective weights scale up to compensate.
      const sigList = Object.values(signals);
      const effectiveWeights = sigList.map((s) => s.weight * (s.confidence ?? 1.0));
      const totalEffective = effectiveWeights.reduce((a, b) => a + b, 0);
      let weightedSum = 0;
      if (totalEffective > 0) {
        for (let i = 0; i < sigList.length; i++) {
          const normalized = effectiveWeights[i] / totalEffective;
          weightedSum += sigList[i].score * normalized;
        }
      }

      // Raw engine output — what the signals alone want before rules clamp.
      const rawSuggestion = effectiveRules.base_rate * (1 + weightedSum * cfg.max_adjustment);

      // Apply pricing_rules: min/max clamp, daily-delta cap, comp floor.
      // prevSuggested on the first iteration is the seed base_rate (see
      // initialization above); subsequent iterations use the previous day's
      // rule-adjusted output, keeping the delta chain consistent.
      const rulesResult = applyPricingRules({
        rules: effectiveRules,
        suggestedRate: rawSuggestion,
        previousAppliedRate: prevSuggested,
        compSetP25,
        compSetQuality,
        date: dateStr,
      });
      const suggested = roundToNearest(rulesResult.adjusted_rate, 5);

      const clamps: RecommendationClamps = {
        raw_engine_suggestion: Math.round(rawSuggestion * 100) / 100,
        clamped_by: rulesResult.clamped_by,
        guardrail_trips: rulesResult.guardrail_trips,
      };
      const reason_text = buildReasonText(clamps, suggested, effectiveRules);
      const urgency = classifyUrgency(rawSuggestion, currentRate);

      results.push({
        property_id: propertyId,
        date: dateStr,
        base_rate: effectiveRules.base_rate,
        suggested_rate: suggested,
        applied_rate: cfg.pricing_mode === "auto" ? suggested : null,
        rate_source: "engine",
        factors: signals,
        clamps,
        reason_text,
        urgency,
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
        channel_code: null,
      };
      if (rate.applied_rate != null) row.applied_rate = rate.applied_rate;
      return row;
    });

    // Single upsert — existing rows update, new rows insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase.from("calendar_rates") as any).upsert(rows, {
      onConflict: "property_id,date,channel_code",
    });
    if (error) throw new Error(`applyRates upsert failed: ${error.message}`);

    return rates.length;
  }

  async approveRates(propertyId: string, dates: string[]): Promise<number> {
    if (dates.length === 0) return 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = this.supabase.from("calendar_rates") as any;

    // Fetch all matching rows in one query — base rows only
    const { data } = await table
      .select("id, date, suggested_rate")
      .eq("property_id", propertyId)
      .is("channel_code", null)
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
      .is("channel_code", null)
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
