/**
 * Plan gating (P5) — the server-side enforcement helper for the roadmap rule
 * "anything that calls Channex is Pro". Applied at the Channex-touching write
 * seams (the unified OTA writer + its route boundaries, channel connect/activate,
 * messaging send, reviews sync). NEVER on the cleaner token routes or iCal/read paths.
 *
 * INERT when billing is off (no behavior change through A5) and a no-op for
 * comped hosts (the owner / dogfood / A-rig). Throw → the route maps it to 402.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillingEnabled } from "./stripe";
import { resolveAccess } from "./plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

export class PlanGateError extends Error {
  readonly code = "plan_gate_blocked";
  readonly httpStatus = 402;
  constructor(message = "This feature requires Koast Pro. Upgrade to connect channels and push rates.") {
    super(message);
    this.name = "PlanGateError";
  }
}

/**
 * Throw PlanGateError when billing is ON and the host lacks Pro access. INERT
 * (no-op) when billing is off; passes for comped + active/trialing hosts.
 */
export async function requireProAccess(svc: Svc, userId: string): Promise<void> {
  if (!isBillingEnabled()) return; // inert through A5
  const access = await resolveAccess(svc, userId);
  if (!access.proAccess) throw new PlanGateError();
}

/** Non-throwing variant for callers that branch (e.g. applyOtaRestrictions). */
export async function hasProAccess(svc: Svc, userId: string): Promise<boolean> {
  if (!isBillingEnabled()) return true;
  const access = await resolveAccess(svc, userId);
  return access.proAccess;
}
