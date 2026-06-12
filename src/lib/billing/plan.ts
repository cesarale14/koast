/**
 * Plan resolution (P5) — the single source of truth for "does this host have Pro
 * feature access right now?" Derived (never stored) from user_subscriptions +
 * the billing-enabled spine.
 *
 * Rules (in order):
 *   1. Billing not enabled (no Stripe env) → proAccess = true for EVERYONE. The
 *      gate is INERT through A5 so the app is never bricked pre-launch.
 *   2. comped = true → Pro (the owner / dogfood / A1–A4 rig; billing never bricks it).
 *   3. status ∈ {active, trialing} → Pro.
 *   4. otherwise → Free.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingPlan, SubscriptionStatus } from "@/lib/db/schema";
import { isBillingEnabled } from "./stripe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

export type AccessSource = "billing_disabled" | "comped" | "stripe" | "default";

export interface AccessResolution {
  proAccess: boolean;
  plan: BillingPlan;
  source: AccessSource;
  status: SubscriptionStatus | null;
  comped: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingEnabled: boolean;
}

const PRO_STATUSES = new Set<SubscriptionStatus>(["active", "trialing"]);

interface SubRow {
  status: SubscriptionStatus | null;
  comped: boolean | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

/** Read the host's subscription row (or null). Service-role read. */
export async function readSubscription(svc: Svc, userId: string): Promise<SubRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc.from("user_subscriptions") as any)
    .select("status, comped, stripe_customer_id, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as SubRow | null) ?? null;
}

export async function resolveAccess(svc: Svc, userId: string): Promise<AccessResolution> {
  // 1. Inert when billing is off — everyone has access; never brick pre-launch.
  if (!isBillingEnabled()) {
    return {
      proAccess: true,
      plan: "pro",
      source: "billing_disabled",
      status: null,
      comped: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      billingEnabled: false,
    };
  }

  const row = await readSubscription(svc, userId);
  const comped = row?.comped === true;
  const status = row?.status ?? null;

  // 2. comped → Pro (owner / dogfood / A-rig; billing never downgrades it).
  if (comped) {
    return mk(true, "pro", "comped", row);
  }
  // 3. active / trialing → Pro.
  if (status && PRO_STATUSES.has(status)) {
    return mk(true, "pro", "stripe", row);
  }
  // 4. otherwise Free.
  return mk(false, "free", "default", row);
}

function mk(proAccess: boolean, plan: BillingPlan, source: AccessSource, row: SubRow | null): AccessResolution {
  return {
    proAccess,
    plan,
    source,
    status: row?.status ?? null,
    comped: row?.comped === true,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end === true,
    billingEnabled: true,
  };
}
