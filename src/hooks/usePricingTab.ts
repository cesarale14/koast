/**
 * usePricingTab — single integration surface for the future Pricing tab UI.
 *
 * Composes the three read APIs + rules into one React hook. Parallelizes
 * the fetches, implements stale-while-revalidate (returns cached data
 * immediately if we have it, fetches fresh in background, updates on
 * completion).
 *
 * The UI layer (shipped in the polish pass) should ONLY talk to this
 * hook. If a component needs a different shape, extend the hook's
 * return type or add a new option — don't bypass to the raw routes.
 *
 * VERIFY: see scripts/test-use-pricing-tab.ts (run once during PR D
 * verification; delete after).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PricingRules {
  id: string;
  property_id: string;
  base_rate: number;
  min_rate: number;
  max_rate: number;
  channel_markups: Record<string, number>;
  max_daily_delta_pct: number;
  comp_floor_pct: number;
  seasonal_overrides: Record<string, unknown>;
  auto_apply: boolean;
  source: "defaults" | "inferred" | "host_set";
  inferred_from: unknown;
}

export interface PricingRecommendation {
  id: string;
  property_id: string;
  date: string;
  current_rate: number | null;
  suggested_rate: number;
  delta_abs: number | null;
  delta_pct: number | null;
  urgency: "act_now" | "coming_up" | "review" | null;
  reason_text: string | null;
  status: "pending" | "applied" | "dismissed";
  reason_signals: Record<string, unknown>;
  created_at: string;
  applied_at: string | null;
  dismissed_at: string | null;
}

export interface PerformanceSummary {
  window_days: number;
  applied_count: number;
  booked_count: number;
  dismissed_count: number;
  acceptance_rate: number | null;
  revenue_captured: number;
  revenue_delta_vs_suggested: number;
  avg_applied_delta_pct: number | null;
  by_date: Array<{
    date: string;
    suggested_rate: number | null;
    applied_rate: number | null;
    actual_rate_if_booked: number | null;
    booked: boolean;
  }>;
}

export interface UsePricingTabResult {
  rules: PricingRules | null;
  recommendations: { pending: PricingRecommendation[]; applied: PricingRecommendation[] };
  performance: PerformanceSummary | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Module-level cache for stale-while-revalidate. Keyed by propertyId +
// performanceWindow so callers with different windows don't collide.
const cache = new Map<string, {
  rules: PricingRules | null;
  recommendations: { pending: PricingRecommendation[]; applied: PricingRecommendation[] };
  performance: PerformanceSummary | null;
  fetchedAt: number;
}>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`${url} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function usePricingTab(
  propertyId: string,
  options: { performanceWindow?: number } = {}
): UsePricingTabResult {
  const perfWindow = options.performanceWindow ?? 30;
  const cacheKey = `${propertyId}::${perfWindow}`;
  const cached = cache.get(cacheKey);

  const [state, setState] = useState<{
    rules: PricingRules | null;
    recommendations: { pending: PricingRecommendation[]; applied: PricingRecommendation[] };
    performance: PerformanceSummary | null;
  }>(() => ({
    rules: cached?.rules ?? null,
    recommendations: cached?.recommendations ?? { pending: [], applied: [] },
    performance: cached?.performance ?? null,
  }));
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<Error | null>(null);
  const aliveRef = useRef(true);

  const run = useCallback(async () => {
    try {
      setError(null);
      const [rulesRes, pendingRes, appliedRes, perfRes] = await Promise.all([
        fetchJson<{ rules: PricingRules }>(`/api/pricing/rules/${propertyId}`),
        fetchJson<{ recommendations: PricingRecommendation[] }>(
          `/api/pricing/recommendations/${propertyId}?status=pending`
        ),
        fetchJson<{ recommendations: PricingRecommendation[] }>(
          `/api/pricing/recommendations/${propertyId}?status=applied&limit=30`
        ),
        fetchJson<PerformanceSummary>(
          `/api/pricing/performance/${propertyId}?window=${perfWindow}`
        ),
      ]);
      if (!aliveRef.current) return;
      const next = {
        rules: rulesRes.rules,
        recommendations: {
          pending: pendingRes.recommendations ?? [],
          applied: appliedRes.recommendations ?? [],
        },
        performance: perfRes,
      };
      cache.set(cacheKey, { ...next, fetchedAt: Date.now() });
      setState(next);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [propertyId, perfWindow, cacheKey]);

  useEffect(() => {
    aliveRef.current = true;
    void run();
    return () => {
      aliveRef.current = false;
    };
  }, [run]);

  return {
    rules: state.rules,
    recommendations: state.recommendations,
    performance: state.performance,
    loading,
    error,
    refetch: run,
  };
}
