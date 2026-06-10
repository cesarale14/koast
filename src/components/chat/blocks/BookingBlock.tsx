"use client";

/**
 * BookingBlock — a read-only booking row (P2.2). The flow-layout counterpart to
 * the calendar's absolute-positioned BookingBar: same platform logo + nights +
 * first-name semantics, rendered as a card the agent / a proposal can show
 * inline. Koast tokens throughout (the calendar BookingSidePanel's neutral-*
 * grays are deliberately NOT reused).
 */

import PlatformLogo from "@/components/ui/PlatformLogo";
import type { BookingBlockData } from "./types";
import { nightsBetween, fmtMonthDay, firstNameOf } from "./format";

const PRICE_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function BookingBlock({ data }: { data: BookingBlockData }) {
  const nights = nightsBetween(data.checkIn, data.checkOut);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
      }}
    >
      <span
        className="inline-flex items-center justify-center bg-white rounded-full flex-shrink-0"
        style={{ width: 24, height: 24 }}
      >
        <PlatformLogo platform={data.platform} size="sm" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 15 }}>
          {firstNameOf(data.guestName)}
          {data.numGuests ? <span style={{ color: "var(--tideline)", fontWeight: 400 }}> · {data.numGuests} {data.numGuests === 1 ? "guest" : "guests"}</span> : null}
        </div>
        <div style={{ color: "var(--tideline)", fontSize: 13 }}>
          {fmtMonthDay(data.checkIn)} → {fmtMonthDay(data.checkOut)} · {nights}n
          {data.propertyName ? ` · ${data.propertyName}` : ""}
        </div>
      </div>
      {data.totalPrice != null && (
        <div style={{ fontWeight: 600, color: "var(--coastal)", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
          ${PRICE_FMT.format(Math.round(data.totalPrice))}
        </div>
      )}
    </div>
  );
}
