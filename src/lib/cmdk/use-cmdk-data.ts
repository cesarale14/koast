"use client";

/**
 * useCmdKData — client-side fetch + module-scoped cache for the
 * dynamic Cmd+K entries (properties + recent conversations).
 *
 * Module-scoped cache is intentional: the palette is opened many
 * times per session, but the underlying data (host's properties +
 * recent conversation list) rarely changes mid-session. Caching at
 * module scope means re-opens cost ~0; we refresh after a 5-minute
 * TTL or on explicit invalidation (future hook — not wired at 1.B).
 *
 * Statics (routes + actions) are imported directly — no fetch.
 *
 * Returned shape:
 *   { entries: CmdKEntry[] | null, loading: boolean, error: string | null }
 * — `entries` is null until first fetch settles; once settled it
 *   contains the merged dynamic + static catalog.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CmdKEntry } from "./types";
import { STATIC_ROUTES, STATIC_ACTIONS } from "./static";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheState = {
  entries: CmdKEntry[];
  fetchedAt: number;
};

// Module-scoped — survives palette open/close cycles, NOT page navs.
// (Next.js client-component module instances are stable across route
// changes within the same SPA session, which is what we want — the
// host re-opening Cmd+K on /calendar should not re-fetch.)
let cache: CacheState | null = null;
let inFlight: Promise<CmdKEntry[]> | null = null;

async function fetchEntries(): Promise<CmdKEntry[]> {
  const res = await fetch("/api/cmdk/index", {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`cmdk fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { entries?: CmdKEntry[] };
  return body.entries ?? [];
}

function isCacheFresh(c: CacheState | null): c is CacheState {
  if (c === null) return false;
  return Date.now() - c.fetchedAt < TTL_MS;
}

function combine(dynamic: CmdKEntry[]): CmdKEntry[] {
  return [...dynamic, ...STATIC_ROUTES, ...STATIC_ACTIONS];
}

export function useCmdKData(enabled: boolean): {
  entries: CmdKEntry[] | null;
  loading: boolean;
  error: string | null;
} {
  const [entries, setEntries] = useState<CmdKEntry[] | null>(() =>
    isCacheFresh(cache) ? combine(cache.entries) : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (isCacheFresh(cache)) {
      setEntries(combine(cache.entries));
      return;
    }
    // Dedupe — if a fetch is in flight, await it instead of starting another.
    setLoading(true);
    setError(null);
    try {
      if (!inFlight) {
        inFlight = fetchEntries();
      }
      const fetched = await inFlight;
      cache = { entries: fetched, fetchedAt: Date.now() };
      if (mountedRef.current) {
        setEntries(combine(fetched));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      if (mountedRef.current) setError(msg);
      // Static catalog still usable; surface what we have.
      if (mountedRef.current) setEntries(combine([]));
    } finally {
      inFlight = null;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { entries, loading, error };
}

/**
 * Invalidate the module cache so the NEXT palette open refetches.
 *
 * M13 Phase 1.B follow-on: called when a new conversation is created
 * (the first-send anchor) so Cmd+K recents reflect it without waiting
 * out the 5-minute TTL. Cheap — just drops the cache; the next
 * useCmdKData(enabled) consumer refetches on open. Does NOT trigger a
 * fetch itself (the palette is lazy; no point fetching while it's
 * closed).
 */
export function invalidateCmdKData(): void {
  cache = null;
  inFlight = null;
}

/** Test-only alias — kept for existing jest imports. */
export function __resetCmdKCacheForTests(): void {
  invalidateCmdKData();
}
