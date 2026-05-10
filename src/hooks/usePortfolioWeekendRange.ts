"use client";

/**
 * usePortfolioWeekendRange — M8 C2 (D8).
 *
 * Fans out across the host's property IDs, pulls each property's pending
 * recommendations, filters to upcoming weekend dates (Fri + Sat) inside
 * the window, and runs `deriveWeekendRange` on the merged cohort to
 * produce the Dashboard hero's confidence-banded range.
 *
 * Per C2 sign-off (Round-2 R-5): client-side fan-out across existing
 * `/api/pricing/recommendations/[propertyId]?status=pending` routes; no
 * new portfolio-aggregation endpoint. CF (M9 candidate) ships a server
 * endpoint when host count makes N fan-out a perf concern.
 *
 * Weekend definition: Fri + Sat nights (`getDay() === 5 || 6`). Standard
 * STR weekend premium nights; Sun shoulder excluded. Tracked as a config-
 * driven extension in the M9 retrospective.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deriveWeekendRange,
  type ConfidenceBandedRangeValue,
  type RangeInputRec,
} from "@/lib/pricing/range";

interface PendingRecForRange extends RangeInputRec {
  date: string;
}

export interface UsePortfolioWeekendRangeResult {
  range: ConfidenceBandedRangeValue | null;
  /** Cohort size after weekend + forward-window filter, BEFORE threshold check.
   *  Caller passes this to ConfidenceBandedRange so the Tracking copy can
   *  compute "~N more weekends needed". */
  cohortSize: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function isUpcomingWeekend(dateStr: string, now: Date, windowDays: number): boolean {
  // Date strings from the API are YYYY-MM-DD; parse as UTC-anchored to avoid
  // tz drift around midnight boundaries. Weekend check uses getUTCDay.
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return false;
  if (d.getTime() < now.getTime()) return false;
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  if (d.getTime() > horizon.getTime()) return false;
  const dow = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  return dow === 5 || dow === 6;
}

export function usePortfolioWeekendRange(
  propertyIds: string[],
  options: { windowDays?: number } = {},
): UsePortfolioWeekendRangeResult {
  const windowDays = options.windowDays ?? 90;
  const [range, setRange] = useState<ConfidenceBandedRangeValue | null>(null);
  const [cohortSize, setCohortSize] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(propertyIds.length > 0);
  const [error, setError] = useState<Error | null>(null);
  const aliveRef = useRef(true);
  const idsKey = propertyIds.join("|");

  const run = useCallback(async () => {
    setError(null);
    if (propertyIds.length === 0) {
      setRange(null);
      setCohortSize(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        propertyIds.map(async (pid) => {
          const res = await fetch(
            `/api/pricing/recommendations/${pid}?status=pending&limit=500`,
            { credentials: "include" },
          );
          if (!res.ok) return [] as PendingRecForRange[];
          const json = (await res.json()) as { recommendations?: PendingRecForRange[] };
          return json.recommendations ?? [];
        }),
      );
      if (!aliveRef.current) return;
      const now = new Date();
      const cohort = results
        .flat()
        .filter((r) => isUpcomingWeekend(r.date, now, windowDays));
      const derived = deriveWeekendRange(cohort, { time_period_days: windowDays });
      setRange(derived);
      setCohortSize(cohort.length);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setRange(null);
      setCohortSize(0);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [idsKey, windowDays]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    aliveRef.current = true;
    void run();
    return () => {
      aliveRef.current = false;
    };
  }, [run]);

  return { range, cohortSize, loading, error, refetch: run };
}
