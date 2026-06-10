"use client";

/**
 * ThreadBlock — a read-only message-thread snippet (P2.2). Mirrors the
 * UnifiedInbox ConversationItem's data surface (guest initials + platform badge
 * + property + last-message preview + unread dot + relative time) as a card the
 * agent / a proposal can show inline, built from the shared primitives + Koast
 * tokens rather than coupling to the heavy inbox module.
 */

import PlatformLogo from "@/components/ui/PlatformLogo";
import type { ThreadBlockData } from "./types";
import { initialsOf, relativeTime } from "./format";

export function ThreadBlock({ data }: { data: ThreadBlockData }) {
  const unread = (data.unreadCount ?? 0) > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 34,
            height: 34,
            background: "rgba(76,196,204,0.14)",
            color: "var(--coastal)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {initialsOf(data.guestName)}
        </span>
        {data.platform && (
          <span
            className="inline-flex items-center justify-center bg-white rounded-full"
            style={{ position: "absolute", bottom: -3, right: -3, width: 16, height: 16, boxShadow: "0 0 0 2px var(--shore-soft)" }}
          >
            <PlatformLogo platform={data.platform} size="sm" />
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.guestName ?? "Guest"}
          </span>
          <span style={{ color: "var(--tideline)", fontSize: 12, flexShrink: 0 }}>
            {relativeTime(data.lastMessageAt)}
          </span>
          {unread && (
            <span aria-label="unread" style={{ width: 8, height: 8, borderRadius: 99, background: "var(--lume)", flexShrink: 0 }} />
          )}
        </div>
        {data.propertyName && (
          <div style={{ color: "var(--tideline)", fontSize: 12 }}>{data.propertyName}</div>
        )}
        {data.lastMessage && (
          <div
            style={{
              color: "var(--tideline)",
              fontSize: 13,
              marginTop: 2,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.lastMessage}
          </div>
        )}
      </div>
    </div>
  );
}
