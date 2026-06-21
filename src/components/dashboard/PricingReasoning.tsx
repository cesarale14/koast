"use client";

/**
 * PricingReasoning — the /pricing page, design-pass Phase 3.
 *
 * Framing (Cesar, Q-D): "the agent's pricing reasoning made browsable," NOT a PMS
 * pricing tab. Four sections, ONE register end to end:
 *   1. Pricing health  — the agent's read (opportunities + $ on the table).
 *   2. Koast recommends — the LITERAL Today pricing proposals, rendered through
 *      the SAME reconciled ProposalCard + confidence cue (gold money delta,
 *      neutral cue, before→after focal). No separate table/grid.
 *   3. Track record     — approved recs → did they book (pricing_performance).
 *   4. Your rates       — the adopted polish/calendar/PricingTab editor.
 *
 * Replaces the DS-forbidden signal-cards-with-progress-bars PricingDashboard.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import KoastSegmentedControl from "@/components/polish/KoastSegmentedControl";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { PROPOSALS_CHANGED_EVENT } from "@/lib/notifications/describe";
import { usePricingTab } from "@/hooks/usePricingTab";
import PricingTab, { type RateBundle } from "@/components/polish/calendar/PricingTab";
import type { NormalizedProposal } from "@/lib/proposals/server";

// The pricing-lane proposals: a rate move is the core recommendation; block /
// min-stay are calendar moves that are also the agent's pricing reasoning. ALL
// render through the one ProposalCard.
const PRICING_ACTIONS = new Set(["adjust_price", "block_dates", "set_min_stay"]);

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--golden)",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  borderRadius: 14,
  background: "var(--white)",
  padding: "20px 22px",
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: "var(--deep-sea)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--tideline)" }}>{label}</span>
    </div>
  );
}

function PropertyPricing({ propertyId }: { propertyId: string }) {
  const { toast } = useToast();
  const { rules, performance } = usePricingTab(propertyId);

  // ── Recommendations: pending PRICING proposals, via the ProposalCard ───────
  const [proposals, setProposals] = useState<NormalizedProposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadProposals = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals?status=pending&property_id=${propertyId}`);
      const d = await res.json().catch(() => ({}));
      const all = Array.isArray(d?.proposals) ? (d.proposals as NormalizedProposal[]) : [];
      setProposals(all.filter((p) => PRICING_ACTIONS.has(p.actionType)));
    } catch {
      setProposals([]);
    } finally {
      setLoaded(true);
    }
  }, [propertyId]);
  useEffect(() => {
    void loadProposals();
    const onNudge = () => void loadProposals();
    window.addEventListener(PROPOSALS_CHANGED_EVENT, onNudge);
    return () => window.removeEventListener(PROPOSALS_CHANGED_EVENT, onNudge);
  }, [loadProposals]);

  // ── Scorecard: the agent's read, derived from the recommendations + rules ──
  const potential = useMemo(() => {
    let sum = 0;
    for (const p of proposals) {
      const b = p.block;
      if (b && b.kind === "calendar_change" && b.data.change === "price" && b.data.value != null && b.data.currentValue != null) {
        sum += Math.abs(b.data.value - b.data.currentValue);
      }
    }
    return sum;
  }, [proposals]);
  const oppCount = proposals.length;
  const healthRead =
    oppCount === 0
      ? "Your rates are tracking — nothing Koast wants to change right now."
      : `Koast sees ${oppCount} pricing ${oppCount === 1 ? "move" : "moves"} worth making${
          potential > 0 ? ` — about ${money(potential)} in play across them` : ""
        }.`;
  const autoLine = rules
    ? rules.auto_apply
      ? "Auto-apply is on — Koast pushes these for you."
      : "You approve each one below."
    : null;

  // ── Editor: the adopted PricingTab, fed today's bundle ─────────────────────
  const today = useMemo(() => todayLocal(), []);
  const [bundleByDate, setBundleByDate] = useState<Map<string, RateBundle>>(new Map());
  const [editorLoading, setEditorLoading] = useState(true);
  const loadBundle = useCallback(async () => {
    setEditorLoading(true);
    try {
      const res = await fetch(`/api/calendar/rates?property_id=${propertyId}&date=${today}`);
      const body = await res.json();
      if (res.ok) setBundleByDate(new Map([[today, body as RateBundle]]));
    } catch {
      /* leave empty → PricingTab shows its own loading/empty */
    } finally {
      setEditorLoading(false);
    }
  }, [propertyId, today]);
  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  const applyBaseBulk = useCallback(
    async (rate: number, dates: string[], masterPush?: boolean) => {
      try {
        const res = await fetch(`/api/calendar/base-rate/${propertyId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dates, rate, masterPush: masterPush === true }),
        });
        const body = await res.json();
        if (!res.ok) return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
        return { ok: true, channels: body.channels };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [propertyId],
  );
  const applyPlatformBulk = useCallback(
    async (channelCode: string, rate: number, dates: string[]) => {
      try {
        const res = await fetch(`/api/channels/rates/${propertyId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dates, channel_code: channelCode, rate }),
        });
        const body = await res.json();
        if (!res.ok) return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
        return { ok: true, perDate: body.per_date };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [propertyId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
      {/* 1 — Pricing health (the agent's read) */}
      <section>
        <Eyebrow>Pricing health</Eyebrow>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: "var(--deep-sea)", fontWeight: 500 }}>
            {healthRead}
          </p>
          {autoLine && (
            <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--tideline)" }}>{autoLine}</p>
          )}
          {(oppCount > 0 || (performance && performance.applied_count > 0)) && (
            <div style={{ marginTop: 18, display: "flex", gap: 36, flexWrap: "wrap" }}>
              <Stat value={String(oppCount)} label={oppCount === 1 ? "opportunity" : "opportunities"} />
              {potential > 0 && <Stat value={money(potential)} label="in play" />}
            </div>
          )}
        </div>
      </section>

      {/* 2 — Koast recommends (THE centerpiece — the literal Today proposals) */}
      <section>
        <Eyebrow>Koast recommends</Eyebrow>
        {!loaded ? (
          <div style={{ ...cardStyle, color: "var(--tideline)", fontSize: 13 }}>Loading recommendations…</div>
        ) : oppCount === 0 ? (
          <div style={{ ...cardStyle, color: "var(--tideline)", fontSize: 14, lineHeight: 1.5 }}>
            No pricing moves to review right now. Koast surfaces them here the moment it spots one — the same
            cards land on your home.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {proposals.map((p) => (
              <li key={p.id}>
                <ProposalCard proposal={p} onResolved={loadProposals} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3 — Track record (approved recs → did they book) */}
      <section>
        <Eyebrow>Track record</Eyebrow>
        <div style={cardStyle}>
          {performance && performance.applied_count > 0 ? (
            <>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "var(--deep-sea)" }}>
                Of the {performance.applied_count} {performance.applied_count === 1 ? "rec" : "recs"} you&apos;ve
                approved, {performance.booked_count} {performance.booked_count === 1 ? "date booked" : "dates booked"}
                {performance.revenue_captured > 0 ? ` — ${money(performance.revenue_captured)} captured` : ""}.
              </p>
              <div style={{ marginTop: 18, display: "flex", gap: 36, flexWrap: "wrap" }}>
                <Stat value={String(performance.applied_count)} label="approved" />
                <Stat value={String(performance.booked_count)} label="booked" />
                {performance.acceptance_rate != null && (
                  <Stat value={`${Math.round(performance.acceptance_rate * 100)}%`} label="acceptance" />
                )}
                {performance.revenue_captured > 0 && (
                  <Stat value={money(performance.revenue_captured)} label="captured" />
                )}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: "var(--tideline)", lineHeight: 1.5 }}>
              No track record yet — once you approve a few recs and they book, Koast shows how its calls landed here.
            </p>
          )}
        </div>
      </section>

      {/* 4 — Your rates (the adopted PricingTab editor) */}
      <section>
        <Eyebrow>Your rates</Eyebrow>
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <PricingTab
            propertyId={propertyId}
            selectedDates={[today]}
            bookedDates={new Set()}
            bundleByDate={bundleByDate}
            loading={editorLoading}
            onToast={(t, tone) => toast(t, tone === "ok" ? "success" : "error")}
            onApplyPlatformBulk={applyPlatformBulk}
            onApplyBaseBulk={applyBaseBulk}
            onRefresh={loadBundle}
          />
        </div>
        <p style={{ margin: "10px 2px 0", fontSize: 12.5, color: "var(--tideline)" }}>
          Editing today&apos;s rate. For any other date, the full per-date editor lives on the Calendar.
        </p>
      </section>
    </div>
  );
}

export default function PricingReasoning({ properties }: { properties: { id: string; name: string }[] }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: "var(--deep-sea)", letterSpacing: "-0.01em" }}>
          Pricing
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--tideline)", lineHeight: 1.5 }}>
          What Koast sees in your rates, what it suggests, and how its calls have landed.
        </p>
      </header>

      {properties.length > 1 && (
        <div style={{ marginBottom: 28 }}>
          <KoastSegmentedControl
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            value={propertyId}
            onChange={setPropertyId}
          />
        </div>
      )}

      {propertyId && <PropertyPricing key={propertyId} propertyId={propertyId} />}
    </div>
  );
}
