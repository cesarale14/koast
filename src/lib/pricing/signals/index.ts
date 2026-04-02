// Signal registry — the single place to register pricing signals.
// To add a new signal: create a file, export a `definition`, and add it to SIGNAL_REGISTRY below.

import type { SignalResult, SignalContext, SignalDefinition } from "./types";

import { definition as demand } from "./demand";
import { definition as seasonality } from "./seasonality";
import { definition as competitor } from "./competitor";
import { definition as event } from "./event";
import { definition as gapNight } from "./gap-night";
import { definition as bookingPace } from "./booking-pace";
import { definition as weather } from "./weather";
import { definition as supply } from "./supply";
import { definition as leadTime } from "./lead-time";

// ---------- Registry ----------

const SIGNAL_REGISTRY: SignalDefinition[] = [
  demand,
  seasonality,
  competitor,
  event,
  gapNight,
  bookingPace,
  weather,
  supply,
  leadTime,
];

const totalRawWeight = SIGNAL_REGISTRY.reduce((sum, s) => sum + s.rawWeight, 0);

/**
 * Run all registered signals against a context.
 * Weights are auto-normalized so they always sum to 1.0.
 */
export function runAllSignals(ctx: SignalContext): Record<string, SignalResult> {
  const results: Record<string, SignalResult> = {};
  for (const sig of SIGNAL_REGISTRY) {
    const result = sig.compute(ctx);
    results[sig.id] = {
      ...result,
      weight: sig.rawWeight / totalRawWeight,
    };
  }
  return results;
}

/** Get the list of registered signal IDs (useful for diagnostics). */
export function getRegisteredSignals(): { id: string; normalizedWeight: number }[] {
  return SIGNAL_REGISTRY.map((s) => ({
    id: s.id,
    normalizedWeight: s.rawWeight / totalRawWeight,
  }));
}

// ---------- Re-exports for backward compatibility ----------
// Consumers that import individual signal functions (e.g. tests) keep working.

export type { SignalResult, SignalContext, SignalDefinition, WeatherDay, LearnedDowRates, EventData, BookingData } from "./types";
export { demandSignal } from "./demand";
export { seasonalitySignal, DOW_ADJUSTMENTS, DOW_NAMES, MONTH_ADJUSTMENTS, MONTH_NAMES } from "./seasonality";
export { competitorSignal } from "./competitor";
export { eventSignal } from "./event";
export { gapNightSignal } from "./gap-night";
export { bookingPaceSignal } from "./booking-pace";
export { weatherSignal } from "./weather";
export { supplySignal } from "./supply";
export { leadTimeSignal } from "./lead-time";
