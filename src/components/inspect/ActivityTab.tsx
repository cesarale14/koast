"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AuditEvent, AuditFeedFilter } from "@/lib/audit-feed";
import { ActivityFilterChips } from "./ActivityFilterChips";
import { ActivityFeed } from "./ActivityFeed";

type Props = {
  initialFilter: AuditFeedFilter;
  initialEvents: AuditEvent[];
  initialNextCursor: string | null;
};

type FetchState = {
  filter: AuditFeedFilter;
  events: AuditEvent[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

export function ActivityTab({
  initialFilter,
  initialEvents,
  initialNextCursor,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<FetchState>({
    filter: initialFilter,
    events: initialEvents,
    nextCursor: initialNextCursor,
    loading: false,
    error: null,
  });

  // Treat URL filter param as source of truth — keeps refresh + share
  // semantics. When it changes (chip click), refetch from page 1.
  const urlFilter = (searchParams.get("filter") ?? "all") as AuditFeedFilter;
  const inflightAbort = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (filter: AuditFeedFilter, cursor: string | null) => {
      inflightAbort.current?.abort();
      const ac = new AbortController();
      inflightAbort.current = ac;
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (cursor) params.set("cursor", cursor);
      const url = `/api/audit-feed/list${params.toString() ? `?${params}` : ""}`;
      const resp = await fetch(url, { signal: ac.signal });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}${detail ? ` — ${detail}` : ""}`);
      }
      return (await resp.json()) as {
        events: AuditEvent[];
        next_cursor: string | null;
      };
    },
    [],
  );

  // Refetch from page 1 when URL filter changes.
  useEffect(() => {
    if (urlFilter === state.filter) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchPage(urlFilter, null)
      .then((data) => {
        if (cancelled) return;
        setState({
          filter: urlFilter,
          events: data.events,
          nextCursor: data.next_cursor,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setState((s) => ({
          ...s,
          loading: false,
          error:
            "Couldn’t load activity. The feed is read-only — try again, or reload.",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [urlFilter, state.filter, fetchPage]);

  const onChipChange = useCallback(
    (filter: AuditFeedFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (filter === "all") {
        params.delete("filter");
      } else {
        params.set("filter", filter);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadMore = useCallback(async () => {
    if (state.loading || !state.nextCursor) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchPage(state.filter, state.nextCursor);
      setState((s) => ({
        ...s,
        events: [...s.events, ...data.events],
        nextCursor: data.next_cursor,
        loading: false,
      }));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setState((s) => ({
        ...s,
        loading: false,
        error:
          "Couldn’t load activity. The feed is read-only — try again, or reload.",
      }));
    }
  }, [state.filter, state.loading, state.nextCursor, fetchPage]);

  return (
    <div>
      <ActivityFilterChips active={state.filter} onChange={onChipChange} />
      <div className="mt-5">
        <ActivityFeed
          filter={state.filter}
          events={state.events}
          nextCursor={state.nextCursor}
          loading={state.loading}
          error={state.error}
          onLoadMore={loadMore}
        />
      </div>
    </div>
  );
}
