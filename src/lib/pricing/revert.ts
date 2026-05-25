/**
 * Rate-push revert lib — M11 Phase C item 1 (M2; D17d disposition).
 *
 * Audit-row-driven undo for a prior `/api/pricing/apply` push. Reads
 * the original agent_audit_log row's `payload.prior_state` array
 * (populated during apply via priorStateFromBdcPlan + fetchCurrentChannelState),
 * reconstructs the per-date koastProposed map, and pushes the prior
 * values back to Channex. BDC routes through buildSafeBdcRestrictions
 * (the safety guard stays on — host-side BDC adjustments made between
 * apply and revert are respected). Non-BDC direct.
 *
 * Lifecycle:
 *   1. Read original audit row by audit_log_id (host-scoped via FK)
 *   2. Validate: action_type='pricing_apply' + prior_state non-empty
 *      + context.reverted_at absent (idempotency guard)
 *   3. Resolve property + channel targets (same path as apply)
 *   4. Group prior_state by channel; build per-channel koastProposed
 *   5. Push BDC via buildSafeBdcRestrictions + Channex 200-entry batches
 *   6. Push non-BDC direct
 *   7. INSERT new agent_audit_log row (action_type='revert_rate_push',
 *      outcome='succeeded'/'failed') with payload.original_audit_log_id
 *      + restored_dates_by_channel
 *   8. UPDATE original audit row's context to add reverted_at +
 *      reverted_by_audit_log_id (bidirectional lineage; row immutability
 *      preserved at row-creation level)
 *
 * Note on request-action.ts integration: pricing/revert (like pricing/apply)
 * is host-direct UI action. request-action.ts currently lacks a
 * "frontend_api_confirmed" bypass shape, so the route writes its audit
 * row directly. v2.8 candidate: reconcile host-direct UI confirmation
 * with the substrate's stakes-class gating.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
  type CapturedPriorState,
  type KoastRestrictionProposal,
} from "@/lib/channex/safe-restrictions";
import { isBdcChannelCode } from "@/lib/channex/calendar-push-gate";

// Local helper duplicating apply route's channel-slug mapping. Kept local
// to avoid a cross-route import for one trivial function.
function channelSlugFor(code: string): string {
  const c = code.toUpperCase();
  if (c === "BDC") return "booking_com";
  if (c === "ABB") return "airbnb";
  if (c === "VRBO") return "vrbo";
  if (c === "DIRECT") return "direct";
  return code.toLowerCase();
}

export type RevertOutcome =
  | "succeeded"
  | "non_revertable"
  | "already_reverted"
  | "not_pricing_apply"
  | "audit_row_not_found"
  | "ownership_mismatch"
  | "no_channel_config"
  | "no_property_channex_link"
  | "push_failed";

export interface RevertRatePushInput {
  audit_log_id: string;
  host_id: string;
}

export interface RestoredEntry {
  date: string;
  channel: string;
  rate: number | null;
  min_stay_arrival: number | null;
}

export interface RevertRatePushResult {
  outcome: RevertOutcome;
  revert_audit_log_id: string | null;
  restored_count: number;
  failed_count: number;
  restored: RestoredEntry[];
  failed: Array<{ date: string; channel: string; error: string }>;
}

interface AuditRow {
  id: string;
  host_id: string;
  action_type: string;
  payload: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
}

/**
 * Group a CapturedPriorState[] array by channel for per-channel push.
 */
function groupByChannel(
  entries: CapturedPriorState[],
): Map<string, CapturedPriorState[]> {
  const out = new Map<string, CapturedPriorState[]>();
  for (const e of entries) {
    const list = out.get(e.channel) ?? [];
    list.push(e);
    out.set(e.channel, list);
  }
  return out;
}

export async function revertRatePush(
  input: RevertRatePushInput,
): Promise<RevertRatePushResult> {
  const supabase = createServiceClient();
  const channex = createChannexClient();

  // 1. Read the original audit row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRow, error: auditErr } = await (supabase.from("agent_audit_log") as any)
    .select("id, host_id, action_type, payload, context")
    .eq("id", input.audit_log_id)
    .maybeSingle();

  if (auditErr || !auditRow) {
    return {
      outcome: "audit_row_not_found",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }

  const row = auditRow as AuditRow;

  // 2. Ownership check.
  if (row.host_id !== input.host_id) {
    return {
      outcome: "ownership_mismatch",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }

  // 3. Validate action_type + revert state.
  if (row.action_type !== "pricing_apply") {
    return {
      outcome: "not_pricing_apply",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }
  if (row.context?.reverted_at) {
    return {
      outcome: "already_reverted",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }

  const priorState = (row.payload?.prior_state ?? []) as CapturedPriorState[];
  if (!Array.isArray(priorState) || priorState.length === 0) {
    return {
      outcome: "non_revertable",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }

  const propertyId = row.payload?.property_id as string | undefined;
  if (!propertyId) {
    return {
      outcome: "non_revertable",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }

  // 4. Resolve property channex linkage + per-channel rate plans.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (supabase.from("properties") as any)
    .select("channex_property_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop?.channex_property_id) {
    return {
      outcome: "no_property_channex_link",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }
  const channexPropertyId: string = prop.channex_property_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: channelLinks } = await (supabase.from("property_channels") as any)
    .select("channel_code, settings, status")
    .eq("property_id", propertyId)
    .eq("status", "active");
  const ratePlanByChannel = new Map<string, string>();
  for (const link of ((channelLinks ?? []) as Array<{
    channel_code: string;
    settings: { rate_plan_id?: string } | null;
  }>)) {
    const rpId = link.settings?.rate_plan_id;
    if (rpId) ratePlanByChannel.set(link.channel_code, rpId);
  }
  if (ratePlanByChannel.size === 0) {
    return {
      outcome: "no_channel_config",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    };
  }

  // 5. Push prior state back, per channel.
  const byChannel = groupByChannel(priorState);
  const restored: RestoredEntry[] = [];
  const failed: Array<{ date: string; channel: string; error: string }> = [];

  for (const [channel, entries] of Array.from(byChannel.entries())) {
    const ratePlanId = ratePlanByChannel.get(channel);
    if (!ratePlanId) {
      // Channel no longer linked or configured; skip with failure markers.
      for (const e of entries) {
        failed.push({
          date: e.date,
          channel,
          error: "channel_no_longer_configured",
        });
      }
      continue;
    }

    // Build koastProposed from prior state.
    const koastProposed = new Map<string, KoastRestrictionProposal>();
    for (const e of entries) {
      const proposal: KoastRestrictionProposal = {
        availability: 1,
        stop_sell: false,
      };
      if (e.rate != null) proposal.rate = e.rate;
      if (e.min_stay_arrival != null) proposal.min_stay_arrival = e.min_stay_arrival;
      koastProposed.set(e.date, proposal);
    }

    const dates = Array.from(koastProposed.keys()).sort();
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];

    if (isBdcChannelCode(channel)) {
      try {
        const plan = await buildSafeBdcRestrictions({
          channex,
          channexPropertyId,
          bdcRatePlanId: ratePlanId,
          dateFrom,
          dateTo,
          koastProposed,
        });
        const pushPayload = toChannexRestrictionValues(plan, channexPropertyId, ratePlanId);
        for (let i = 0; i < pushPayload.length; i += 200) {
          const batch = pushPayload.slice(i, i + 200);
          try {
            await channex.updateRestrictions(batch);
            for (const entry of batch) {
              const orig = entries.find((e: CapturedPriorState) => e.date === entry.date_from);
              if (orig) {
                restored.push({
                  date: entry.date_from,
                  channel,
                  rate: orig.rate,
                  min_stay_arrival: orig.min_stay_arrival,
                });
              }
            }
          } catch (batchErr) {
            const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
            for (const entry of batch) {
              failed.push({
                date: entry.date_from,
                channel,
                error: msg,
              });
            }
          }
        }
      } catch (planErr) {
        const msg = planErr instanceof Error ? planErr.message : String(planErr);
        for (const e of entries) {
          failed.push({ date: e.date, channel, error: `plan_build_failed: ${msg}` });
        }
      }
      continue;
    }

    // Non-BDC direct push (one entry per date).
    const restrictionValues = entries.map((e: CapturedPriorState) => ({
      property_id: channexPropertyId,
      rate_plan_id: ratePlanId,
      date_from: e.date,
      date_to: e.date,
      rate: e.rate != null ? Math.round(e.rate * 100) : undefined,
      min_stay_arrival: e.min_stay_arrival ?? 1,
      stop_sell: false,
    }));
    for (let i = 0; i < restrictionValues.length; i += 200) {
      const batch = restrictionValues.slice(i, i + 200);
      try {
        await channex.updateRestrictions(batch);
        for (const entry of batch) {
          const orig = entries.find((e) => e.date === entry.date_from);
          if (orig) {
            restored.push({
              date: entry.date_from,
              channel,
              rate: orig.rate,
              min_stay_arrival: orig.min_stay_arrival,
            });
          }
        }
      } catch (batchErr) {
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        for (const entry of batch) {
          failed.push({
            date: entry.date_from,
            channel,
            error: msg,
          });
        }
      }
    }
  }

  // 6. Write the revert audit row.
  const revertAuditId = await writeRevertAuditRow({
    supabase,
    hostId: input.host_id,
    originalAuditLogId: input.audit_log_id,
    propertyId,
    restored,
    failed,
  });

  // 7. Mutate original row's context to add reverted_at + reverted_by.
  if (revertAuditId) {
    const newContext = {
      ...(row.context ?? {}),
      reverted_at: new Date().toISOString(),
      reverted_by_audit_log_id: revertAuditId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: ctxErr } = await (supabase.from("agent_audit_log") as any)
      .update({ context: newContext })
      .eq("id", input.audit_log_id);
    if (ctxErr) {
      console.warn(
        `[pricing/revert] failed to mutate original audit row context (revert succeeded but lineage flag not set): ${ctxErr.message}`,
      );
    }
  }

  // Outcome semantics: succeeded if anything restored; push_failed only
  // if EVERYTHING failed.
  const outcome: RevertOutcome =
    restored.length > 0 ? "succeeded" : "push_failed";

  return {
    outcome,
    revert_audit_log_id: revertAuditId,
    restored_count: restored.length,
    failed_count: failed.length,
    restored,
    failed,
  };
}

async function writeRevertAuditRow(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  hostId: string;
  originalAuditLogId: string;
  propertyId: string;
  restored: RestoredEntry[];
  failed: Array<{ date: string; channel: string; error: string }>;
}): Promise<string | null> {
  const restoredChannels = Array.from(
    new Set(opts.restored.map((r) => r.channel)),
  ).map(channelSlugFor);
  const overallOutcome = opts.restored.length > 0 ? "succeeded" : "failed";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedRow, error: insertErr } = await opts.supabase
    .from("agent_audit_log")
    .insert({
      host_id: opts.hostId,
      action_type: "revert_rate_push",
      source: "frontend_api",
      actor_kind: "host",
      actor_id: opts.hostId,
      autonomy_level: "confirmed",
      outcome: overallOutcome,
      payload: {
        property_id: opts.propertyId,
        original_audit_log_id: opts.originalAuditLogId,
        restored_count: opts.restored.length,
        failed_count: opts.failed.length,
        restored_channels: restoredChannels,
        ...(opts.failed.length > 0 && { failed_details: opts.failed }),
      },
      context: {
        original_audit_log_id: opts.originalAuditLogId,
      },
    })
    .select("id")
    .single();

  if (insertErr || !insertedRow) {
    console.warn(
      `[pricing/revert] failed to insert revert audit row: ${insertErr?.message ?? "no row"}`,
    );
    return null;
  }
  return insertedRow.id as string;
}
