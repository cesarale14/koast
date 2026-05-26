"use client";

/**
 * useAuditPoll — between-turns polling hook for the chat audit
 * indicator (M8 C8 substrate Step F; M13 Phase 1.A pause-condition revision).
 *
 * Polls /api/audit-feed/since at a moderate interval when the host is
 * on an inspect-mode route (not chat-primary) and the tab is visible.
 * Pauses when:
 * - pathname is chat-primary (`/` or `/chat/*`) — host is engaged in
 *   the chat surface; in-conversation streaming covers updates there
 * - document.visibilityState === 'hidden' (tab backgrounded)
 *
 * M13 Phase 1.A revision: the prior pause-on-`state.expanded` condition
 * is replaced with pause-on-chat-primary-pathname. The reducer no longer
 * tracks `expanded` (UI surface is pathname-derived); the polling
 * semantic-equivalent is "pause when on the chat surface."
 *
 * On response with new events, dispatches AUDIT_TICK with the count and
 * newest timestamp. The store's reducer (chatReducer.ts) updates
 * unreadAuditCount + lastSeenAuditTs; MiniChatBack reads unreadAuditCount
 * and renders the badge.
 *
 * Lifecycle:
 * - First poll fires immediately on mount (when not paused)
 * - Subsequent polls every POLL_INTERVAL_MS
 * - AbortController cancels in-flight fetch on cleanup
 * - Effect re-creates on pathname / tabHidden change (resume from paused)
 *
 * Round-2 deferred: persistent last_seen_inspect_at across sessions
 * (currently in-memory only — first poll on a fresh page load uses NOW()
 * as the baseline timestamp; the host doesn't see events from before
 * the page load). Tracked for M8 close or M9.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChatStore } from "./ChatStore";
import { isChatPrimary } from "@/lib/chat/isChatPrimary";

const POLL_INTERVAL_MS = 90 * 1000; // 90s — Round-2 confirms; v1.4 D2 says 60-120s

type AuditEvent = {
  occurred_at: string;
  category: string;
  summary: string;
  source_table: string;
  source_id: string;
};

type AuditFeedResponse = {
  events: AuditEvent[];
  newest_ts: string | null;
  has_more: boolean;
};

export function useAuditPoll() {
  const { state, dispatch } = useChatStore();
  const pathname = usePathname();
  const onChatPrimary = isChatPrimary(pathname);

  // Track tab visibility so the polling effect can pause when backgrounded
  // and resume when foregrounded. SSR guard: document undefined on server.
  const [tabHidden, setTabHidden] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.visibilityState === "hidden";
  });

  // Ref to lastSeenAuditTs so the polling closure reads the latest value
  // without re-creating the interval on every AUDIT_TICK dispatch.
  const lastSeenAuditTsRef = useRef<string | null>(state.lastSeenAuditTs);
  useEffect(() => {
    lastSeenAuditTsRef.current = state.lastSeenAuditTs;
  }, [state.lastSeenAuditTs]);

  // Visibility change listener
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      setTabHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Polling effect — pauses when on chat-primary route or tab hidden
  useEffect(() => {
    if (onChatPrimary) return;
    if (tabHidden) return;

    const abortController = new AbortController();

    const poll = async () => {
      // Baseline ts: stored last-seen, else NOW (first poll on fresh
      // page load uses NOW as the anchor; the empty-response branch
      // below baselines lastSeenAuditTs to ts so subsequent polls
      // accumulate from page-load forward).
      const ts =
        lastSeenAuditTsRef.current ?? new Date().toISOString();
      try {
        const resp = await fetch(
          `/api/audit-feed/since?ts=${encodeURIComponent(ts)}&limit=20`,
          { signal: abortController.signal },
        );
        if (!resp.ok) return; // silent fail; next interval retries
        const data = (await resp.json()) as AuditFeedResponse;
        if (data.events && data.events.length > 0 && data.newest_ts) {
          dispatch({
            type: "AUDIT_TICK",
            newCount: data.events.length,
            latestTs: data.newest_ts,
          });
        } else if (lastSeenAuditTsRef.current === null) {
          // Step F.1 first-poll baseline: anchor lastSeenAuditTs to the
          // poll's ts even when no events landed. Without this, every
          // subsequent poll uses NOW (still null in store), and events
          // landing between polls get missed because the next poll's
          // ts moves forward past them.
          dispatch({
            type: "AUDIT_TICK",
            newCount: 0,
            latestTs: ts,
          });
        }
      } catch {
        // Aborted (cleanup) or network error — silent fail.
      }
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      abortController.abort();
      clearInterval(intervalId);
    };
  }, [onChatPrimary, tabHidden, dispatch]);
}
