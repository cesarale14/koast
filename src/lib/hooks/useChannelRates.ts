"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChannelDateEntry = {
  rate: number | null;
  availability: number | null;
  min_stay_arrival: number | null;
  stop_sell: boolean;
  stored_rate: number | null;
  mismatch: boolean;
  source: "channex" | "channex+db";
};

export type ChannelBlock = {
  channel_code: string;
  channel_name: string;
  rate_plan_id: string | null;
  status: string;
  editable: boolean;
  read_only_reason?: string;
  needs_setup?: boolean;
  setup_hint?: string;
  dates: Record<string, ChannelDateEntry>;
};

export type ChannelRatesResponse = {
  base: Record<string, {
    base_rate: number | null;
    suggested_rate: number | null;
    applied_rate: number | null;
    min_stay: number | null;
  }>;
  channels: ChannelBlock[];
  fetched_at: string;
  cache_hit: boolean;
  channex_error?: string | null;
};

type State = {
  data: ChannelRatesResponse | null;
  loading: boolean;
  error: string | null;
};

/**
 * Fetches live per-channel rates from /api/channels/rates/[propertyId] for
 * the selected date range. One request per (propertyId, dateFrom, dateTo);
 * in-flight requests are deduped and stale requests cancelled via
 * AbortController.
 *
 * The hook doesn't cache across hook instances — server-side cache (5 min)
 * is what keeps Channex calls down. Each new date selection re-fetches.
 */
export function useChannelRates(
  propertyId: string | null,
  dateFrom: string | null,
  dateTo: string | null
) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);
  // Tracks whether we should honor an in-flight response when it resolves.
  // If the user clicks a new date before the old fetch returns, we cancel
  // and discard the old one.
  const activeKeyRef = useRef<string | null>(null);

  const fetchRates = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!propertyId || !dateFrom || !dateTo) {
        setState({ data: null, loading: false, error: null });
        return;
      }

      const key = `${propertyId}|${dateFrom}|${dateTo}`;
      activeKeyRef.current = key;

      // Cancel any outstanding request
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;

      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const qs = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          ...(opts?.refresh ? { refresh: "1" } : {}),
        }).toString();
        const res = await fetch(`/api/channels/rates/${propertyId}?${qs}`, {
          signal: ctl.signal,
        });

        if (activeKeyRef.current !== key) return; // stale

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState({ data: null, loading: false, error: body.error ?? `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as ChannelRatesResponse;
        setState({ data, loading: false, error: null });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (activeKeyRef.current !== key) return;
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Fetch failed" });
      }
    },
    [propertyId, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchRates();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchRates]);

  const refresh = useCallback(() => fetchRates({ refresh: true }), [fetchRates]);

  // Optimistic update — caller bumps the local cache after a successful save
  // so the sync indicator flips to "in sync" before the next live re-fetch.
  const patchChannelRate = useCallback(
    (channelCode: string, date: string, newRate: number) => {
      setState((prev) => {
        if (!prev.data) return prev;
        const channels = prev.data.channels.map((ch) => {
          if (ch.channel_code !== channelCode) return ch;
          const dates = { ...ch.dates };
          const existing = dates[date];
          if (existing) {
            dates[date] = {
              ...existing,
              rate: newRate,
              stored_rate: newRate,
              mismatch: false,
              source: "channex+db",
            };
          }
          return { ...ch, dates };
        });
        return { ...prev, data: { ...prev.data, channels } };
      });
    },
    []
  );

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refresh,
    patchChannelRate,
  };
}
