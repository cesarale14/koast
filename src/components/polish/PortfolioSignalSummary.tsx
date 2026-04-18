"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import KoastCard from "./KoastCard";
import KoastSignalBar from "./KoastSignalBar";
import KoastEmptyState from "./KoastEmptyState";
import { aggregateSignalContribution } from "@/lib/pricing/aggregate-signals";

interface RecommendationLike {
  reason_signals?: Record<string, unknown> | null;
}

interface Props {
  recommendations: RecommendationLike[];
  topN?: number;
}

export default function PortfolioSignalSummary({ recommendations, topN = 5 }: Props) {
  const rows = useMemo(() => aggregateSignalContribution(recommendations, topN), [recommendations, topN]);

  return (
    <KoastCard variant="elevated">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={14} color="var(--golden)" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--tideline)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Portfolio signals
          </span>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--coastal)",
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
          }}
        >
          What&apos;s driving today&apos;s suggestions
        </div>
        {rows.length === 0 ? (
          <KoastEmptyState title="No signals to aggregate" body="Run the engine to see which signals are moving rates today." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <KoastSignalBar key={r.name} label={r.name} score={1} weight={r.weight} confidence={1} />
            ))}
          </div>
        )}
      </div>
    </KoastCard>
  );
}
