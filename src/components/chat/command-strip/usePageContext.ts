"use client";

/**
 * usePageContext — React hook wrapper over derivePageContext. Reads the live
 * pathname + query string and returns the agent page-context hints the docked
 * command strip sends on every message (P2.1).
 *
 * Uses usePathname (the layout already depends on it) plus a client-only read
 * of window.location.search — deliberately NOT useSearchParams, which forces a
 * static-render bailout / Suspense boundary. The query string is populated
 * after mount and re-read on every navigation (pathname dependency); the strip
 * only submits on user action, well after the first paint, so the hints are
 * present by send time.
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { derivePageContext, type PageContext } from "./pageContext";

export function usePageContext(): PageContext {
  const pathname = usePathname() ?? "/";
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  return useMemo(
    () => derivePageContext(pathname, new URLSearchParams(search)),
    [pathname, search],
  );
}
