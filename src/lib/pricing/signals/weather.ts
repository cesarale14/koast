import type { SignalResult, SignalContext, SignalDefinition, WeatherDay } from "./types";

export function weatherSignal(dateStr: string, forecast: WeatherDay[]): SignalResult {
  const day = forecast.find((f) => f.date === dateStr);
  if (!day) return { score: 0, weight: 0.05, reason: "No forecast available" };

  const cond = day.conditions.toLowerCase();
  let score = 0;
  let detail = "";

  if (cond.includes("hurricane") || cond.includes("tropical storm")) {
    score = -0.5;
    detail = "tropical storm/hurricane warning";
  } else if (day.precipChance > 60 || cond.includes("thunderstorm")) {
    score = -0.1;
    detail = `${day.precipChance}% rain — reduces last-minute bookings`;
  } else if (day.tempHigh >= 95) {
    score = -0.05;
    detail = `extreme heat ${day.tempHigh}°F`;
  } else if (day.tempHigh < 50) {
    score = 0.15;
    detail = `cold snap ${day.tempHigh}°F — snowbird demand`;
  } else if (day.tempHigh >= 75 && day.tempHigh <= 85 && day.precipChance < 30) {
    score = 0.1;
    detail = `clear skies, ${day.tempHigh}°F — favorable weather`;
  } else {
    detail = `${day.tempHigh}°F, ${day.precipChance}% precip`;
  }

  return {
    score: Math.round(score * 100) / 100,
    weight: 0.05,
    reason: `${day.conditions} ${day.tempHigh}°F — ${detail}`,
  };
}

export const definition: SignalDefinition = {
  id: "weather",
  rawWeight: 0.05,
  compute(ctx: SignalContext): SignalResult {
    return weatherSignal(ctx.dateStr, ctx.weatherForecast);
  },
};
