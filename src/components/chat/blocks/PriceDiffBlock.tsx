"use client";

/**
 * PriceDiffBlock — a read-only price/calendar diff (P2.2). Renders a
 * recommendation's current → suggested move through the shared KoastRate atom
 * (struck current, suggested with a never-red delta) + reason + urgency chip,
 * the same vocabulary the Pricing tab's RecRow uses. Read-only by design: an
 * actionable Apply must route through the Pricing tab's PreviewModal dry-run
 * (preview-bdc-push → /api/pricing/apply) to preserve the BDC-clobber guard, so
 * the block never calls apply directly — the ProposalCard / Pricing surface
 * owns the action.
 */

import { KoastRate } from "@/components/polish/KoastRate";
import { KoastChip } from "@/components/polish/KoastChip";
import type { PriceDiffBlockData } from "./types";
import { fmtWeekdayMonthDay } from "./format";

const URGENCY_LABEL: Record<NonNullable<PriceDiffBlockData["urgency"]>, string> = {
  act_now: "Act now",
  coming_up: "Coming up",
  review: "Review",
};

export function PriceDiffBlock({ data }: { data: PriceDiffBlockData }) {
  const delta =
    data.deltaAbs != null
      ? data.deltaAbs
      : data.currentRate != null && data.suggestedRate != null
        ? data.suggestedRate - data.currentRate
        : null;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--tideline)", fontSize: 13, marginBottom: 2 }}>{fmtWeekdayMonthDay(data.date)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {data.currentRate != null && <KoastRate value={data.currentRate} variant="struck" />}
            <span style={{ color: "var(--tideline)" }}>→</span>
            <KoastRate value={data.suggestedRate} variant="inline" delta={delta} />
          </div>
        </div>
        {data.urgency && (
          <KoastChip variant={data.urgency === "act_now" ? "warning" : "neutral"}>
            {URGENCY_LABEL[data.urgency]}
          </KoastChip>
        )}
      </div>
      {data.reason && (
        <div style={{ color: "var(--tideline)", fontSize: 13, marginTop: 6 }}>{data.reason}</div>
      )}
    </div>
  );
}
