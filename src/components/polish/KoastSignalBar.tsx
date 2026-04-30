"use client";

interface KoastSignalBarProps {
  label: string;
  score: number;
  weight: number;
  confidence: number;
}

export function KoastSignalBar({ label, score, weight, confidence }: KoastSignalBarProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const highConf = confidence >= 0.6;
  const fillColor = highConf ? "var(--golden)" : "rgba(196,154,90,0.4)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--coastal)",
            letterSpacing: "-0.005em",
            textTransform: "capitalize",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--tideline)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.04em",
          }}
        >
          {Math.round(weight * 100)}%
        </span>
      </div>
      <div
        style={{
          height: 4,
          width: "100%",
          borderRadius: 2,
          background: "var(--dry-sand)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${clamped * 100}%`,
            background: fillColor,
            transition: "width 240ms cubic-bezier(0.34,1.56,0.64,1)",
          }}
        />
      </div>
    </div>
  );
}

export default KoastSignalBar;
