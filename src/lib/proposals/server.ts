/**
 * Proposals server lib (P2.3) — the lifecycle behind the `proposals` table:
 * create → (host approve | auto-approve) → execute-through-the-named-action →
 * audit → finalize, or → dismiss (zero side effects).
 *
 * Execution dispatches through a small action registry. Each action executes
 * via the SAME shared lib fn the manual UI uses — assign_cleaner runs
 * assignCleaner (no agent side-door). OTA-touching actions are guarded by the
 * OTA write flag (default off) at execute time AND hidden in the auto-approve
 * settings while the flag is off.
 *
 * The payload convention is { block: <id-lean BlockData the ProposalCard
 * renders>, action: <execution fields incl. entity ids> }. The block is what
 * the host sees; the action is what executes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/action-substrate/audit-writer";
import type { StakesClass } from "@/lib/action-substrate/stakes-registry";
import { assignCleaner } from "@/lib/turnover/assign";
import { emitHostNotification } from "@/lib/notifications/host-feed";
import { blockDataSchema, type BlockData } from "@/lib/agent/render/blocks";
import type { ProposalCreatedBy, ProposalStatus } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

export type ExecuteResult =
  | { ok: true; summary: Record<string, unknown> }
  | { ok: false; error: string };

type ProposalActionDef = {
  /** Host-facing label for the auto-approve settings toggle. */
  label: string;
  /** What auto-approving this action does (settings copy). */
  description: string;
  otaTouching: boolean;
  stakesClass: StakesClass;
  execute: (svc: Svc, args: { payload: unknown; hostId: string }) => Promise<ExecuteResult>;
};

/** OTA write enablement — the same env gate as the BDC calendar push (default off). */
export function isOtaWriteEnabled(): boolean {
  const v = process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
  return v === "1" || v === "true";
}

/** The action registry — action_type → how it executes + its risk shape. */
export const PROPOSAL_ACTIONS: Record<string, ProposalActionDef> = {
  assign_cleaner: {
    label: "Cleaner assignments",
    description:
      "Auto-assign the cleaner Koast recommends for a turnover and dispatch them, without asking first.",
    otaTouching: false,
    stakesClass: "medium",
    execute: async (svc, { payload, hostId }) => {
      const action = ((payload as { action?: unknown })?.action ?? {}) as {
        taskId?: string;
        cleanerId?: string;
      };
      if (!action.taskId || !action.cleanerId) {
        return { ok: false, error: "Proposal payload missing action.taskId/action.cleanerId" };
      }
      const r = await assignCleaner(svc, {
        taskId: action.taskId,
        cleanerId: action.cleanerId,
        hostId,
      });
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        summary: { cleaner_name: r.cleanerName, property_name: r.propertyName, push: r.push ?? null },
      };
    },
  },
};

export function getProposalActionDef(actionType: string): ProposalActionDef | undefined {
  return PROPOSAL_ACTIONS[actionType];
}

/** Client-safe metadata for the auto-approve settings (no execute fn). */
export function getProposalActionMeta(): {
  actionType: string;
  label: string;
  description: string;
  otaTouching: boolean;
}[] {
  return Object.entries(PROPOSAL_ACTIONS).map(([actionType, def]) => ({
    actionType,
    label: def.label,
    description: def.description,
    otaTouching: def.otaTouching,
  }));
}

/** Build the payload for an assign_cleaner proposal (block for display, action for execution). */
export function buildAssignCleanerProposalPayload(args: {
  taskId: string;
  cleanerId: string;
  property: string;
  date: string;
  cleanerName: string | null;
}): { block: BlockData; action: { taskId: string; cleanerId: string } } {
  return {
    block: {
      kind: "turnover",
      data: {
        property: args.property,
        date: args.date,
        status: "pending",
        cleanerName: args.cleanerName,
      },
    },
    action: { taskId: args.taskId, cleanerId: args.cleanerId },
  };
}

// ---- DB row shapes -------------------------------------------------------

export interface ProposalRow {
  id: string;
  host_id: string;
  property_id: string;
  action_type: string;
  payload: Record<string, unknown> | null;
  rationale: string | null;
  status: ProposalStatus;
  created_by: ProposalCreatedBy;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
}

/** Client-facing normalized proposal (camelCase; carries the display block). */
export interface NormalizedProposal {
  id: string;
  propertyId: string;
  actionType: string;
  block: BlockData | null;
  rationale: string | null;
  status: ProposalStatus;
  result: Record<string, unknown> | null;
  createdAt: string;
}

export function normalizeProposal(row: ProposalRow): NormalizedProposal {
  // Validate-on-read (mirrors the agenda render lane): a malformed block — even
  // of a KNOWN kind — is dropped so the rationale prose stands, never rendered
  // as garbage ("Invalid Date"). The Zod parse also strips undeclared keys
  // (e.g. a leaked entity id), enforcing the render-lane no-ids invariant here.
  const rawBlock = (row.payload as { block?: unknown } | null)?.block;
  const parsed = rawBlock != null ? blockDataSchema.safeParse(rawBlock) : null;
  const block: BlockData | null = parsed?.success ? parsed.data : null;
  return {
    id: row.id,
    propertyId: row.property_id,
    actionType: row.action_type,
    block,
    rationale: row.rationale,
    status: row.status,
    result: row.result,
    createdAt: row.created_at,
  };
}

// ---- Auto-approve preference --------------------------------------------

/**
 * Read a host's per-action-type auto-approve preference. Stored at
 * user_preferences.preferences.auto_approve[action_type]. Absent = OFF (all
 * default off). OTA-touching actions are never auto-approved while OTA writes
 * are disabled — defense beyond the hidden settings toggle.
 */
export async function isAutoApproveEnabled(
  svc: Svc,
  hostId: string,
  actionType: string,
): Promise<boolean> {
  const def = getProposalActionDef(actionType);
  if (def?.otaTouching && !isOtaWriteEnabled()) return false;
  const { data } = await svc
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", hostId)
    .limit(1);
  const prefs = ((data ?? []) as { preferences?: Record<string, unknown> }[])[0]?.preferences ?? {};
  const map = (prefs as { auto_approve?: Record<string, unknown> }).auto_approve ?? {};
  return map[actionType] === true;
}

// ---- Execute + finalize --------------------------------------------------

/**
 * Execute a proposal's action through its named handler + write the audit row.
 * Does NOT mutate the proposals row — the caller finalizes via
 * finalizeProposalAfterExecute. The audit is attributed host/confirmed (the
 * host approved), exactly like the manual route; the agent origin is recorded
 * in context.created_by + context.proposal_id.
 */
export async function executeProposal(
  svc: Svc,
  { proposal, hostId }: { proposal: ProposalRow; hostId: string },
): Promise<ExecuteResult> {
  const def = getProposalActionDef(proposal.action_type);
  if (!def) return { ok: false, error: `Unknown action_type '${proposal.action_type}'` };
  if (def.otaTouching && !isOtaWriteEnabled()) {
    return { ok: false, error: "OTA writes are disabled (flag off)" };
  }

  const started = Date.now();
  const result = await def.execute(svc, { payload: proposal.payload, hostId });
  const latency = Date.now() - started;

  try {
    await writeAuditLog({
      host_id: hostId,
      action_type: proposal.action_type,
      payload: (proposal.payload as { action?: Record<string, unknown> } | null)?.action ?? {},
      source: "frontend_api",
      actor_kind: "host",
      actor_id: hostId,
      autonomy_level: "confirmed",
      outcome: result.ok ? "succeeded" : "failed",
      context: {
        proposal_id: proposal.id,
        created_by: proposal.created_by,
        ...(result.ok ? result.summary : { error: result.error }),
      },
      stakes_class: def.stakesClass,
      latency_ms: latency,
    });
  } catch (err) {
    console.warn("[proposals] audit write failed:", err);
  }

  return result;
}

/** Write the proposal row's terminal state after an execution attempt. */
export async function finalizeProposalAfterExecute(
  svc: Svc,
  proposalId: string,
  exec: ExecuteResult,
  hostId: string,
): Promise<ProposalRow | null> {
  const now = new Date().toISOString();
  const update = exec.ok
    ? { status: "executed", decided_at: now, executed_at: now, result: exec.summary }
    : { status: "failed", decided_at: now, result: { error: exec.error } };
  // Scope the write to the host (defense-in-depth: every service-client write
  // carries its own ownership filter, not just an upstream SELECT).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc.from("proposals") as any)
    .update(update)
    .eq("id", proposalId)
    .eq("host_id", hostId)
    .select()
    .single();
  return (data as ProposalRow) ?? null;
}

// ---- Create --------------------------------------------------------------

/**
 * Create a proposal (service-role write). When the host has auto-approve ON for
 * this action_type (and it isn't an OTA action gated off), execute immediately
 * — otherwise it lands pending for host approval. ALL auto-approve defaults are
 * off, so the common path is pending.
 */
export async function createProposal(
  svc: Svc,
  args: {
    hostId: string;
    propertyId: string;
    actionType: string;
    payload: Record<string, unknown>;
    rationale?: string | null;
    createdBy: ProposalCreatedBy;
  },
): Promise<{ proposal: ProposalRow; autoExecuted: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.from("proposals") as any)
    .insert({
      host_id: args.hostId,
      property_id: args.propertyId,
      action_type: args.actionType,
      payload: args.payload,
      rationale: args.rationale ?? null,
      created_by: args.createdBy,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`[proposals] create failed: ${error?.message ?? "no row"}`);
  }
  let proposal = data as ProposalRow;

  if (await isAutoApproveEnabled(svc, args.hostId, args.actionType)) {
    const exec = await executeProposal(svc, { proposal, hostId: args.hostId });
    const finalized = await finalizeProposalAfterExecute(svc, proposal.id, exec, args.hostId);
    if (finalized) proposal = finalized;
    return { proposal, autoExecuted: true };
  }

  // P2.4: a proposal the AGENT (or a worker/system) suggested for the host
  // lands in the bell as "review me". Host-created proposals don't self-notify.
  if (args.createdBy !== "host") {
    await emitHostNotification(svc, args.hostId, "proposal_created", {
      proposalId: proposal.id,
      actionType: args.actionType,
      rationale: args.rationale ?? null,
    });
  }

  return { proposal, autoExecuted: false };
}
