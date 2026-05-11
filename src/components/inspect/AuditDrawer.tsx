"use client";

/**
 * AuditDrawer — M8 Phase G C4 (D16 + D17d).
 *
 * Right-anchored overlay drawer; opens on topbar audit icon click,
 * dismisses on backdrop / Escape / X button. Renders the host's
 * unified audit feed via F9 helper consumed by the existing
 * `/api/audit-feed/list` endpoint. Reuses ActivityFeed + ActivityEvent
 * components from C5 for single-source-of-truth rendering.
 *
 * Reversibility per category (per C4 sign-off):
 *   memory_write (with supersession metadata) → Restore affordance
 *     handled inside ActivityEvent (existing M6 substrate)
 *   rate_push → informational-only at M8 (D17d hedge; revert is M9)
 *   guest_message / sms / pricing_outcome / other → informational
 *
 * Drawer-open triggers POST /api/audit-feed/mark-seen, clearing the
 * topbar badge via the host_state.last_seen_inspect_at upsert. Parent
 * is responsible for refetching the unread-count after mark-seen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AuditEvent } from "@/lib/audit-feed";
import { ActivityFeed } from "./ActivityFeed";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after mark-seen succeeds. Parent typically refetches the
   *  unread-count and clears the topbar badge. */
  onMarkSeen?: () => void;
};

type State = {
  events: AuditEvent[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: State = {
  events: [],
  nextCursor: null,
  loading: true,
  error: null,
};

export function AuditDrawer({ open, onClose, onMarkSeen }: Props) {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const inflightAbort = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchPage = useCallback(async (cursor: string | null) => {
    inflightAbort.current?.abort();
    const ac = new AbortController();
    inflightAbort.current = ac;
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const url = `/api/audit-feed/list${params.toString() ? `?${params}` : ""}`;
    const resp = await fetch(url, { signal: ac.signal, credentials: "include" });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}${detail ? ` — ${detail}` : ""}`);
    }
    return (await resp.json()) as {
      events: AuditEvent[];
      next_cursor: string | null;
    };
  }, []);

  // First-open: fetch + mark seen. Subsequent opens within the same
  // mount: refetch is cheap and keeps the drawer up-to-date if the
  // host opens, closes, and re-opens after new events arrive.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchPage(null)
      .then((data) => {
        if (cancelled) return;
        setState({
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
          error: "Couldn't load the audit log. Try closing and reopening.",
        }));
      });
    // Mark seen exactly once per open. Failure doesn't block the
    // drawer render — the badge will still clear on next successful
    // mark-seen attempt; the unread count is a UI hint, not load-bearing.
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void fetch("/api/audit-feed/mark-seen", {
        method: "POST",
        credentials: "include",
      })
        .then((r) => {
          if (r.ok) onMarkSeen?.();
        })
        .catch(() => {
          /* non-critical */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, fetchPage, onMarkSeen]);

  // Reset the once-per-open guard when the drawer closes so the next
  // open re-fires mark-seen against any new events that landed while
  // the drawer was closed.
  useEffect(() => {
    if (!open) hasFetchedRef.current = false;
  }, [open]);

  // Escape-to-close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const onLoadMore = useCallback(() => {
    if (state.loading || !state.nextCursor) return;
    setState((s) => ({ ...s, loading: true }));
    fetchPage(state.nextCursor)
      .then((data) => {
        setState((s) => ({
          events: [...s.events, ...data.events],
          nextCursor: data.next_cursor,
          loading: false,
          error: null,
        }));
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState((s) => ({
          ...s,
          loading: false,
          error: "Couldn't load more events.",
        }));
      });
  }, [state.loading, state.nextCursor, fetchPage]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close audit log"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(14,34,24,0.30)",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "default",
          zIndex: 80,
        }}
      />
      <aside
        role="dialog"
        aria-label="Audit log"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "var(--shore)",
          borderLeft: "1px solid var(--hairline)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.10)",
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          animation: "slide-in-right 200ms ease-out",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: "var(--deep-sea)",
              letterSpacing: "-0.01em",
            }}
          >
            Audit log
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              borderRadius: 6,
              color: "var(--tideline)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--shore-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px 20px" }}>
          {state.error ? (
            <p
              style={{
                margin: "16px 12px",
                fontSize: 13,
                color: "var(--coral-reef)",
              }}
            >
              {state.error}
            </p>
          ) : (
            <ActivityFeed
              filter="all"
              events={state.events}
              nextCursor={state.nextCursor}
              loading={state.loading}
              error={null}
              onLoadMore={onLoadMore}
            />
          )}
        </div>

        <footer
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--hairline)",
            textAlign: "center",
            fontSize: 12,
          }}
        >
          <Link
            href="/koast/inspect/activity"
            onClick={onClose}
            style={{
              color: "var(--coastal)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            View all activity →
          </Link>
        </footer>
      </aside>
      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
