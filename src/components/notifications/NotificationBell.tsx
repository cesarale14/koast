"use client";

/**
 * NotificationBell (P2.4) — the host bell goes live. Polls the unread count for
 * the badge; opening the panel lists the curated host_notifications feed with
 * per-item read + deep-links + mark-all-read. In-app only (host web-push reuses
 * the cleaner infra in a later phase).
 *
 * Self-contained: drop it into the topbar in place of the old dead <Bell>.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { describeHostNotification, PROPOSALS_CHANGED_EVENT } from "@/lib/notifications/describe";
import type { NormalizedHostNotification } from "@/lib/notifications/host-feed";

const POLL_MS = 60_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NormalizedHostNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      const d = await res.json().catch(() => ({}));
      setCount(typeof d?.count === "number" ? d.count : 0);
    } catch {
      /* keep last */
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      const d = await res.json().catch(() => ({}));
      setItems(Array.isArray(d?.notifications) ? (d.notifications as NormalizedHostNotification[]) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the badge.
  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, POLL_MS);
    return () => clearInterval(id);
  }, [loadCount]);

  // Load the list when the panel opens.
  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function openItem(n: NormalizedHostNotification) {
    const { href } = describeHostNotification(n);
    if (!n.readAt) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, readAt: new Date().toISOString() } : it)));
      setCount((c) => Math.max(0, c - 1));
      fetch(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    setOpen(false);
    router.push(href);
    // Deep-linking a proposal lands on "/", but router.push("/") is a no-op when
    // the host is ALREADY there — so nudge TodaySuggests to refetch its pending
    // list directly. Without this, tapping "Koast has a suggestion" from the
    // Today home wouldn't surface the new card.
    if (n.type === "proposal_created" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(PROPOSALS_CHANGED_EVENT));
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() })));
    setCount(0);
    await fetch("/api/notifications/mark-all-read", { method: "POST" }).catch(() => {});
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Notifications — ${count} unread` : "Notifications"}
        className="relative transition-colors p-1.5 rounded-lg"
        style={{ color: "var(--tideline)" }}
      >
        <Bell size={20} strokeWidth={1.5} />
        {count > 0 && (
          <span
            className="absolute top-0 right-0 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: "var(--coral-reef)", boxShadow: "0 0 0 2px white" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "white",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(19,46,32,0.16)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--deep-sea)", fontSize: 14 }}>Notifications</span>
            {items.some((i) => !i.readAt) && (
              <button
                onClick={markAll}
                style={{ fontSize: 12, fontWeight: 600, color: "var(--coastal)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 16, color: "var(--tideline)", fontSize: 14 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 20, color: "var(--tideline)", fontSize: 14, textAlign: "center" }}>
              You&apos;re all caught up.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((n) => {
                const d = describeHostNotification(n);
                const unread = !n.readAt;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "12px 14px",
                        borderBottom: "1px solid var(--shore-soft)",
                        background: unread ? "var(--shore-soft)" : "white",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 99,
                          marginTop: 6,
                          flexShrink: 0,
                          background: unread ? "var(--lume)" : "transparent",
                        }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: unread ? 600 : 500, color: "var(--deep-sea)" }}>
                          {d.title}
                        </span>
                        {d.sub && (
                          <span style={{ display: "block", fontSize: 13, color: "var(--tideline)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.sub}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--tideline)", flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
