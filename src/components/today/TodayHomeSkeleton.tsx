/**
 * TodayHomeSkeleton — the calm fallback painted while TodayHomeServer streams
 * the agenda rollup (~165-400ms). Deliberately static (no shimmer/pulse — the
 * §2b "calm over dense" direction; pulsing is reserved out per the design
 * system), transparent over --shore so it reads as the same surface the real
 * TodayHome paints into. Greeting-line + a few movement-row placeholders.
 */
export function TodayHomeSkeleton() {
  return (
    <div
      style={{
        height: "100%",
        background: "var(--shore)",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div style={{ height: 34, width: "62%", maxWidth: 460, borderRadius: 8, background: "var(--dry-sand)" }} />
      <div style={{ height: 18, width: "38%", maxWidth: 260, borderRadius: 6, background: "var(--shell)" }} />
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 60, borderRadius: 12, background: "var(--dry-sand)", opacity: 0.55 }} />
        ))}
      </div>
    </div>
  );
}
