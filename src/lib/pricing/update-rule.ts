/**
 * updatePricingRule (P4.1) — the extracted single-writer for a host-approved
 * change to a property's pricing_rules bounds (base/min/max). It is the shared
 * lib fn the `update_pricing_rule` proposal action executes on approval — the
 * agent's hands get NO parallel write path (mirrors assignCleaner / notifyCleaner).
 *
 * The P4.1 diagnostic case: the engine inferred a max_rate ($230) that sits below
 * the comp floor ($237.58) and the whole winter high-season demand curve, so it
 * correctly surfaces the conflict and asks the host to raise their ceiling. The
 * host approves the raise here (propose → approve, like every other write).
 *
 * Partial patch, not a full-row replace: we read the existing row, merge only the
 * bound(s) being changed, and re-validate the CHECK invariant (min <= base <= max)
 * against the MERGED row so a one-field raise can't silently violate the others.
 * Writes source='host_set' (the host chose this) + bumps updated_at.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyPropertyOwnership } from "@/lib/auth/api-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

export type RuleField = "max_rate" | "min_rate" | "base_rate";

export const RULE_FIELD_LABELS: Record<RuleField, string> = {
  max_rate: "Maximum rate",
  min_rate: "Minimum rate",
  base_rate: "Base rate",
};

export type UpdatePricingRulePatch = Partial<Record<RuleField, number>>;

export type UpdatePricingRuleResult =
  | {
      ok: true;
      summary: {
        property_id: string;
        changed: Array<{ field: RuleField; from: number | null; to: number }>;
        base_rate: number;
        min_rate: number;
        max_rate: number;
      };
    }
  | { ok: false; error: string };

export interface RuleBounds {
  base_rate: number;
  min_rate: number;
  max_rate: number;
}
type ExistingRule = RuleBounds;

/** Validate merged bounds against the pricing_rules CHECK (min <= base <= max).
 *  Exported so the propose tool can pre-validate a patch BEFORE creating a
 *  proposal (refuse at propose-time rather than fail at approval). Returns a
 *  human-readable error or null when valid. */
export function validatePricingBounds(m: RuleBounds): string | null {
  if (!(m.base_rate > 0)) return "base_rate must be a positive number";
  if (!(m.min_rate >= 0)) return "min_rate must be a non-negative number";
  if (!(m.max_rate > 0)) return "max_rate must be a positive number";
  if (m.min_rate > m.base_rate) return `min_rate ($${m.min_rate}) must be ≤ base_rate ($${m.base_rate})`;
  if (m.max_rate < m.base_rate) return `max_rate ($${m.max_rate}) must be ≥ base_rate ($${m.base_rate})`;
  return null;
}

export async function updatePricingRule(
  svc: Svc,
  args: { propertyId: string; hostId: string; patch: UpdatePricingRulePatch },
): Promise<UpdatePricingRuleResult> {
  const { propertyId, hostId, patch } = args;

  const fields = (Object.keys(patch) as RuleField[]).filter((f) => patch[f] != null);
  if (fields.length === 0) return { ok: false, error: "No pricing-rule fields to update." };
  for (const f of fields) {
    const v = patch[f]!;
    if (!Number.isFinite(v) || v <= 0) return { ok: false, error: `${f} must be a positive number.` };
  }

  // Ownership defense-in-depth (the service client bypasses RLS).
  const owned = await verifyPropertyOwnership(hostId, propertyId);
  if (!owned) return { ok: false, error: "That property isn't yours." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: readErr } = await (svc.from("pricing_rules") as any)
    .select("base_rate, min_rate, max_rate")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Couldn't read pricing rules: ${readErr.message}` };
  if (!existing) {
    return { ok: false, error: "This property has no pricing rules yet — set them in Settings first." };
  }

  const current: ExistingRule = {
    base_rate: Number(existing.base_rate),
    min_rate: Number(existing.min_rate),
    max_rate: Number(existing.max_rate),
  };
  const merged: ExistingRule = {
    base_rate: patch.base_rate ?? current.base_rate,
    min_rate: patch.min_rate ?? current.min_rate,
    max_rate: patch.max_rate ?? current.max_rate,
  };

  const invalid = validatePricingBounds(merged);
  if (invalid) return { ok: false, error: invalid };

  const changed = fields.map((field) => ({ field, from: current[field], to: patch[field]! }));
  // No-op guard: nothing actually changed value.
  if (changed.every((c) => c.from === c.to)) {
    return { ok: false, error: "That's already the current value — nothing to change." };
  }

  const update: Record<string, unknown> = { source: "host_set", updated_at: new Date().toISOString() };
  for (const f of fields) update[f] = patch[f];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (svc.from("pricing_rules") as any)
    .update(update)
    .eq("property_id", propertyId);
  if (upErr) return { ok: false, error: `Couldn't update pricing rules: ${upErr.message}` };

  return {
    ok: true,
    summary: { property_id: propertyId, changed, ...merged },
  };
}
