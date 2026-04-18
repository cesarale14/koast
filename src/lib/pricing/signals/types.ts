// Shared types for the pricing signal system

export interface SignalResult {
  score: number;
  weight: number;
  reason: string;
  /**
   * How much the engine should trust this signal's output. 1.0 = full trust
   * (default); lower values dampen the signal's effective weight during
   * aggregation. Dropped weight redistributes proportionally across the
   * other signals. See src/lib/pricing/engine.ts aggregation loop.
   *
   * PR B: only `competitor` currently returns a non-1.0 value (reads
   * properties.comp_set_quality). Other signals should return 1.0 or omit
   * the field entirely until they have a reason to report reduced trust.
   */
  confidence?: number;
}

export interface EventData {
  event_name: string;
  venue_name: string | null;
  demand_impact: number;
  estimated_attendance: number;
  event_type: string;
}

export interface BookingData {
  check_in: string;
  check_out: string;
}

export interface WeatherDay {
  date: string;
  tempHigh: number; // °F
  precipChance: number; // 0-100
  conditions: string;
}

export interface LearnedDowRates {
  [dow: number]: number; // 0-6 → booking rate 0-1
}

/**
 * All data a signal might need for a single date.
 * Built once per engine run, updated per-date for date-specific fields.
 */
export interface SignalContext {
  dateStr: string;
  date: Date;
  todayStr: string;
  demandScore: number | null;
  learnedDow: LearnedDowRates | null;
  currentRate: number;
  propertyOccupancy: number | null;
  compAdrs: number[];
  compOccs: number[];
  events: EventData[];
  bookings: BookingData[];
  isBooked: boolean;
  avgLeadTimeDays: number | null;
  weatherForecast: WeatherDay[];
  currentListings: number | null;
  previousListings: number | null;
  compMedianAdr: number | null;
  /**
   * Quality marker sourced from properties.comp_set_quality. The competitor
   * signal reads this and maps it to a confidence level so the engine can
   * down-weight comp-based math when the comp set is approximate. See
   * src/lib/pricing/signals/competitor.ts.
   */
  compSetQuality?: "precise" | "fallback" | "insufficient" | "unknown";
}

/**
 * A signal definition for the registry.
 * `rawWeight` is the relative importance before normalization.
 * `compute` receives the full context and returns a result.
 */
export interface SignalDefinition {
  id: string;
  rawWeight: number;
  compute(ctx: SignalContext): SignalResult;
}
