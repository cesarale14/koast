"use client";

/**
 * ChatBar — bottom-anchored resting-state surface for the persistent
 * chat panel (M8 C8 substrate Step B).
 *
 * Per M8 conventions v1.3 D1 geometry: bottom-anchored expandable bar
 * across all viewports. Resting state shows compact affordance + active
 * conversation status + unread audit indicator. Tap dispatches EXPAND;
 * the expanded surface (ChatClient, Step C) takes the screen.
 *
 * Z-index 40 per conventions v1.4 §6.4. Above sidebar/topbar (z-30/40);
 * below toasts (z-50) and modals (z-60+).
 *
 * Voice doctrine compliance:
 * - §1.3 (voice has weight): direct, names the agent ("Koast"), no chipper
 *   "✨ New activity!" framing, no corporate "Reach out" copy
 * - §3.2.1 (confirmed knowledge style): "Koast is responding…" /
 *   "Koast is using a tool…" — plain assertion of in-flight state from
 *   the bridged turn state, no hedging
 * - §5.4 / §5.5 anti-patterns: rejected at draft time; no "Hi! 👋", no
 *   "Reach out to our team" phrasing
 *
 * Round-2 follow-up (per Step B sign-off note from Cesar): tool-call
 * lifecycle granularity may flicker if a turn has streaming-between-tools
 * windows shorter than ~500ms. Debounce in the bar is a future Round-2
 * if real interleaved patterns surface; non-blocking for M8 ship.
 */

import { MessageCircle } from "lucide-react";
import { useChatStore } from "./ChatStore";

export function ChatBar() {
  const { state, dispatch } = useChatStore();

  // When expanded, ChatClient takes the surface; bar hides itself.
  if (state.expanded) {
    return null;
  }

  const handleExpand = () => dispatch({ type: "EXPAND" });

  const ariaLabel =
    state.unreadAuditCount > 0
      ? `Open Koast — ${state.unreadAuditCount} new ${state.unreadAuditCount === 1 ? "update" : "updates"}`
      : "Open Koast";

  // (i) MAP DOWN bridge — Step C dispatches TURN_STATE_CHANGED based on
  // useAgentTurn's status + content[] derivation. The bar just renders
  // what's in the store.
  const statusLine =
    state.turnState === "streaming"
      ? "Koast is responding…"
      : state.turnState === "tool_call_pending"
        ? "Koast is using a tool…"
        : null;

  return (
    <button
      type="button"
      onClick={handleExpand}
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 cursor-pointer text-white transition-colors"
      style={{
        height: "56px",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backgroundColor: "var(--deep-sea)",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.15)",
      }}
      aria-label={ariaLabel}
    >
      <MessageCircle size={20} strokeWidth={1.5} aria-hidden="true" />
      <span className="text-sm font-medium">{statusLine ?? "Koast"}</span>
      {state.unreadAuditCount > 0 && (
        <span
          className="ml-2 min-w-[20px] h-[20px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-semibold"
          style={{
            backgroundColor: "var(--golden)",
            color: "var(--deep-sea)",
          }}
          aria-hidden="true"
        >
          {state.unreadAuditCount > 99 ? "99+" : state.unreadAuditCount}
        </span>
      )}
    </button>
  );
}
