/**
 * OTA propose tools (P3.2 — HARD-FLOOR, BDC clobber class): propose_block_dates,
 * propose_adjust_price, propose_set_min_stay. The agent's hands for the calendar.
 *
 * Each tool EXECUTES NOTHING — it resolves the host's references to entity ids
 * SERVER-SIDE and calls createProposal(createdBy:'agent'), landing a PENDING
 * proposals row + firing the bell. The host approves on Today / the bell, and
 * Approve dispatches through the OTA action's execute → applyOtaRestrictions (the
 * single shared writer; BDC→safe-restrictions). Proposals are CREATABLE while the
 * OTA write gate is off; EXECUTION is impossible until it's flipped (ProposalCard
 * hides Approve when !executable + executeProposal + applyOtaRestrictions all
 * refuse). No auto-approve.
 *
 * adjust_price is WHIPLASH-BOUNDED at propose time: the requested rate is clamped
 * against the property's pricing_rules (min/max + daily-delta vs the current
 * applied rate) BEFORE it's stored — the model's raw number never reaches a
 * proposal (and thus never Channex) unbounded.
 *
 * Non-gated (requiresGate:false): the proposal IS the side effect; host approval
 * is the gate.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";
import { applyPricingRules, type PricingRulesRow } from "@/lib/pricing/apply-rules";
import type { BlockData } from "@/lib/agent/render/blocks";
import { resolveProperty } from "./resolve-property";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = ReturnType<typeof createServiceClient>;

const DatesSchema = z
  .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .min(1)
  .max(60)
  .describe("The dates to change (YYYY-MM-DD). One or more.");

const PropertySchema = z
  .string()
  .min(1)
  .describe("The property name the host referenced (e.g. 'Villa Jamaica').");

const ChannelSchema = z
  .string()
  .optional()
  .describe("Optional channel to target (e.g. 'BDC' for Booking.com). Omit to target all connected channels.");

const RationaleSchema = z.string().min(1).max(280).describe("One short line on why — shown on the proposal card.");

const ProposeOutput = z.object({
  created: z.boolean(),
  proposal_id: z.string().optional(),
  /** When created=false: why (for the model to relay/ask). */
  reason: z.string().optional(),
  /** adjust_price: set when the requested rate was clamped by pricing_rules. */
  clamped_to: z.number().optional(),
});
type Output = z.infer<typeof ProposeOutput>;

function calendarChangeBlock(
  property: string,
  dates: string[],
  change: "block" | "price" | "min_stay",
  value: number | null,
): BlockData {
  return {
    kind: "calendar_change",
    data: { property, date: dates[0], change, value, dateCount: dates.length },
  };
}

// ── propose_block_dates ─────────────────────────────────────────────────────

const BlockInput = z.object({
  property: PropertySchema,
  dates: DatesSchema,
  channel: ChannelSchema,
  rationale: RationaleSchema,
});
type BlockInputT = z.infer<typeof BlockInput>;

export const proposeBlockDatesTool: Tool<BlockInputT, Output> = {
  name: "propose_block_dates",
  description: `Propose BLOCKING dates (marking them unavailable) on the host's connected channels. This does NOT block anything — it creates a suggestion the host approves (Approve closes the dates; Dismiss does nothing).

Call this ONLY on an explicit host instruction to block/close dates — "block July 1-3 at the Villa", "close next weekend on Booking". One proposal per instruction. If you can't unambiguously identify the property, return created:false with a reason and ask the host to clarify.

Note: blocking on Booking.com works today; blocking on Airbnb/Direct is not yet supported and that channel will be skipped on approval.`,
  inputSchema: BlockInput,
  outputSchema: ProposeOutput,
  requiresGate: false,
  handler: async (input, context) => {
    const svc = createServiceClient();
    const prop = await resolveProperty(svc, context.host.id, input.property);
    if ("error" in prop) return { created: false, reason: prop.error };
    const payload = {
      block: calendarChangeBlock(prop.name, input.dates, "block", null),
      action: { propertyId: prop.id, dates: input.dates, channel: input.channel ?? null },
    };
    const { proposal } = await createProposal(svc, {
      hostId: context.host.id,
      propertyId: prop.id,
      actionType: "block_dates",
      payload,
      rationale: input.rationale,
      createdBy: "agent",
    });
    return { created: true, proposal_id: proposal.id };
  },
};

// ── propose_adjust_price (whiplash-bounded) ─────────────────────────────────

const PriceInput = z.object({
  property: PropertySchema,
  dates: DatesSchema,
  rate: z.number().positive().describe("The nightly rate in dollars to set."),
  channel: ChannelSchema,
  rationale: RationaleSchema,
});
type PriceInputT = z.infer<typeof PriceInput>;

const DEFAULT_RULES: PricingRulesRow = {
  base_rate: 150,
  min_rate: 50,
  max_rate: 1000,
  channel_markups: {},
  max_daily_delta_pct: 0.25,
  comp_floor_pct: 0.85,
  auto_apply: false,
};

/** Read the property's pricing_rules (or safe defaults) + the current applied
 *  base rate, so adjust_price can be whiplash-bounded BEFORE it's proposed. */
async function loadWhiplashContext(
  svc: Svc,
  propertyId: string,
): Promise<{ rules: PricingRulesRow; currentRate: number | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rulesRow } = await (svc.from("pricing_rules") as any)
    .select("base_rate, min_rate, max_rate, channel_markups, max_daily_delta_pct, comp_floor_pct, auto_apply")
    .eq("property_id", propertyId)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastRate } = await (svc.from("calendar_rates") as any)
    .select("applied_rate")
    .eq("property_id", propertyId)
    .is("channel_code", null)
    .not("applied_rate", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentRate = lastRate?.applied_rate != null ? Number(lastRate.applied_rate) : null;
  return { rules, currentRate };
}

export const proposeAdjustPriceTool: Tool<PriceInputT, Output> = {
  name: "propose_adjust_price",
  description: `Propose changing the nightly RATE on the host's connected channels. This does NOT change any price — it creates a suggestion the host approves (Approve pushes the rate; Dismiss does nothing).

Call this ONLY on an explicit host instruction to set/change a price — "set the Villa to $250 this weekend", "raise Friday to $300". One proposal per instruction. The rate is automatically bounded by the property's pricing rules (min/max and max daily change) — if your number is out of bounds the proposal carries the bounded rate. If you can't identify the property, return created:false with a reason.`,
  inputSchema: PriceInput,
  outputSchema: ProposeOutput,
  requiresGate: false,
  handler: async (input, context) => {
    const svc = createServiceClient();
    const prop = await resolveProperty(svc, context.host.id, input.property);
    if ("error" in prop) return { created: false, reason: prop.error };

    // WHIPLASH BOUND — clamp the requested rate against pricing_rules before it
    // is ever stored on a proposal. compSet floor is skipped (null/insufficient);
    // min/max + daily-delta (vs the current applied rate) are enforced.
    const { rules, currentRate } = await loadWhiplashContext(svc, prop.id);
    const { adjusted_rate } = applyPricingRules({
      rules,
      suggestedRate: input.rate,
      previousAppliedRate: currentRate,
      compSetP25: null,
      compSetQuality: "insufficient",
      date: input.dates[0],
    });
    const finalRate = Math.round(adjusted_rate * 100) / 100;
    const clamped = finalRate !== input.rate;

    const payload = {
      block: calendarChangeBlock(prop.name, input.dates, "price", finalRate),
      action: { propertyId: prop.id, dates: input.dates, rate: finalRate, channel: input.channel ?? null },
    };
    const rationale = clamped
      ? `${input.rationale} (bounded to $${finalRate} by your pricing rules)`
      : input.rationale;
    const { proposal } = await createProposal(svc, {
      hostId: context.host.id,
      propertyId: prop.id,
      actionType: "adjust_price",
      payload,
      rationale,
      createdBy: "agent",
    });
    return { created: true, proposal_id: proposal.id, ...(clamped ? { clamped_to: finalRate } : {}) };
  },
};

// ── propose_set_min_stay ─────────────────────────────────────────────────────

const MinStayInput = z.object({
  property: PropertySchema,
  dates: DatesSchema,
  min_stay: z.number().int().min(1).max(30).describe("Minimum nights required for arrival on these dates."),
  channel: ChannelSchema,
  rationale: RationaleSchema,
});
type MinStayInputT = z.infer<typeof MinStayInput>;

export const proposeSetMinStayTool: Tool<MinStayInputT, Output> = {
  name: "propose_set_min_stay",
  description: `Propose setting the MINIMUM-STAY (minimum nights) on the host's connected channels. This does NOT change anything — it creates a suggestion the host approves (Approve pushes the min-stay; Dismiss does nothing).

Call this ONLY on an explicit host instruction — "require 3 nights for the Villa over July 4th", "set a 2-night minimum next weekend". One proposal per instruction. If you can't identify the property, return created:false with a reason.`,
  inputSchema: MinStayInput,
  outputSchema: ProposeOutput,
  requiresGate: false,
  handler: async (input, context) => {
    const svc = createServiceClient();
    const prop = await resolveProperty(svc, context.host.id, input.property);
    if ("error" in prop) return { created: false, reason: prop.error };
    const payload = {
      block: calendarChangeBlock(prop.name, input.dates, "min_stay", input.min_stay),
      action: { propertyId: prop.id, dates: input.dates, minStay: input.min_stay, channel: input.channel ?? null },
    };
    const { proposal } = await createProposal(svc, {
      hostId: context.host.id,
      propertyId: prop.id,
      actionType: "set_min_stay",
      payload,
      rationale: input.rationale,
      createdBy: "agent",
    });
    return { created: true, proposal_id: proposal.id };
  },
};
