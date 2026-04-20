"use client";

/**
 * WhyThisRate — collapsible "why this rate?" disclosure on the
 * Calendar sidebar Pricing tab. Reads the factors JSONB attached to
 * the master calendar_rates row (NOT pricing_recommendations). Ranks
 * signals by |score × weight|, takes top 3.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Signal = { key: string; label: string; score: number; weight: number; reason?: string | null };

interface Props {
  factors: Record<string, unknown> | null;
}

function humanLabel(key: string): string {
  return key
    .split(/[_-]/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function parseSignals(factors: Record<string, unknown> | null): Signal[] {
  if (!factors) return [];
  const signals: Signal[] = [];
  for (const [key, val] of Object.entries(factors)) {
    if (key === "clamps") continue;
    const v = val as { score?: number; weight?: number; reason?: string | null };
    const score = typeof v?.score === "number" ? v.score : 0;
    const weight = typeof v?.weight === "number" ? v.weight : 0;
    if (score === 0 && weight === 0) continue;
    signals.push({ key, label: humanLabel(key), score, weight, reason: v?.reason ?? null });
  }
  return signals
    .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight))
    .slice(0, 3);
}

function directionGlyph(score: number): { glyph: string; color: string } {
  if (score > 0.05) return { glyph: "▲", color: "var(--lagoon)" };
  if (score < -0.05) return { glyph: "▼", color: "var(--coral-reef)" };
  return { glyph: "▬", color: "var(--tideline)" };
}

export default function WhyThisRate({ factors }: Props) {
  const [open, setOpen] = useState(false);
  const signals = parseSignals(factors);
  if (signals.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--tideline)", padding: "10px 0" }}>
        No signals available for this date.
      </div>
    );
  }
  return (
    <div style={{ paddingTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 0",
          background: "transparent",
          border: "none",
          borderTop: "1px solid var(--dry-sand)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--tideline)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Why this rate?
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6 }}>
          {signals.map((s) => {
            const dir = directionGlyph(s.score);
            return (
              <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)", letterSpacing: "-0.005em" }}>
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: dir.color,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {dir.glyph} {Math.round(Math.abs(s.score) * 100)}%
                  </span>
                </div>
                {s.reason && (
                  <div style={{ fontSize: 12, color: "var(--tideline)", lineHeight: 1.45 }}>
                    {s.reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
