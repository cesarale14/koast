"use client";

/**
 * GuestReplyBlock (P3.2 send_guest_reply) — a read-only display of a proposed
 * guest message send: the channel, the guest, and the DRAFTED reply text the
 * host reads before approving. Read-only by design; the action (booking id, the
 * actual Channex send) is owned by the ProposalCard frame this renders inside,
 * never by the block. Id-lean.
 *
 * The drafted text is shown verbatim (already voice-judge-filtered upstream) so
 * the host approves exactly what will be sent. Design-system tokens only; the
 * channel reads as a quiet chip, never a platform-colored badge.
 */

import type { GuestReplyBlockData } from "./types";

function channelLabel(channel: string): string {
  switch (channel) {
    case "airbnb":
      return "Airbnb";
    case "booking_com":
      return "Booking.com";
    case "vrbo":
      return "Vrbo";
    case "direct":
      return "Direct";
    default:
      return channel;
  }
}

export function GuestReplyBlock({ data }: { data: GuestReplyBlockData }) {
  const to = data.guestName?.trim() || "the guest";
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 14 }}>
          Reply to {to}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--tideline)",
            background: "var(--shore)",
            border: "1px solid var(--hairline)",
            borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          {channelLabel(data.channel)}
        </span>
        {data.propertyName && (
          <span style={{ color: "var(--tideline)", fontSize: 12.5, marginLeft: "auto" }}>
            {data.propertyName}
          </span>
        )}
      </div>
      <div
        style={{
          color: "var(--deep-sea)",
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {data.messageText}
      </div>
    </div>
  );
}
