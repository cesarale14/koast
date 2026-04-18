"use client";

/**
 * PricingTab — the polish-pass rebuild of PropertyDetail's Pricing tab.
 *
 * Four sections (Scorecard, Recommendations, Rules editor, Performance)
 * plus the Preview Modal that gates every apply through a dry-run.
 * Data comes from usePricingTab (PR D). All rendering goes through the
 * shared primitives in src/components/polish/ — see master plan.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Sparkles, Play, X, AlertTriangle, Check, RefreshCw, TrendingUp } from "lucide-react";
import { usePricingTab, type PricingRecommendation, type PricingRules, type PerformanceSummary } from "@/hooks/usePricingTab";
import KoastButton from "./KoastButton";
import KoastCard from "./KoastCard";
import KoastChip from "./KoastChip";
import KoastRate from "./KoastRate";
import KoastRail from "./KoastRail";
import KoastSignalBar from "./KoastSignalBar";
import KoastEmptyState from "./KoastEmptyState";
import PortfolioSignalSummary from "./PortfolioSignalSummary";

// ---------------- Types + utils ----------------

type Urgency = NonNullable<PricingRecommendation["urgency"]>;
const URGENCY_ORDER: Urgency[] = ["act_now", "coming_up", "review"];
const URGENCY_LABEL: Record<Urgency, string> = {
  act_now: "Act now",
  coming_up: "Coming up",
  review: "Review",
};

interface PricingTabProps {
  propertyId: string;
  compSetQuality?: "precise" | "fallback" | "insufficient" | "unknown";
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtDateRange(start: string, end: string): string {
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (start === end) return `${m(a)} ${a.getDate()}`;
  return sameMonth ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
}
// Group recommendations by urgency.
function groupByUrgency(recs: PricingRecommendation[]): Record<Urgency, PricingRecommendation[]> {
  const out: Record<Urgency, PricingRecommendation[]> = { act_now: [], coming_up: [], review: [] };
  for (const r of recs) {
    const u = (r.urgency ?? "review") as Urgency;
    out[u].push(r);
  }
  for (const k of URGENCY_ORDER) {
    out[k].sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

// ---------------- Main ----------------

export default function PricingTab({ propertyId, compSetQuality = "unknown" }: PricingTabProps) {
  const { rules, recommendations, performance, loading, error, refetch } = usePricingTab(propertyId);
  const [previewTarget, setPreviewTarget] = useState<PricingRecommendation[] | null>(null);
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const recsSectionRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  const selectedRec = useMemo(
    () => recommendations.pending.find((r) => r.id === selectedRecId) ?? null,
    [recommendations.pending, selectedRecId]
  );

  // Auto-select the highest-urgency rec whenever the rec set changes
  // and we don't yet have a selection (or the selection vanished).
  useEffect(() => {
    if (selectedRecId && recommendations.pending.some((r) => r.id === selectedRecId)) return;
    const first = recommendations.pending[0]?.id ?? null;
    setSelectedRecId(first);
  }, [recommendations.pending, selectedRecId]);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCalculate = useCallback(async () => {
    try {
      const res = await fetch(`/api/pricing/calculate/${propertyId}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setToast({ text: "Recalculated. Reloading recommendations.", tone: "ok" });
      await refetch();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Calculate failed", tone: "err" });
    }
  }, [propertyId, refetch]);

  const handleDismiss = useCallback(
    async (rec: PricingRecommendation) => {
      try {
        const res = await fetch(`/api/pricing/dismiss`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recommendation_id: rec.id }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        setToast({ text: "Dismissed", tone: "ok" });
        await refetch();
      } catch (err) {
        setToast({ text: err instanceof Error ? err.message : "Dismiss failed", tone: "err" });
      }
    },
    [refetch]
  );

  const handleApplyOneClick = useCallback((rec: PricingRecommendation) => {
    setPreviewTarget([rec]);
  }, []);
  const handleApplyGroup = useCallback((recs: PricingRecommendation[]) => {
    setPreviewTarget(recs);
  }, []);

  const scrollToRecs = useCallback(() => {
    recsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (loading && !rules) {
    return (
      <div style={{ padding: "48px 0", display: "flex", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: "var(--tideline)" }}>Loading pricing…</div>
      </div>
    );
  }
  if (error && !rules) {
    return (
      <KoastCard variant="elevated" style={{ marginTop: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--coral-reef)", marginBottom: 6 }}>
          Couldn&apos;t load pricing data
        </div>
        <div style={{ fontSize: 13, color: "var(--tideline)", marginBottom: 16 }}>{error.message}</div>
        <KoastButton variant="secondary" size="sm" onClick={refetch}>
          Retry
        </KoastButton>
      </KoastCard>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 24, paddingBottom: 48, position: "relative" }}>
      <div style={{ ...rowGridStyle(7, 3), ...choreographyStyle(mounted, 0) }}>
        <Scorecard
          pending={recommendations.pending}
          performance={performance}
          compSetQuality={compSetQuality}
          onReview={scrollToRecs}
        />
        <PortfolioSignalSummary recommendations={recommendations.pending} />
      </div>

      <div
        ref={recsSectionRef}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 7fr) minmax(0, 3fr)",
          gap: 20,
          alignItems: "flex-start",
          ...choreographyStyle(mounted, 120),
        }}
      >
        <RecommendationsList
          pending={recommendations.pending}
          selectedRecId={selectedRecId}
          onSelectRec={setSelectedRecId}
          onApplyGroup={handleApplyGroup}
          onCalculate={handleCalculate}
        />
        <div style={{ position: "sticky", top: 24 }}>
          <KoastRail
            open={railOpen}
            onToggle={() => setRailOpen((o) => !o)}
            variant="light"
            keyboardToggle={false}
            header={
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--tideline)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Selected
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)", letterSpacing: "-0.005em" }}>
                  {selectedRec
                    ? new Date(selectedRec.date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : "No selection"}
                </span>
              </div>
            }
          >
            <SelectedRecRail
              rec={selectedRec}
              rules={rules}
              onApply={() => selectedRec && handleApplyOneClick(selectedRec)}
              onDismiss={() => selectedRec && handleDismiss(selectedRec)}
            />
          </KoastRail>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 20,
          alignItems: "flex-start",
          ...choreographyStyle(mounted, 240),
        }}
      >
        <RulesEditor
          propertyId={propertyId}
          rules={rules}
          onSaved={(toastText) => setToast({ text: toastText, tone: "ok" })}
          onSaveFailed={(msg) => setToast({ text: msg, tone: "err" })}
          refetch={refetch}
        />
        <PerformancePanel
          propertyId={propertyId}
          rules={rules}
          performance={performance}
          pending={recommendations.pending}
          onCalculate={handleCalculate}
        />
      </div>

      {previewTarget && (
        <PreviewModal
          propertyId={propertyId}
          targetRecs={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onCommitted={(text) => {
            setToast({ text, tone: "ok" });
            setPreviewTarget(null);
            void refetch();
          }}
          onFailed={(msg) => setToast({ text: msg, tone: "err" })}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.tone === "err" ? "var(--coral-reef)" : "var(--coastal)",
            color: "var(--shore)",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(19,46,32,0.25)",
            zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function choreographyStyle(mounted: boolean, delayMs: number): React.CSSProperties {
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(12px)",
    transition: "opacity 240ms ease-out, transform 240ms ease-out",
    transitionDelay: `${delayMs}ms`,
  };
}

function rowGridStyle(leftFr: number, rightFr: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `minmax(0, ${leftFr}fr) minmax(0, ${rightFr}fr)`,
    gap: 20,
    alignItems: "flex-start",
  };
}

// ---------------- Section 1: Scorecard ----------------

function Scorecard({
  pending,
  performance,
  compSetQuality,
  onReview,
}: {
  pending: PricingRecommendation[];
  performance: PerformanceSummary | null;
  compSetQuality: "precise" | "fallback" | "insufficient" | "unknown";
  onReview: () => void;
}) {
  const today = new Date();
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();
  const currentMonthPending = pending.filter((r) => {
    const d = new Date(r.date + "T00:00:00");
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalDeltaAbs = currentMonthPending.reduce((sum, r) => {
    const delta = (r.suggested_rate ?? 0) - (r.current_rate ?? 0);
    return sum + delta;
  }, 0);
  const actNowCount = pending.filter((r) => r.urgency === "act_now").length;

  if (pending.length === 0) {
    return (
      <KoastCard variant="quiet" padding={28}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={sectionLabel}>This month</span>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--coastal)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            You&apos;re on track
          </div>
          <div style={{ fontSize: 14, color: "var(--tideline)", lineHeight: 1.5 }}>
            Koast ran at 6 AM ET and has no pending recommendations for this property.
          </div>
        </div>
      </KoastCard>
    );
  }

  const allDown = currentMonthPending.length > 0 && totalDeltaAbs < 0;
  const dark = !allDown; // dark card only for upside framing

  return (
    <KoastCard variant={dark ? "dark" : "quiet"} padding={28}>
      {dark && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 240,
            height: 240,
            background: "radial-gradient(circle, rgba(196,154,90,0.28), rgba(196,154,90,0) 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={14} color="var(--golden)" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--golden)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {allDown ? "Koast suggests" : "This month"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          {allDown ? (
            <>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 600,
                  color: "var(--coastal)",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                }}
              >
                Ease {fmtMoney(Math.abs(totalDeltaAbs))} to stay competitive
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: "var(--shore)",
                  letterSpacing: "-0.005em",
                }}
              >
                You could capture
              </span>
              <KoastRate tone="dark" variant="hero" value={totalDeltaAbs} style={{ fontSize: 72 }} />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: "rgba(247,243,236,0.8)",
                  letterSpacing: "-0.005em",
                }}
              >
                more this month
              </span>
            </>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: dark ? "rgba(247,243,236,0.78)" : "var(--tideline)",
            lineHeight: 1.5,
          }}
        >
          {pending.length} recommendation{pending.length === 1 ? "" : "s"} waiting
          {actNowCount > 0 && ` — ${actNowCount} need${actNowCount === 1 ? "s" : ""} action today`}.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <KoastButton variant={dark ? "primary" : "secondary"} size="md" onClick={onReview}>
            Review recommendations
          </KoastButton>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {performance?.acceptance_rate != null && (
            <KoastChip variant="neutral">
              {Math.round(performance.acceptance_rate * 100)}% acceptance
            </KoastChip>
          )}
          {performance && (
            <KoastChip variant="neutral">
              {fmtMoney(performance.revenue_captured)} captured (30d)
            </KoastChip>
          )}
          <KoastChip variant={compChipVariant(compSetQuality)}>
            {compChipLabel(compSetQuality)}
          </KoastChip>
        </div>
      </div>
    </KoastCard>
  );
}

function compChipVariant(q: "precise" | "fallback" | "insufficient" | "unknown"): "success" | "warning" | "danger" | "neutral" {
  if (q === "precise") return "success";
  if (q === "fallback") return "warning";
  if (q === "insufficient") return "danger";
  return "neutral";
}
function compChipLabel(q: "precise" | "fallback" | "insufficient" | "unknown"): string {
  if (q === "precise") return "Comp set: precise";
  if (q === "fallback") return "Comp set: fallback";
  if (q === "insufficient") return "Comp set: insufficient";
  return "Comp set: pending";
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--tideline)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

// ---------------- Section 2: Recommendations ----------------

const PAGE_SIZE = 20;

function RecommendationsList({
  pending,
  selectedRecId,
  onSelectRec,
  onApplyGroup,
  onCalculate,
}: {
  pending: PricingRecommendation[];
  selectedRecId: string | null;
  onSelectRec: (id: string) => void;
  onApplyGroup: (recs: PricingRecommendation[]) => void;
  onCalculate: () => void;
}) {
  const groups = useMemo(() => groupByUrgency(pending), [pending]);

  if (pending.length === 0) {
    return (
      <KoastCard variant="elevated">
        <KoastEmptyState
          title="No pending recommendations"
          body="Koast runs daily at 6 AM ET. You can trigger a fresh recalculation manually below."
          action={
            <KoastButton variant="primary" size="md" iconLeft={<Play size={14} />} onClick={onCalculate}>
              Run now
            </KoastButton>
          }
        />
      </KoastCard>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span style={sectionLabel}>Recommendations</span>
      {URGENCY_ORDER.map((u) => {
        const recs = groups[u];
        if (recs.length === 0) return null;
        return (
          <RecGroup
            key={u}
            urgency={u}
            recs={recs}
            selectedRecId={selectedRecId}
            onSelectRec={onSelectRec}
            onApplyGroup={onApplyGroup}
          />
        );
      })}
    </div>
  );
}

function RecGroup({
  urgency,
  recs,
  selectedRecId,
  onSelectRec,
  onApplyGroup,
}: {
  urgency: Urgency;
  recs: PricingRecommendation[];
  selectedRecId: string | null;
  onSelectRec: (id: string) => void;
  onApplyGroup: (recs: PricingRecommendation[]) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset pagination when the underlying set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [recs.length]);

  const potential = recs.reduce((sum, r) => {
    if (r.current_rate == null || r.suggested_rate == null) return sum;
    return sum + (r.suggested_rate - r.current_rate);
  }, 0);
  const chipVariant = urgency === "act_now" ? "danger" : urgency === "coming_up" ? "warning" : "neutral";
  const visible = recs.slice(0, visibleCount);
  const remaining = Math.max(0, recs.length - visibleCount);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <KoastChip variant={chipVariant}>{URGENCY_LABEL[urgency]}</KoastChip>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--tideline)", letterSpacing: "-0.005em" }}>
            {recs.length} · {potential >= 0 ? "+" : "−"}{fmtMoney(Math.abs(potential))} potential
          </span>
        </div>
        <KoastButton variant="secondary" size="sm" onClick={() => onApplyGroup(recs)}>
          Apply all
        </KoastButton>
      </div>
      <KoastCard variant="elevated" padding={0}>
        {visible.map((rec, i) => (
          <RecRow
            key={rec.id}
            rec={rec}
            selected={rec.id === selectedRecId}
            onSelect={() => onSelectRec(rec.id)}
            isLast={i === visible.length - 1}
          />
        ))}
      </KoastCard>
      {remaining > 0 && (
        <KoastButton variant="ghost" size="sm" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
          Show {Math.min(remaining, PAGE_SIZE)} more
        </KoastButton>
      )}
    </div>
  );
}

function RecRow({
  rec,
  selected,
  onSelect,
  isLast,
}: {
  rec: PricingRecommendation;
  selected: boolean;
  onSelect: () => void;
  isLast: boolean;
}) {
  const delta =
    rec.current_rate == null || rec.suggested_rate == null
      ? null
      : rec.suggested_rate - rec.current_rate;
  const deltaChipVariant: "success" | "warning" | "neutral" =
    delta == null ? "neutral" : delta > 0 ? "success" : "neutral";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "112px 180px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 16,
        height: 48,
        padding: "0 16px",
        border: "none",
        borderBottom: isLast ? "none" : "1px solid rgba(229,226,220,0.7)",
        borderLeft: selected ? "3px solid var(--lagoon)" : "3px solid transparent",
        background: selected ? "rgba(26,122,90,0.04)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        color: "inherit",
        transition: "background-color 180ms cubic-bezier(0.4,0,0.2,1), border-color 180ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--coastal)",
          letterSpacing: "-0.005em",
        }}
      >
        {fmtDateRange(rec.date, rec.date)}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
        <KoastRate value={rec.current_rate} variant="inline" />
        <span style={{ fontSize: 11, color: "var(--tideline)" }}>→</span>
        <KoastRate value={rec.suggested_rate} variant="inline" delta={delta} />
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--tideline)",
          lineHeight: 1.4,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {rec.reason_text ?? "—"}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end" }}>
        {delta != null && delta !== 0 && (
          <KoastChip variant={deltaChipVariant}>
            {delta > 0 ? "+" : "−"}{fmtMoney(Math.abs(delta))}
          </KoastChip>
        )}
      </span>
    </button>
  );
}

// ---------------- Section 3: Rules editor ----------------

function RulesEditor({
  propertyId,
  rules,
  onSaved,
  onSaveFailed,
  refetch,
}: {
  propertyId: string;
  rules: PricingRules | null;
  onSaved: (text: string) => void;
  onSaveFailed: (msg: string) => void;
  refetch: () => Promise<void>;
}) {
  const [base, setBase] = useState<string>("");
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");
  const [delta, setDelta] = useState<number>(0.15);
  const [floor, setFloor] = useState<number>(0.85);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const lastCalcRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!rules) return;
    setBase(String(rules.base_rate ?? ""));
    setMin(String(rules.min_rate ?? ""));
    setMax(String(rules.max_rate ?? ""));
    setDelta(rules.max_daily_delta_pct ?? 0.15);
    setFloor(rules.comp_floor_pct ?? 0.85);
  }, [rules]);

  const doSave = useCallback(
    async (patch: Partial<PricingRules>) => {
      setFieldErrors({});
      try {
        const res = await fetch(`/api/pricing/rules/${propertyId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data?.field_errors) {
            setFieldErrors(data.field_errors as Record<string, string>);
          }
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        onSaved("Rules saved");
        await refetch();
        // Recompute, throttled to 1 per 10s.
        const now = Date.now();
        if (now - lastCalcRef.current > 10_000) {
          lastCalcRef.current = now;
          fetch(`/api/pricing/calculate/${propertyId}`, { method: "POST" }).catch(() => undefined);
        }
      } catch (err) {
        onSaveFailed(err instanceof Error ? err.message : "Save failed");
      }
    },
    [propertyId, onSaved, onSaveFailed, refetch]
  );

  const scheduleSave = useCallback(
    (patch: Partial<PricingRules>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void doSave(patch), 500);
    },
    [doSave]
  );

  if (!rules) return null;

  const source = rules.source;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={sectionLabel}>Rules</span>
      {source !== "host_set" && (
        <KoastCard variant="quiet" padding={14}>
          <div style={{ fontSize: 13, color: "var(--coastal)", lineHeight: 1.5 }}>
            {source === "inferred"
              ? "Koast inferred these from your existing pricing history. Tweak anything — your changes always win."
              : "These are starter values. Personalize them to match your strategy."}
          </div>
        </KoastCard>
      )}
      <KoastCard variant="elevated">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <FieldNumeric
            label="Base rate"
            value={base}
            onChange={(v) => setBase(v)}
            onBlur={() => scheduleSave({ base_rate: Number(base) })}
            prefix="$"
            error={fieldErrors.base_rate}
          />
          <FieldNumeric
            label="Min rate"
            value={min}
            onChange={(v) => setMin(v)}
            onBlur={() => scheduleSave({ min_rate: Number(min) })}
            prefix="$"
            error={fieldErrors.min_rate}
          />
          <FieldNumeric
            label="Max rate"
            value={max}
            onChange={(v) => setMax(v)}
            onBlur={() => scheduleSave({ max_rate: Number(max) })}
            prefix="$"
            error={fieldErrors.max_rate}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FieldSlider
            label="Max daily change"
            min={0.05}
            max={0.5}
            step={0.01}
            value={delta}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setDelta}
            onCommit={(v) => scheduleSave({ max_daily_delta_pct: v })}
          />
          <FieldSlider
            label="Comp floor"
            min={0.6}
            max={1.0}
            step={0.01}
            value={floor}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setFloor}
            onCommit={(v) => scheduleSave({ comp_floor_pct: v })}
          />
          <AutoApplyToggle auto={rules.auto_apply} />
        </div>
      </KoastCard>
    </div>
  );
}

function FieldNumeric({
  label,
  value,
  onChange,
  onBlur,
  prefix,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  prefix?: string;
  error?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={sectionLabel}>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: error ? "1px solid var(--coral-reef)" : "1px solid #E5E2DC",
          borderRadius: 10,
          padding: "0 12px",
          height: 38,
          background: "#fff",
          gap: 4,
        }}
      >
        {prefix && <span style={{ fontSize: 14, color: "var(--tideline)" }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          inputMode="decimal"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--coastal)",
            background: "transparent",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.005em",
          }}
        />
      </div>
      {error && <span style={{ fontSize: 11, color: "var(--coral-reef)" }}>{error}</span>}
    </label>
  );
}

function FieldSlider({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={sectionLabel}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)", fontVariantNumeric: "tabular-nums" }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onMouseUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        style={{ width: "100%", accentColor: "var(--coastal)" }}
      />
    </label>
  );
}

function AutoApplyToggle({ auto }: { auto: boolean }) {
  return (
    <div
      title="Unlocks after 14 days of validation + clean comp set"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        border: "1px dashed #E5E2DC",
        borderRadius: 10,
        background: "#FAFAF7",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)" }}>Auto-apply</span>
        <span style={{ fontSize: 12, color: "var(--tideline)" }}>
          {auto ? "Enabled — Koast will push daily." : "Coming soon — unlocks after 14 days of validation."}
        </span>
      </div>
      <span
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          background: auto ? "var(--lagoon)" : "var(--shell)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: auto ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </span>
    </div>
  );
}

// ---------------- Section 4: Performance ----------------

function PerformancePanel({
  propertyId,
  rules,
  performance,
  pending,
  onCalculate,
}: {
  propertyId: string;
  rules: PricingRules | null;
  performance: PerformanceSummary | null;
  pending: PricingRecommendation[];
  onCalculate: () => void;
}) {
  const lastRunAt = pending[0]?.created_at ?? null;
  const appliedToday = performance?.by_date.filter((d) => d.applied_rate != null && d.date === isoDate(new Date())).length ?? 0;
  const bookedToday = performance?.by_date.filter((d) => d.booked && d.date === isoDate(new Date())).length ?? 0;
  const pendingCount = pending.length;
  void propertyId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={sectionLabel}>Performance</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <TodaysRunCard
          lastRunAt={lastRunAt}
          appliedToday={appliedToday}
          bookedToday={bookedToday}
          pendingCount={pendingCount}
          onCalculate={onCalculate}
        />
        <AutoApplyChecklist rules={rules} pending={pending} />
      </div>
      <AccuracyChart performance={performance} />
    </div>
  );
}

// ---------------- Selected rec rail ----------------

function SelectedRecRail({
  rec,
  rules,
  onApply,
  onDismiss,
}: {
  rec: PricingRecommendation | null;
  rules: PricingRules | null;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!rec) {
    return (
      <div style={{ padding: 24 }}>
        <KoastEmptyState
          title="Select a recommendation"
          body="Pick a row on the left to see Koast's reasoning, signal breakdown, and the apply controls."
        />
      </div>
    );
  }

  const delta =
    rec.current_rate == null || rec.suggested_rate == null
      ? null
      : rec.suggested_rate - rec.current_rate;
  const urgencyChip =
    rec.urgency === "act_now" ? <KoastChip variant="danger">Act now</KoastChip>
    : rec.urgency === "coming_up" ? <KoastChip variant="warning">Coming up</KoastChip>
    : <KoastChip variant="neutral">Review</KoastChip>;

  const signalRows = (() => {
    const raw = (rec.reason_signals ?? {}) as Record<string, unknown>;
    const entries = Object.entries(raw).filter(([k]) => k !== "clamps");
    const parsed = entries.map(([id, val]) => {
      const v = val as { score?: number; weight?: number; confidence?: number };
      return {
        id,
        score: typeof v.score === "number" ? v.score : 0,
        weight: typeof v.weight === "number" ? v.weight : 0,
        confidence: typeof v.confidence === "number" ? v.confidence : 1,
      };
    });
    const total = parsed.reduce((s, p) => s + p.weight * p.confidence, 0);
    return parsed
      .map((p) => ({ ...p, effective: total > 0 ? (p.weight * p.confidence) / total : 0 }))
      .sort((a, b) => b.effective - a.effective)
      .slice(0, 5);
  })();

  const clamps = (rec.reason_signals as {
    clamps?: { raw_engine_suggestion?: number; clamped_by?: string; guardrail_trips?: Array<{ guardrail?: string; detail?: string }> };
  })?.clamps ?? null;

  const dateObj = new Date(rec.date + "T00:00:00");

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "var(--coastal)",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {dateObj.toLocaleDateString("en-US", { weekday: "long" })}
        </span>
        {urgencyChip}
      </div>
      <div style={{ fontSize: 12, color: "var(--tideline)" }}>
        {dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <KoastRate variant="hero" value={rec.suggested_rate} style={{ fontSize: 54 }} delta={delta} />
      </div>
      <div style={{ fontSize: 12, color: "var(--tideline)" }}>
        Current: <KoastRate value={rec.current_rate} variant="inline" />
      </div>

      {rec.reason_text && (
        <KoastCard variant="quiet" padding={14}>
          <div style={{ fontSize: 13, color: "var(--coastal)", lineHeight: 1.5 }}>{rec.reason_text}</div>
        </KoastCard>
      )}

      {signalRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={sectionLabel}>Top signals</span>
          {signalRows.map((s) => (
            <KoastSignalBar key={s.id} label={s.id} score={s.score} weight={s.effective} confidence={s.confidence} />
          ))}
        </div>
      )}

      {clamps && (clamps.raw_engine_suggestion != null || clamps.guardrail_trips?.length) && (
        <KoastCard variant="quiet" padding={12}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={sectionLabel}>What Koast wanted vs your rules</span>
            {clamps.raw_engine_suggestion != null && (
              <div style={{ fontSize: 12, color: "var(--coastal)", lineHeight: 1.5 }}>
                Raw: <strong>{fmtMoney(clamps.raw_engine_suggestion)}</strong>
                {clamps.clamped_by && <> · clamped by <strong>{clamps.clamped_by}</strong></>}
              </div>
            )}
            {clamps.guardrail_trips?.length ? (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--tideline)" }}>
                {clamps.guardrail_trips.map((t, i) => (
                  <li key={i}><strong>{t.guardrail}</strong>{t.detail ? ` — ${t.detail}` : ""}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </KoastCard>
      )}

      {rules && (
        <div style={{ fontSize: 11, color: "var(--tideline)" }}>
          Rules in effect · min {fmtMoney(rules.min_rate)} · base {fmtMoney(rules.base_rate)} · max {fmtMoney(rules.max_rate)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <KoastButton variant="ghost" size="md" onClick={onDismiss}>
          Dismiss
        </KoastButton>
        <KoastButton variant="primary" size="md" onClick={onApply}>
          Apply {rec.suggested_rate != null ? fmtMoney(rec.suggested_rate) : ""}
        </KoastButton>
      </div>
    </div>
  );
}

function TodaysRunCard({
  lastRunAt,
  appliedToday,
  bookedToday,
  pendingCount,
  onCalculate,
}: {
  lastRunAt: string | null;
  appliedToday: number;
  bookedToday: number;
  pendingCount: number;
  onCalculate: () => void;
}) {
  const relTime = lastRunAt
    ? new Date(lastRunAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "never";
  return (
    <KoastCard variant="elevated">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={sectionLabel}>Today&apos;s run</span>
        <div style={{ fontSize: 13, color: "var(--coastal)", lineHeight: 1.5 }}>
          Last run at <strong>{relTime}</strong>. Next run: <strong>6 AM ET</strong>.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <KoastChip variant="success">{appliedToday} applied</KoastChip>
          <KoastChip variant="neutral">{pendingCount} pending</KoastChip>
          <KoastChip variant="neutral">{bookedToday} booked</KoastChip>
        </div>
        <div>
          <KoastButton variant="secondary" size="sm" iconLeft={<RefreshCw size={14} />} onClick={onCalculate}>
            Run now
          </KoastButton>
        </div>
      </div>
    </KoastCard>
  );
}

function AutoApplyChecklist({ rules, pending }: { rules: PricingRules | null; pending: PricingRecommendation[] }) {
  const validationDays = new Set(pending.map((r) => r.created_at?.slice(0, 10))).size;
  const has14Days = validationDays >= 14;
  const autoApplyOn = !!rules?.auto_apply;
  const recentConflicts = pending.filter((r) => {
    const clamps = (r.reason_signals as { clamps?: { guardrail_trips?: Array<{ guardrail?: string }> } })?.clamps;
    return clamps?.guardrail_trips?.some((t) => t.guardrail === "comp_floor_exceeds_max_rate") ?? false;
  }).length;
  const allGreen = has14Days && autoApplyOn && recentConflicts < 3;

  const items = [
    { label: "14+ days of validation data", ok: has14Days, current: `${validationDays}/14 days` },
    { label: "Auto-apply enabled in rules", ok: autoApplyOn, current: autoApplyOn ? "On" : "Off" },
    { label: "No recent comp-floor conflicts", ok: recentConflicts < 3, current: `${recentConflicts} in last 7 days` },
  ];
  return (
    <KoastCard variant="elevated">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={sectionLabel}>Why not auto-apply?</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: it.ok ? "rgba(26,122,90,0.12)" : "rgba(212,150,11,0.12)",
                  color: it.ok ? "var(--lagoon)" : "var(--amber-tide)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {it.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--coastal)" }}>{it.label}</div>
                <div style={{ fontSize: 11, color: "var(--tideline)" }}>{it.current}</div>
              </div>
            </div>
          ))}
        </div>
        {allGreen && (
          <KoastButton variant="primary" size="sm" iconLeft={<TrendingUp size={14} />}>
            Enable auto-apply
          </KoastButton>
        )}
      </div>
    </KoastCard>
  );
}

function AccuracyChart({ performance }: { performance: PerformanceSummary | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const byDate = useMemo(() => performance?.by_date ?? [], [performance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (byDate.length < 2) return;

    const pad = { t: 16, r: 16, b: 24, l: 40 };
    const W = rect.width - pad.l - pad.r;
    const H = rect.height - pad.t - pad.b;
    const xs = byDate.map((_, i) => i);
    const ys = byDate.flatMap((d) => [d.suggested_rate, d.applied_rate, d.actual_rate_if_booked].filter((v): v is number => typeof v === "number"));
    if (ys.length === 0) return;
    const yMin = Math.min(...ys) * 0.95;
    const yMax = Math.max(...ys) * 1.05;
    const x = (i: number) => pad.l + (W * i) / (xs.length - 1);
    const y = (v: number) => pad.t + H - ((v - yMin) / (yMax - yMin)) * H;

    // Grid
    ctx.strokeStyle = "#EDE7DB";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const yy = pad.t + (H * i) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + W, yy);
      ctx.stroke();
    }

    // Line drawer with rAF progressive reveal
    const drawLine = (values: Array<number | null>, color: string, progress: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      const stopIdx = Math.floor((values.length - 1) * progress);
      for (let i = 0; i <= stopIdx; i++) {
        const v = values[i];
        if (v == null) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(x(i), y(v));
          started = true;
        } else {
          ctx.lineTo(x(i), y(v));
        }
      }
      ctx.stroke();
    };

    const suggested = byDate.map((d) => d.suggested_rate);
    const applied = byDate.map((d) => d.applied_rate);
    const actual = byDate.map((d) => (d.booked ? d.actual_rate_if_booked : null));

    let start: number | null = null;
    const duration = 800;
    let rafId = 0;
    const frame = (ts: number) => {
      if (start == null) start = ts;
      const elapsed = ts - start;
      const p = Math.min(1, elapsed / duration);
      ctx.clearRect(0, 0, rect.width, rect.height);
      // redraw grid each frame
      ctx.strokeStyle = "#EDE7DB";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const yy = pad.t + (H * i) / 3;
        ctx.beginPath();
        ctx.moveTo(pad.l, yy);
        ctx.lineTo(pad.l + W, yy);
        ctx.stroke();
      }
      drawLine(suggested, "var(--coastal)".includes("var") ? "#17392A" : "var(--coastal)", p);
      drawLine(applied, "#C49A5A", p);
      drawLine(actual, "#1A7A5A", p);
      if (p < 1) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [byDate]);

  if (byDate.length < 2) {
    return (
      <KoastCard variant="elevated">
        <KoastEmptyState
          title="Not enough data yet"
          body="We need a few more days of applied rates before we can chart accuracy. Check back after Koast has a week of history."
        />
      </KoastCard>
    );
  }

  return (
    <KoastCard variant="elevated">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={sectionLabel}>Last 30 days accuracy</span>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--tideline)" }}>
            <LegendSwatch color="#17392A" label="Suggested" />
            <LegendSwatch color="#C49A5A" label="Applied" />
            <LegendSwatch color="#1A7A5A" label="Actual (booked)" />
          </div>
        </div>
        <canvas ref={canvasRef} style={{ width: "100%", height: 240, display: "block" }} />
      </div>
    </KoastCard>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 2, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

// ---------------- Section 5: Preview Modal ----------------

interface PreviewPlan {
  entries_to_push: Array<{ date: string; rate?: number }>;
  skipped_fields: Array<{ date: string; reason: string; field?: string }>;
  bdc_state_at?: string;
}

const SKIP_REASON_COPY: Record<string, string> = {
  bdc_closed_all_fields_preserved: "Closed on Booking.com — Koast preserves the block",
  rate_delta_exceeds_threshold: "Rate change >10% — Koast skipped to avoid whiplash",
  comp_floor_exceeds_max_rate: "Your max_rate is below the market floor — raise max in rules to apply",
};

function PreviewModal({
  propertyId,
  targetRecs,
  onClose,
  onCommitted,
  onFailed,
}: {
  propertyId: string;
  targetRecs: PricingRecommendation[];
  onClose: () => void;
  onCommitted: (text: string) => void;
  onFailed: (msg: string) => void;
}) {
  type Phase = "loading" | "plan" | "confirming" | "committing" | "success" | "partial";
  const [phase, setPhase] = useState<Phase>("loading");
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ applied_count: number; performance_row_ids?: string[]; failed_batches?: Array<{ date_from: string; date_to: string; error: string }> } | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);

  const dates = useMemo(() => targetRecs.map((r) => r.date).sort(), [targetRecs]);
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);
    const koastProposed: Record<string, { rate?: number; availability?: number; stop_sell?: boolean; min_stay_arrival?: number }> = {};
    for (const r of targetRecs) {
      if (r.suggested_rate != null) koastProposed[r.date] = { rate: r.suggested_rate };
    }
    fetch(`/api/pricing/preview-bdc-push/${propertyId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateFrom, dateTo, koastProposed }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setPlan(body.plan as PreviewPlan);
        setRaw(body);
        setPhase("plan");
      })
      .catch((e) => {
        if (!alive) return;
        setLoadErr(e instanceof Error ? e.message : String(e));
        setPhase("plan");
      })
      .finally(() => clearTimeout(t));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [propertyId, targetRecs, dateFrom, dateTo]);

  const commit = useCallback(async () => {
    setPhase("committing");
    try {
      const res = await fetch(`/api/pricing/apply/${propertyId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recommendation_ids: targetRecs.map((r) => r.id),
          idempotency_key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `apply-${Date.now()}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setApplyResult(body);
      if (body.partial_failure || (body.failed_batches && body.failed_batches.length > 0)) {
        setPhase("partial");
      } else {
        setPhase("success");
        const text = `Applied ${body.applied_count ?? targetRecs.length} rate${(body.applied_count ?? 0) === 1 ? "" : "s"} to Booking.com.`;
        onCommitted(text);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onFailed(msg);
      setPhase("plan");
    }
  }, [propertyId, targetRecs, onCommitted, onFailed]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Backdrop — not position:fixed; flex-wrapped overlay inside the tab */}
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(19,46,32,0.35)",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E5E2DC",
          width: "min(640px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(19,46,32,0.25)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #E5E2DC",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={sectionLabel}>Preview before pushing</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--coastal)", letterSpacing: "-0.01em" }}>
              Booking.com · {fmtDateRange(dateFrom, dateTo)} · {targetRecs.length} date{targetRecs.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "var(--tideline)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {phase === "loading" && (
            <div style={{ fontSize: 13, color: "var(--tideline)" }}>
              Previewing push to Booking.com…
            </div>
          )}
          {phase !== "loading" && loadErr && !plan && (
            <div style={{ fontSize: 13, color: "var(--coral-reef)" }}>{loadErr}</div>
          )}
          {(phase === "plan" || phase === "confirming") && plan && (
            <PreviewPlanBody plan={plan} raw={raw} jsonOpen={jsonOpen} onToggleJson={() => setJsonOpen((v) => !v)} targetRecs={targetRecs} />
          )}
          {phase === "committing" && (
            <div style={{ fontSize: 13, color: "var(--tideline)" }}>Pushing batch…</div>
          )}
          {phase === "success" && applyResult && (
            <SuccessBody applyResult={applyResult} />
          )}
          {phase === "partial" && applyResult && (
            <PartialBody applyResult={applyResult} onRetry={commit} />
          )}
        </div>

        {(phase === "plan" || phase === "confirming") && plan && (
          <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 20px", borderTop: "1px solid #E5E2DC" }}>
            <KoastButton variant="ghost" size="md" onClick={onClose}>
              Cancel
            </KoastButton>
            <KoastButton variant="primary" size="md" onClick={commit} loading={phase === "confirming"}>
              Commit {plan.entries_to_push.length} change{plan.entries_to_push.length === 1 ? "" : "s"}
            </KoastButton>
          </footer>
        )}
        {phase === "success" && (
          <footer style={{ display: "flex", justifyContent: "flex-end", padding: "12px 20px", borderTop: "1px solid #E5E2DC" }}>
            <KoastButton variant="primary" size="md" onClick={onClose}>
              Done
            </KoastButton>
          </footer>
        )}
      </div>
    </div>
  );
}

function PreviewPlanBody({
  plan,
  raw,
  jsonOpen,
  onToggleJson,
  targetRecs,
}: {
  plan: PreviewPlan;
  raw: unknown;
  jsonOpen: boolean;
  onToggleJson: () => void;
  targetRecs: PricingRecommendation[];
}) {
  const recByDate = useMemo(() => {
    const m = new Map<string, PricingRecommendation>();
    for (const r of targetRecs) m.set(r.date, r);
    return m;
  }, [targetRecs]);
  const skippedGrouped = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of plan.skipped_fields ?? []) {
      const reason = s.reason ?? "unknown";
      if (!m.has(reason)) m.set(reason, []);
      m.get(reason)!.push(s.date);
    }
    return Array.from(m.entries());
  }, [plan]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {plan.bdc_state_at && (
        <div style={{ fontSize: 11, color: "var(--tideline)", letterSpacing: "0.04em" }}>
          BDC state as of {new Date(plan.bdc_state_at).toLocaleString()}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={sectionLabel}>Changes ({plan.entries_to_push.length})</span>
        {plan.entries_to_push.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--tideline)" }}>Nothing would push — all targeted dates were refused by the safe-restrictions helper.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {plan.entries_to_push.map((e) => {
              const rec = recByDate.get(e.date);
              const current = rec?.current_rate ?? null;
              const suggested = e.rate ?? rec?.suggested_rate ?? null;
              const delta = current != null && suggested != null ? suggested - current : null;
              return (
                <div
                  key={e.date}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "#FAFAF7",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--coastal)", fontWeight: 500 }}>{e.date}</span>
                  <KoastRate value={current} variant="inline" delta={delta} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {skippedGrouped.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={sectionLabel}>Unchanged</span>
          {skippedGrouped.map(([reason, datesList]) => (
            <KoastCard key={reason} variant="quiet" padding={12}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--coastal)", marginBottom: 4 }}>
                {SKIP_REASON_COPY[reason] ?? reason}
              </div>
              <div style={{ fontSize: 11, color: "var(--tideline)" }}>
                {datesList.length} date{datesList.length === 1 ? "" : "s"}: {datesList.slice(0, 6).join(", ")}
                {datesList.length > 6 && ` +${datesList.length - 6} more`}
              </div>
            </KoastCard>
          ))}
        </div>
      )}

      <details open={jsonOpen} onToggle={onToggleJson}>
        <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--tideline)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Raw plan JSON
        </summary>
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: "#FAFAF7",
            fontSize: 11,
            lineHeight: 1.4,
            color: "var(--coastal)",
            maxHeight: 220,
            overflow: "auto",
          }}
        >
          {JSON.stringify(raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SuccessBody({ applyResult }: { applyResult: { applied_count: number; performance_row_ids?: string[] } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(26,122,90,0.14)",
            color: "var(--lagoon)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={16} />
        </span>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--coastal)" }}>
          Koast updated {applyResult.applied_count} rate{applyResult.applied_count === 1 ? "" : "s"} on Booking.com.
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--tideline)", lineHeight: 1.5 }}>
        Visible in extranet within 2 minutes. We&apos;ll capture the outcome if these dates book.
      </div>
      {applyResult.performance_row_ids && applyResult.performance_row_ids.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--tideline)" }}>
          Performance rows created: {applyResult.performance_row_ids.length}
        </div>
      )}
    </div>
  );
}

function PartialBody({ applyResult, onRetry }: {
  applyResult: { applied_count: number; failed_batches?: Array<{ date_from: string; date_to: string; error: string }> };
  onRetry: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--coastal)" }}>
        Partial push: {applyResult.applied_count} succeeded, {applyResult.failed_batches?.length ?? 0} batch{(applyResult.failed_batches?.length ?? 0) === 1 ? "" : "es"} failed
      </div>
      {applyResult.failed_batches?.map((b, i) => (
        <KoastCard key={i} variant="quiet" padding={10}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--coastal)" }}>
            {b.date_from} → {b.date_to}
          </div>
          <div style={{ fontSize: 11, color: "var(--coral-reef)" }}>{b.error}</div>
        </KoastCard>
      ))}
      <KoastButton variant="secondary" size="sm" onClick={onRetry}>
        Retry failed
      </KoastButton>
    </div>
  );
}

// ReactNode import is retained for consumer typing; remove when
// RecRow adopts a shared row-children shape.
export type PricingTabChildren = ReactNode;
