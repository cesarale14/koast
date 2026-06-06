"use client";

/**
 * MiniChatBack — the back-to-chat affordance on inspect-mode surfaces
 * (M13 Phase 1.A; operator msg 3515 Q3 + msg 3518 Q3 spec lock).
 *
 * - Desktop (>= 768px): slim top-strip ~36px high; "Koast is here" framing
 *   with unread audit badge; entire strip is clickable → navigates to `/`.
 * - Mobile (< 768px): 48px FAB at bottom-right; same affordance.
 *
 * This is the navigation back-affordance, NOT a UI state toggle. Returning
 * to the chat surface = navigate to `/`, which causes the pathname-derived
 * layout (`(dashboard)/layout.tsx`) to mount `ChatPrimarySurface`.
 *
 * Why the framing matters (Q3 spec): "Koast is here" preserves the
 * Belief 2 inversion experience even when the host has navigated to an
 * inspect surface — the agent is the spine; the inspect surface is the
 * lens. The strip is non-modal, never dismissable, and never expands
 * inline (no overlay-on-click; the old M8 C8 Step D pattern is retired).
 *
 * Reads `unreadAuditCount` from the chat store; renders a badge when > 0.
 */

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useChatStore } from "./ChatStore";

export function MiniChatBack() {
  const { state } = useChatStore();
  const unreadCount = state.unreadAuditCount;

  const badge =
    unreadCount > 0 ? (
      <span
        className="ml-2 min-w-[20px] h-[20px] px-1.5 rounded-full inline-flex items-center justify-center text-[11px] font-semibold"
        style={{
          backgroundColor: "var(--koast-trench)",
          color: "var(--deep-sea)",
        }}
        aria-hidden="true"
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  const ariaLabel =
    unreadCount > 0
      ? `Return to Koast — ${unreadCount} new ${unreadCount === 1 ? "update" : "updates"}`
      : "Return to Koast";

  return (
    <>
      {/* Desktop: slim top-strip */}
      <Link
        href="/"
        className="hidden md:flex fixed top-0 left-0 right-0 z-40 items-center justify-center gap-2 text-white transition-colors"
        style={{
          height: "36px",
          backgroundColor: "var(--deep-sea)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          paddingLeft: "60px",
        }}
        aria-label={ariaLabel}
      >
        <MessageCircle size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="text-[13px] font-medium">Koast is here</span>
        {badge}
      </Link>

      {/* Mobile: 48px FAB bottom-right */}
      <Link
        href="/"
        className="md:hidden fixed z-40 flex items-center justify-center text-white"
        style={{
          right: "16px",
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          width: "48px",
          height: "48px",
          borderRadius: "24px",
          backgroundColor: "var(--deep-sea)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        }}
        aria-label={ariaLabel}
      >
        <MessageCircle size={22} strokeWidth={1.5} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full inline-flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: "var(--koast-trench)",
              color: "var(--deep-sea)",
              boxShadow: "0 0 0 2px var(--deep-sea)",
            }}
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    </>
  );
}
