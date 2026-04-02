// Shared types for the pricing signal system

export interface SignalResult {
  score: number;
  weight: number;
  reason: string;
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
