/**
 * propose_update_pricing_rule (P4.1) — the agent's host-gated proposal to change
 * a property's pricing GUARDRAILS (base / min / max rate). It EXECUTES NOTHING:
 * it resolves the property, reads the current bounds, pre-validates the merged
 * result (min <= base <= max), and calls createProposal(createdBy:'agent') —
 * landing a PENDING `update_pricing_rule` proposal + firing the bell. On approval
 * the action runs the EXTRACTED updatePricingRule single-writer (no side-door).
 *
 * The canonical use: the engine inferred a max_rate that sits BELOW the comp
 * floor + the demand curve (the P4.1 $230 case). The recs already say "comps
 * suggest a floor of $238 — above your max_rate of $230"; this is how the host
 * approves raising their OWN ceiling, propose → approve like every other write.
 *
 * NOT an OTA write — it changes the host's pricing_rules row, not Channex. So it
 * is host-gated-executable even while the OTA flag is off (raising the ceiling
 * only changes what the engine SUGGESTS next run; pushing a rate to an OTA stays
 * impossible until A4). Non-gated tool (requiresGate:false): the proposal IS the
 * gate; host approval executes it.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";
import {
  validatePricingBounds,
  RULE_FIELD_LABELS,
  type RuleField,
  type RuleBounds,
} from "@/lib/pricing/update-rule";
import type { BlockData } from "@/lib/agent/render/blocks";
import { resolveProperty } from "./resolve-property";

const InputSchema = z.object({
  property: z.string().min(1).describe("The property name the host referenced (e.g. 'Villa Jamaica')."),
  field: z
    .enum(["max_rate", "min_rate", "base_rate"])
    .describe(
      "Which pricing-rule bound to change. Use 'max_rate' to raise the ceiling when recommendations say the market floor exceeds the host's max.",
    ),
  value: z.number().positive().describe("The new dollar value for that bound."),
  rationale: z.string().min(1).max(280).describe("One short line on why — shown on the proposal card."),
});
type Input = z.infer<typeof InputSchema>;

const OutputSchema = z.object({
  created: z.boolean(),
  proposal_id: z.string().optional(),
  reason: z.string().optional(),
});
type Output = z.infer<typeof OutputSchema>;

const DESCRIPTION = `Propose changing a property's pricing GUARDRAILS — the base, minimum, or maximum nightly rate Koast is allowed to suggest. This does NOT change anything — it creates a suggestion the host approves (Approve updates the rule; Dismiss does nothing).

Use this mainly to RAISE the max_rate when the pricing recommendations report that the local-market floor exceeds the host's current ceiling (e.g. "comps suggest a floor of $238 — above your max_rate of $230, Koast is holding at $230"). That's the engine telling you the host's auto-inferred ceiling is leaving market money on the table; propose raising it so the engine can price up to the market.

Call this ONLY on an explicit host instruction, or when read_pricing surfaces a ceiling-binding conflict and the host asks what to do about it. One proposal per change. If you can't identify the property, return created:false with a reason. This changes a pricing GUARDRAIL only — it never pushes a rate to a channel (that's a separate adjust_price proposal).`;

export const proposeUpdatePricingRuleTool: Tool<Input, Output> = {
  name: "propose_update_pricing_rule",
  description: DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  requiresGate: false,
  handler: async (input, context) => {
    const svc = createServiceClient();
    const hostId = context.host.id;

    const prop = await resolveProperty(svc, hostId, input.property);
    if ("error" in prop) return { created: false, reason: prop.error };

    // Read current bounds for the old→new display + a propose-time validation
    // (refuse here rather than fail at approval).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (svc.from("pricing_rules") as any)
      .select("base_rate, min_rate, max_rate")
      .eq("property_id", prop.id)
      .maybeSingle();
    if (!existing) {
      return {
        created: false,
        reason: `${prop.name} has no pricing rules yet — the host should set them in Settings first.`,
      };
    }

    const field = input.field as RuleField;
    const current: RuleBounds = {
      base_rate: Number(existing.base_rate),
      min_rate: Number(existing.min_rate),
      max_rate: Number(existing.max_rate),
    };
    const oldValue = current[field];
    if (oldValue === input.value) {
      return { created: false, reason: `${prop.name}'s ${RULE_FIELD_LABELS[field]} is already $${input.value}.` };
    }

    const merged: RuleBounds = { ...current, [field]: input.value };
    const invalid = validatePricingBounds(merged);
    if (invalid) return { created: false, reason: invalid };

    const block: BlockData = {
      kind: "rule_change",
      data: {
        property: prop.name,
        field,
        label: RULE_FIELD_LABELS[field],
        oldValue,
        newValue: input.value,
      },
    };

    const { proposal } = await createProposal(svc, {
      hostId,
      propertyId: prop.id,
      actionType: "update_pricing_rule",
      payload: {
        block,
        action: { propertyId: prop.id, patch: { [field]: input.value } },
      },
      rationale: input.rationale,
      createdBy: "agent",
    });

    return { created: true, proposal_id: proposal.id };
  },
};
