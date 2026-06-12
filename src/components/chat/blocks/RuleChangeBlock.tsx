"use client";

/**
 * RuleChangeBlock (P4.1) — a read-only display of a proposed pricing-RULE change
 * (raise the max_rate ceiling, etc.). Read-only by design; the action (property
 * id + patch, the actual pricing_rules write) is owned by the ProposalCard frame
 * this renders inside, never by the block. Id-lean.
 *
 * Color law: a rule raise is a positive/opportunity state — the new value reads
 * in the brand ink, never red (a higher ceiling is upside, not a warning).
 */

import { KoastRate } from "@/components/polish/KoastRate";
import type { RuleChangeBlockData } from "./types";

export function RuleChangeBlock({ data }: { data: RuleChangeBlockData }) {
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
          background: "var(--koast-trench)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 15 }}>{data.property}</div>
        <div style={{ color: "var(--tideline)", fontSize: 13, marginTop: 2 }}>{data.label}</div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        {data.oldValue != null && (
          <KoastRate value={data.oldValue} variant="struck" />
        )}
        <span aria-hidden style={{ color: "var(--tideline)", fontSize: 13 }}>
          →
        </span>
        <KoastRate value={data.newValue} variant="inline" />
      </div>
    </div>
  );
}
