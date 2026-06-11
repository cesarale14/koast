"use client";

/**
 * CalendarChangeBlock (P3.2 OTA trio) — a read-only display of a proposed OTA
 * write: block a date, adjust a price, or set a min-stay. Read-only by design;
 * the action (entity ids, channel, the actual Channex push) is owned by the
 * ProposalCard frame this renders inside, never by the block. Id-lean.
 *
 * Color law: a block (closing a date) reads with the coral indicator (a closed
 * date IS a negative-availability state — distinct from a rate drop, which is
 * never red). Price + min-stay are neutral chips.
 */

import { KoastRate } from "@/components/polish/KoastRate";
import type { CalendarChangeBlockData } from "./types";
import { fmtWeekdayMonthDay } from "./format";

function rangeLabel(date: string, dateCount: number | null | undefined): string {
  const base = fmtWeekdayMonthDay(date);
  const n = dateCount ?? 1;
  return n > 1 ? `${base} · ${n} nights` : base;
}

export function CalendarChangeBlock({ data }: { data: CalendarChangeBlockData }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: 99,
          flexShrink: 0,
          background: data.change === "block" ? "var(--coral-reef)" : "var(--koast-trench)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 15 }}>{data.property}</div>
        <div style={{ color: "var(--tideline)", fontSize: 13, marginTop: 2 }}>
          {rangeLabel(data.date, data.dateCount)}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {data.change === "block" && (
          <span style={{ color: "var(--coral-reef)", fontSize: 14, fontWeight: 600 }}>Block</span>
        )}
        {data.change === "price" && data.value != null && (
          <KoastRate value={data.value} variant="inline" />
        )}
        {data.change === "min_stay" && data.value != null && (
          <span style={{ color: "var(--deep-sea)", fontSize: 14, fontWeight: 600 }}>
            {data.value}-night min
          </span>
        )}
      </div>
    </div>
  );
}
