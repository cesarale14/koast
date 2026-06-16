/**
 * Opportunity detectors (P4.4) — the first high-value pricing VERBS. Scans a
 * property's fresh engine output for two named, evidence-backed revenue
 * opportunities and emits each as an adjust_price PROPOSAL through the P3 lane
 * (createProposal, createdBy:'worker') — landing pending on Koast-suggests + the
 * bell. Execution stays impossible until the OTA flag flips at A4 (adjust_price
 * is otaTouching → creatable while off, never executable).
 *
 *   1. GAP NIGHT — an orphan 1–2 night gap between bookings (the engine's
 *      gap_night signal already scores it negative and pulls the suggested rate
 *      DOWN to fill it). We propose the discount to actually fill the orphan.
 *   2. STALE WEEKEND — a future unbooked Fri/Sat whose engine-suggested rate
 *      materially EXCEEDS the current rate (leaving weekend money on the table).
 *      We propose the raise.
 *
 * Reuse, no parallel logic: opportunities are read off the SAME pricing_recommendations
 * the engine writes (the gap_night score + competitor comp-basis ride
 * reason_signals; the suggested_rate is already rules-clamped). The proposed rate
 * is RE-bounded by applyPricingRules at propose time (whiplash) exactly like
 * propose_adjust_price — the number can never reach a proposal (and thus never
 * Channex) unbounded. Stale recs never seed an opportunity (isRecFresh gate).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createProposal } from "@/lib/proposals/server";
import { isLowConfidenceRec, LOW_CONFIDENCE_NOTE } from "./confidence";
import { applyPricingRules, type PricingRulesRow } from "./apply-rules";
import { isRecFresh, todayStrUTC } from "./freshness";
import type { BlockData } from "@/lib/agent/render/blocks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

/** A stale weekend must beat the current rate by BOTH a % and an absolute floor
 *  (so we don't spam tiny moves on cheap units). */
const STALE_WEEKEND_MIN_DELTA_PCT = 0.06;
const STALE_WEEKEND_MIN_DELTA_ABS = 12;
const DEFAULT_MAX_PROPOSALS = 8;

const DEFAULT_RULES: PricingRulesRow = {
  base_rate: 150,
  min_rate: 50,
  max_rate: 1000,
  channel_markups: {},
  max_daily_delta_pct: 0.25,
  comp_floor_pct: 0.85,
  auto_apply: false,
};

export type OpportunityKind = "gap_night" | "stale_weekend";

export interface DetectedOpportunity {
  kind: OpportunityKind;
  date: string;
  currentRate: number;
  proposedRate: number;
  /** proposedRate − currentRate (negative for a gap-night discount). */
  deltaAbs: number;
  rationale: string;
  /** P7: the source rec has an insufficient comp set — the proposal carries an
   * "Early estimate" chip + a low-confidence note so a new host's first
   * auto-proposals read as estimates. */
  lowConfidence: boolean;
}

export interface DetectResult {
  created: Array<{ proposalId: string; opportunity: DetectedOpportunity }>;
  detected: number;
  skippedAlreadyProposed: number;
  /** Opportunities found but not proposed this run because maxProposals capped it. */
  capped: number;
}

type RecRow = {
  date: string;
  suggested_rate: number | string | null;
  created_at: string | null;
  reason_signals: Record<string, unknown> | null;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function signalScore(rs: Record<string, unknown> | null, key: string): number | null {
  const sig = rs?.[key] as { score?: unknown } | undefined;
  return sig ? num(sig.score) : null;
}
function signalReason(rs: Record<string, unknown> | null, key: string): string | null {
  const sig = rs?.[key] as { reason?: unknown } | undefined;
  return sig && typeof sig.reason === "string" ? sig.reason : null;
}

function calendarChangeBlock(property: string, date: string, rate: number, lowConfidence: boolean): BlockData {
  return { kind: "calendar_change", data: { property, date, change: "price", value: rate, dateCount: 1, lowConfidence } };
}

/** Is `date` (YYYY-MM-DD) a Friday or Saturday in UTC? */
function isWeekend(date: string): boolean {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 5 || d === 6;
}

export async function detectPricingOpportunities(
  svc: Svc,
  args: {
    propertyId: string;
    hostId: string;
    propertyName?: string | null;
    maxProposals?: number;
    /** Injectable clock for deterministic tests. */
    nowISO?: string;
  },
): Promise<DetectResult> {
  const maxProposals = args.maxProposals ?? DEFAULT_MAX_PROPOSALS;
  const nowISO = args.nowISO ?? new Date().toISOString();
  const today = todayStrUTC(nowISO);
  const propertyName = args.propertyName ?? "your property";

  // 1. Fresh pending recs (date >= today, recent run) — the engine output.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recData } = await (svc.from("pricing_recommendations") as any)
    .select("date, suggested_rate, created_at, reason_signals")
    .eq("property_id", args.propertyId)
    .eq("status", "pending")
    .gte("date", today)
    .order("date", { ascending: true });
  const recs = ((recData ?? []) as RecRow[]).filter((r) =>
    isRecFresh({ date: r.date, createdAt: r.created_at }, nowISO),
  );
  if (recs.length === 0) return { created: [], detected: 0, skippedAlreadyProposed: 0, capped: 0 };

  // 2. Pricing rules (whiplash bound) + current applied base rate per date.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rulesRow } = await (svc.from("pricing_rules") as any)
    .select("base_rate, min_rate, max_rate, channel_markups, max_daily_delta_pct, comp_floor_pct, auto_apply")
    .eq("property_id", args.propertyId)
    .maybeSingle();
  const rules: PricingRulesRow = rulesRow
    ? {
        base_rate: Number(rulesRow.base_rate),
        min_rate: Number(rulesRow.min_rate),
        max_rate: Number(rulesRow.max_rate),
        channel_markups: rulesRow.channel_markups ?? {},
        max_daily_delta_pct: Number(rulesRow.max_daily_delta_pct),
        comp_floor_pct: Number(rulesRow.comp_floor_pct),
        auto_apply: !!rulesRow.auto_apply,
      }
    : DEFAULT_RULES;

  const dates = recs.map((r) => r.date);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rateRows } = await (svc.from("calendar_rates") as any)
    .select("date, applied_rate, base_rate")
    .eq("property_id", args.propertyId)
    .is("channel_code", null)
    .in("date", dates);
  const currentByDate = new Map<string, number>();
  for (const r of (rateRows ?? []) as Array<{ date: string; applied_rate: number | string | null; base_rate: number | string | null }>) {
    const cur = num(r.applied_rate) ?? num(r.base_rate);
    if (cur != null) currentByDate.set(r.date, cur);
  }
  const currentFor = (date: string): number => currentByDate.get(date) ?? rules.base_rate;

  // 3. Booked dates (skip — a filled night is not an opportunity).
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bookingRows } = await (svc.from("bookings") as any)
    .select("check_in, check_out")
    .eq("property_id", args.propertyId)
    .lte("check_in", maxDate)
    .gte("check_out", minDate)
    .in("status", ["confirmed", "completed"]);
  const bookings = (bookingRows ?? []) as Array<{ check_in: string; check_out: string }>;
  const isBooked = (date: string): boolean =>
    bookings.some((b) => date >= b.check_in && date < b.check_out);

  // 4. Dedup against dates already carried by a pending adjust_price proposal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRows } = await (svc.from("proposals") as any)
    .select("payload")
    .eq("host_id", args.hostId)
    .eq("property_id", args.propertyId)
    .eq("action_type", "adjust_price")
    .eq("status", "pending");
  const alreadyProposed = new Set<string>();
  for (const p of (propRows ?? []) as Array<{ payload: { action?: { dates?: unknown } } | null }>) {
    const ds = p.payload?.action?.dates;
    if (Array.isArray(ds)) for (const d of ds) if (typeof d === "string") alreadyProposed.add(d);
  }

  // 5. Detect.
  const opportunities: DetectedOpportunity[] = [];
  let skippedAlreadyProposed = 0;
  for (const rec of recs) {
    const suggested = num(rec.suggested_rate);
    if (suggested == null || suggested <= 0) continue;
    if (isBooked(rec.date)) continue;
    if (alreadyProposed.has(rec.date)) {
      skippedAlreadyProposed++;
      continue;
    }
    const current = currentFor(rec.date);

    // Whiplash-bound the proposed rate against the rules (vs the current rate),
    // exactly like propose_adjust_price. compSet floor skipped (insufficient).
    const { adjusted_rate } = applyPricingRules({
      rules,
      suggestedRate: suggested,
      previousAppliedRate: current,
      compSetP25: null,
      compSetQuality: "insufficient",
      date: rec.date,
    });
    const proposed = Math.round(adjusted_rate * 100) / 100;
    const deltaAbs = Math.round((proposed - current) * 100) / 100;

    const gapScore = signalScore(rec.reason_signals, "gap_night") ?? 0;
    // GAP NIGHT — an orphan/short gap (negative gap_night score) where the
    // engine wants to drop the rate to fill it.
    if (gapScore < 0 && proposed < current) {
      const gapReason = signalReason(rec.reason_signals, "gap_night") ?? "orphan night between bookings";
      opportunities.push({
        kind: "gap_night",
        date: rec.date,
        currentRate: current,
        proposedRate: proposed,
        deltaAbs,
        rationale: `Gap night (${gapReason.toLowerCase()}) — drop $${current} → $${proposed} to fill it before it goes empty.`,
        lowConfidence: isLowConfidenceRec(rec.reason_signals),
      });
      continue; // gap-night is the more specific signal; don't also flag stale-weekend
    }

    // STALE WEEKEND — a future Fri/Sat priced materially below the engine's
    // suggestion (leaving weekend money on the table).
    if (isWeekend(rec.date) && proposed > current) {
      const pctOver = current > 0 ? (proposed - current) / current : 0;
      if (proposed - current >= STALE_WEEKEND_MIN_DELTA_ABS && pctOver >= STALE_WEEKEND_MIN_DELTA_PCT) {
        const compReason = signalReason(rec.reason_signals, "competitor");
        const basis = compReason ? ` (${compReason})` : "";
        opportunities.push({
          kind: "stale_weekend",
          date: rec.date,
          currentRate: current,
          proposedRate: proposed,
          deltaAbs,
          rationale: `Weekend below market — raise $${current} → $${proposed}${basis}.`,
          lowConfidence: isLowConfidenceRec(rec.reason_signals),
        });
      }
    }
  }

  // 6. Rank by absolute dollar move (biggest opportunity first), cap, emit.
  opportunities.sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs));
  const toEmit = opportunities.slice(0, maxProposals);
  const capped = opportunities.length - toEmit.length;

  const created: Array<{ proposalId: string; opportunity: DetectedOpportunity }> = [];
  for (const opp of toEmit) {
    const payload = {
      block: calendarChangeBlock(propertyName, opp.date, opp.proposedRate, opp.lowConfidence),
      action: { propertyId: args.propertyId, dates: [opp.date], rate: opp.proposedRate, channel: null },
    };
    const { proposal } = await createProposal(svc, {
      hostId: args.hostId,
      propertyId: args.propertyId,
      actionType: "adjust_price",
      payload,
      rationale: opp.lowConfidence ? `${opp.rationale} ${LOW_CONFIDENCE_NOTE}` : opp.rationale,
      createdBy: "worker",
    });
    created.push({ proposalId: proposal.id, opportunity: opp });
  }

  return { created, detected: opportunities.length, skippedAlreadyProposed, capped };
}
