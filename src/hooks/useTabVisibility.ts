"use client";

/**
 * useTabVisibility — M8 C6 (D12).
 *
 * Stale-while-revalidate hook for the sidebar's conditional-tab map.
 *
 *   - Initial render: hydrate from localStorage if a fresh (<24h) cache
 *     exists, otherwise return EMPTY_TAB_VISIBILITY (all conditional
 *     tabs hidden until the predicate fetch resolves). Repeat visits
 *     therefore have no flicker; first-ever visit silently fills in.
 *   - On mount: fetch /api/dashboard/tab-visibility once. No interval;
 *     tab visibility is not real-time-sensitive (R-2 sign-off).
 *   - On success: update state + write fresh cache to localStorage.
 *   - On failure: keep whatever's in state (cached or empty); log to
 *     console for browser-side observability.
 *
 * The fetch path quietly tolerates 401 (anonymous before auth resolves),
 * 5xx (transient), and any thrown error — the substrate-required tabs
 * remain visible regardless.
 */

import { useEffect, useState } from "react";
import {
  EMPTY_TAB_VISIBILITY,
  TAB_VISIBILITY_LOCALSTORAGE_KEY,
  parseTabVisibilityCache,
  serializeTabVisibilityCache,
  type TabVisibility,
} from "@/lib/tab-visibility";

function readCachedVisibility(): TabVisibility {
  if (typeof window === "undefined") return EMPTY_TAB_VISIBILITY;
  try {
    const raw = window.localStorage.getItem(TAB_VISIBILITY_LOCALSTORAGE_KEY);
    return parseTabVisibilityCache(raw) ?? EMPTY_TAB_VISIBILITY;
  } catch {
    return EMPTY_TAB_VISIBILITY;
  }
}

function writeCachedVisibility(v: TabVisibility): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TAB_VISIBILITY_LOCALSTORAGE_KEY,
      serializeTabVisibilityCache(v),
    );
  } catch {
    // Quota / disabled — ignore; cached path is opt-in correctness.
  }
}

export interface UseTabVisibilityResult {
  visibility: TabVisibility;
  /** True until the network fetch settles (regardless of cache hit). Callers
   *  that need to wait for the authoritative result can read this; the
   *  layout doesn't, because the cached/empty state is renderable. */
  loading: boolean;
}

export function useTabVisibility(): UseTabVisibilityResult {
  const [visibility, setVisibility] = useState<TabVisibility>(readCachedVisibility);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/tab-visibility", {
          credentials: "include",
        });
        if (!res.ok) {
          if (alive) setLoading(false);
          return;
        }
        const json = (await res.json()) as Partial<TabVisibility>;
        if (!alive) return;
        const next: TabVisibility = {
          calendar: Boolean(json.calendar),
          reviews: Boolean(json.reviews),
          turnovers: Boolean(json.turnovers),
          market_intel: Boolean(json.market_intel),
          comp_sets: Boolean(json.comp_sets),
        };
        setVisibility(next);
        writeCachedVisibility(next);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[useTabVisibility] fetch failed", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { visibility, loading };
}
