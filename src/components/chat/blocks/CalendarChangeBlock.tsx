"use client";

/**
 * CalendarChangeBlock (P3.2 OTA trio; design-pass Phase 2 redesign) — a read-only
 * display of a proposed OTA write: block a date, adjust a price, or set a
 * min-stay. Read-only by design; the action (entity ids, channel, the actual
 * Channex push) is owned by the ProposalCard frame this renders inside.
 *
 * Phase 2: the before→after DELTA is the focal point for a price change — the
 * thing the host's eye lands on (so approving $218→$210 is legible instantly).
 * Gold = money rule: the delta badge is GOLD only when the change RAISES the
 * rate (Koast found you more money); a strategic drop is neutral (never red).
 * The deep-teal "commit" lives on the card's Approve. Confidence is the shared
 * neutral ConfidenceCue (not the old amber/warning chip).
 *
 * Color law: a block (closing a date) keeps the coral indicator (closing IS a
 * negative-availability state — distinct from a rate drop, which is never red).
 */

import type { CalendarChangeBlockData } from "./types";
import { fmtWeekdayMonthDay } from "./format";
import { rateConfidenceEnvelope } from "@/lib/agent/confidence/envelope";
import { ConfidenceCue } from "@/components/chat/ConfidenceCue";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function rangeLabel(date: string, dateCount: number | null | undefined): string {
  const base = fmtWeekdayMonthDay(date);
  const n = dateCount ?? 1;
  return n > 1 ? `${base} · ${n} nights` : base;
}

/** ↑$X (gold — a gain, "found money") / ↓$X (neutral — a strategic drop, never red). */
function DeltaBadge({ from, to }: { from: number; to: number }) {
  const diff = to - from;
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 12.5,
        fontWeight: 700,
        color: up ? "var(--golden)" : "var(--tideline)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span aria-hidden style={{ fontSize: 10 }}>{up ? "▲" : "▼"}</span>
      {usd.format(Math.abs(diff))}
    </span>
  );
}

export function CalendarChangeBlock({ data }: { data: CalendarChangeBlockData }) {
  const envelope = rateConfidenceEnvelope(data.lowConfidence);
  const isPrice = data.change === "price" && data.value != null;
  const hasDelta = isPrice && data.currentValue != null;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header — what + where + when */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        {/* Block + min-stay keep their compact right-side value; price moves to the focal row below. */}
        {data.change === "block" && (
          <span style={{ color: "var(--coral-reef)", fontSize: 14, fontWeight: 600, flexShrink: 0 }}>Block</span>
        )}
        {data.change === "min_stay" && data.value != null && (
          <span style={{ color: "var(--deep-sea)", fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
            {data.currentValue != null && data.currentValue !== data.value ? (
              <>
                <span style={{ color: "var(--tideline)", textDecoration: "line-through", marginRight: 6 }}>
                  {data.currentValue}
                </span>
                {data.value}-night min
              </>
            ) : (
              <>{data.value}-night min</>
            )}
          </span>
        )}
      </div>

      {/* FOCAL before→after delta for a price change. */}
      {isPrice && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingLeft: 19, flexWrap: "wrap" }}>
          {hasDelta && (
            <>
              {/* The "before" carries real weight so $X → $Y reads as ONE from-to
                  motion (not a tiny strikethrough the eye skips to land on the
                  endpoint). It recedes by treatment — struck + muted tideline —
                  not by being small. The "after" stays the committed, dominant
                  value (Q-B weight tune). */}
              <span
                style={{
                  color: "var(--tideline)",
                  textDecoration: "line-through",
                  fontSize: 20,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {usd.format(data.currentValue as number)}
              </span>
              <span aria-hidden style={{ color: "var(--tideline)", fontSize: 17 }}>→</span>
            </>
          )}
          <span
            style={{
              color: "var(--deep-sea)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {usd.format(data.value as number)}
          </span>
          {hasDelta && <DeltaBadge from={data.currentValue as number} to={data.value as number} />}
        </div>
      )}

      {envelope.tier === "early" && (
        // A hair more space ABOVE than below (gap 10 + marginTop 6 = 16 above vs
        // the block's 12 bottom padding) so the cue reads as THIS proposal's
        // confidence grouping downward with the why, not a divider (Q-B micro-note).
        <div style={{ paddingLeft: isPrice ? 19 : 0, marginTop: 6 }}>
          <ConfidenceCue envelope={envelope} />
        </div>
      )}
    </div>
  );
}
