"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface AnalyticsResponse {
  avg_rating: number;
  total_incoming: number;
  total_incoming_30d: number;
  response_rate: number;
  median_hours_to_response: number | null;
  avg_rating_delta_30d: number | null;
}

interface AggregatedMetrics {
  avg_rating: number | null;
  total_incoming_30d: number;
  response_rate: number | null;
  median_hours_to_response: number | null;
  avg_rating_delta_30d: number | null;
}

interface ReviewsDashboardStripProps {
  // When set, fetch only this property's analytics. When null, fetch
  // every Channex-connected property the host owns and aggregate.
  // (See aggregation comment inside aggregateProperties().)
  propertyIds: string[];
}

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 14) return `${d.toFixed(d < 10 ? 1 : 0)}d`;
  return `${Math.round(d / 7)}w`;
}

function formatDelta(d: number | null): { label: string; tone: "up" | "down" | "flat" | "none" } {
  if (d == null) return { label: "—", tone: "none" };
  if (Math.abs(d) < 0.05) return { label: "no change", tone: "flat" };
  return { label: (d > 0 ? "+" : "") + d.toFixed(1), tone: d > 0 ? "up" : "down" };
}

// Aggregate when 'all' properties are in scope.
//   avg_rating: weighted by total_incoming
//   total_incoming_30d: sum
//   response_rate: weighted by total_incoming (so a property with 10
//     reviews and 90% response weighs more than one with 1 review at 100%)
//   median_hours_to_response: median of medians (cheap approximation;
//     true cross-property median requires the raw sample which we
//     don't expose here — acceptable given the small fleet target)
//   avg_rating_delta_30d: weighted by total_incoming
function aggregateProperties(rows: AnalyticsResponse[]): AggregatedMetrics {
  const valid = rows.filter((r) => r.total_incoming > 0);
  if (valid.length === 0) {
    return {
      avg_rating: null,
      total_incoming_30d: 0,
      response_rate: null,
      median_hours_to_response: null,
      avg_rating_delta_30d: null,
    };
  }
  const totalReviews = valid.reduce((s, r) => s + r.total_incoming, 0);
  const avg_rating = totalReviews > 0
    ? Math.round((valid.reduce((s, r) => s + r.avg_rating * r.total_incoming, 0) / totalReviews) * 10) / 10
    : null;
  const response_rate = totalReviews > 0
    ? Math.round(valid.reduce((s, r) => s + r.response_rate * r.total_incoming, 0) / totalReviews)
    : null;

  const medians = valid.map((r) => r.median_hours_to_response).filter((h): h is number => h != null);
  let median_hours_to_response: number | null = null;
  if (medians.length > 0) {
    const sorted = [...medians].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median_hours_to_response = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  const deltaRows = valid.filter((r) => r.avg_rating_delta_30d != null);
  let avg_rating_delta_30d: number | null = null;
  if (deltaRows.length > 0) {
    const totalDeltaWeight = deltaRows.reduce((s, r) => s + r.total_incoming, 0);
    if (totalDeltaWeight > 0) {
      avg_rating_delta_30d = Math.round(
        (deltaRows.reduce((s, r) => s + (r.avg_rating_delta_30d ?? 0) * r.total_incoming, 0) / totalDeltaWeight) * 10,
      ) / 10;
    }
  }

  return {
    avg_rating,
    total_incoming_30d: valid.reduce((s, r) => s + r.total_incoming_30d, 0),
    response_rate,
    median_hours_to_response,
    avg_rating_delta_30d,
  };
}

function Tile({ label, value, sublabel }: { label: string; value: React.ReactNode; sublabel?: React.ReactNode }) {
  return (
    <div
      className="bg-white p-4 flex flex-col gap-1"
      style={{ borderRadius: 14, border: "1px solid var(--dry-sand)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--golden)" }}>
        {label}
      </div>
      <div className="text-[24px] font-semibold leading-none" style={{ color: "var(--coastal)" }}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

function SkeletonTile() {
  return (
    <div
      className="bg-white p-4"
      style={{ borderRadius: 14, border: "1px solid var(--dry-sand)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="h-3 w-20 mb-2" style={{ background: "var(--dry-sand)", borderRadius: 4 }} />
      <div className="h-6 w-16" style={{ background: "var(--shore)", borderRadius: 4 }} />
    </div>
  );
}

export default function ReviewsDashboardStrip({ propertyIds }: ReviewsDashboardStripProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);

  useEffect(() => {
    let alive = true;
    if (propertyIds.length === 0) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const results = await Promise.all(
          propertyIds.map(async (pid) => {
            const res = await fetch(`/api/reviews/analytics/${pid}`);
            if (!res.ok) return null;
            return (await res.json()) as AnalyticsResponse;
          }),
        );
        if (!alive) return;
        const valid = results.filter((r): r is AnalyticsResponse => !!r);
        setMetrics(aggregateProperties(valid));
      } catch {
        if (alive) setMetrics(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [propertyIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)}
      </div>
    );
  }

  if (!metrics) return null;

  const delta = formatDelta(metrics.avg_rating_delta_30d);
  const TrendIcon = delta.tone === "up" ? TrendingUp : delta.tone === "down" ? TrendingDown : Minus;
  const trendColor =
    delta.tone === "up" ? "var(--lagoon)" :
    delta.tone === "down" ? "var(--coral-reef)" :
    "var(--tideline)";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <Tile
        label="Avg rating"
        value={metrics.avg_rating != null ? metrics.avg_rating.toFixed(1) : "—"}
        sublabel={
          delta.tone === "none" ? "30d delta — not enough data" : (
            <span className="inline-flex items-center gap-1" style={{ color: trendColor }}>
              <TrendIcon size={11} />
              <span className="font-semibold">{delta.label}</span>
              <span style={{ color: "var(--tideline)" }}>vs prior 30d</span>
            </span>
          )
        }
      />
      <Tile
        label="Reviews · 30d"
        value={metrics.total_incoming_30d}
        sublabel="rolling 30 days"
      />
      <Tile
        label="Response rate"
        value={metrics.response_rate != null ? `${metrics.response_rate}%` : "—"}
        sublabel="lifetime"
      />
      <Tile
        label="Median reply time"
        value={formatHours(metrics.median_hours_to_response)}
        sublabel={metrics.median_hours_to_response == null ? "fewer than 5 replies in 30d" : "rolling 30d"}
      />
    </div>
  );
}
