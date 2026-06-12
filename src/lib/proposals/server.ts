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
import { notifyCleaner } from "@/lib/turnover/notify";
import { emitHostNotification } from "@/lib/notifications/host-feed";
import { blockDataSchema, type BlockData } from "@/lib/agent/render/blocks";
import { isCalendarPushEnabled } from "@/lib/channex/calendar-push-gate";
import { applyOtaRestrictions } from "@/lib/channex/ota-apply";
import type { KoastRestrictionProposal } from "@/lib/channex/safe-restrictions";
import { proposeGuestMessageHandler } from "@/lib/action-substrate/handlers/propose-guest-message";
import { ChannexSendError } from "@/lib/channex/messages";
import { ColdSendUnsupportedError } from "@/lib/action-substrate/handlers/errors";
import { updatePricingRule, type UpdatePricingRulePatch } from "@/lib/pricing/update-rule";
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
  /**
   * When true this action can NEVER be auto-approved — host approval is the
   * ONLY execution path, structurally. The auto-approve settings toggle is
   * NOT rendered for it (getProposalActionMeta omits it) AND isAutoApproveEnabled
   * returns false for it unconditionally. send_guest_reply uses this: a
   * guest-FACING send must never fire without explicit host approval. This is
   * also what keeps the CLAUDE.md J3 fail-open contract valid for this action —
   * because no auto-send call-site can exist, host approval remains the gate and
   * the propose-time voice judges stay advisory (fail-open-with-flag). If this
   * ever flips to allow auto-approve, the J3 contract REQUIRES the judges flip
   * to fail-closed via applyOutputJudges' policyOverride hook FIRST.
   */
  neverAutoApprove?: boolean;
  /**
   * Execute the action through the SAME shared lib fn the manual UI uses.
   * `result` carries the proposal's prior result row (proposals.result) so an
   * action whose underlying writer is idempotency-keyed (send_guest_reply →
   * proposeGuestMessageHandler's commit_metadata guard) can short-circuit a
   * re-send. Absent/ignored by actions that don't need it.
   */
  execute: (
    svc: Svc,
    args: { payload: unknown; hostId: string; result?: Record<string, unknown> | null },
  ) => Promise<ExecuteResult>;
};

/**
 * OTA write enablement — the proposal-side gate for OTA-touching actions
 * (executable computation, executeProposal hard-refusal, auto-approve refusal).
 *
 * R-5 (HARD-FLOOR): this is the SAME predicate as the route-level write guard.
 * It MUST NOT diverge from `isCalendarPushEnabled` — a divergence is the
 * dangerous state where a proposal renders executable (Approve shown) but the
 * underlying Channex write refuses, or vice versa. So this delegates to the one
 * canonical gate rather than re-parsing the env. Previously this accepted "1"
 * OR "true" while the 8 route guards accept "true" only; they now agree by
 * construction (aligned DOWN to the stricter established route semantics — a
 * hard-floor gate fails closed on any non-"true" value; the documented flip is
 * `KOAST_ALLOW_BDC_CALENDAR_PUSH=true`). gate-divergence.test.ts pins this.
 */
export function isOtaWriteEnabled(): boolean {
  return isCalendarPushEnabled();
}

/** OTA op action payload shape — entity ids + execution fields (the host-facing
 *  display lives in payload.block). All three OTA ops share this. */
type OtaActionFields = { propertyId?: string; dates?: string[]; channel?: string | null };

/**
 * Shared OTA execute — builds the per-date restriction set and dispatches it
 * through applyOtaRestrictions (the SINGLE shared writer: BDC→safe-restrictions,
 * non-BDC→direct). The flag refusal lives in applyOtaRestrictions (belt 3); this
 * is reached only when executeProposal's otaTouching guard (belt 2) already
 * passed. No OTA action gets a parallel push path.
 */
async function executeOtaOp(
  svc: Svc,
  payload: unknown,
  build: (date: string) => KoastRestrictionProposal,
  summaryExtra: Record<string, unknown>,
): Promise<ExecuteResult> {
  const action = ((payload as { action?: unknown })?.action ?? {}) as OtaActionFields;
  if (!action.propertyId || !Array.isArray(action.dates) || action.dates.length === 0) {
    return { ok: false, error: "Proposal payload missing action.propertyId/action.dates" };
  }
  const perDate = new Map<string, KoastRestrictionProposal>();
  for (const d of action.dates) perDate.set(d, build(d));
  const r = await applyOtaRestrictions(svc, {
    propertyId: action.propertyId,
    perDate,
    targetChannel: action.channel ?? null,
  });
  if (!r.ok) {
    const reason =
      r.refusedReason ?? r.failedChannels[0]?.error ?? r.skipped[0]?.reason ?? "No channel accepted the change";
    return { ok: false, error: reason };
  }
  return { ok: true, summary: { pushed_channels: r.pushedChannels, dates: action.dates, ...summaryExtra } };
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

  notify_cleaner: {
    label: "Cleaner reminders",
    description:
      "Re-send the job notification to the assigned cleaner for a turnover, without asking first.",
    otaTouching: false,
    stakesClass: "low",
    execute: async (svc, { payload, hostId }) => {
      const action = ((payload as { action?: unknown })?.action ?? {}) as { taskId?: string };
      if (!action.taskId) {
        return { ok: false, error: "Proposal payload missing action.taskId" };
      }
      const r = await notifyCleaner(svc, { taskId: action.taskId, hostId });
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        summary: { cleaner_name: r.cleanerName, property_name: r.propertyName, push: r.push ?? null },
      };
    },
  },

  // ── update_pricing_rule (P4.1) — host-approved change to a property's pricing
  //    guardrails (base/min/max). otaTouching:false — it writes the host's OWN
  //    pricing_rules row, NOT Channex, so it's host-gated-executable like
  //    assign_cleaner (not OTA-gated). The P4.1 surface fix detects the engine's
  //    inferred ceiling sitting below market; this is how the host approves
  //    raising it (propose → approve). Executes the EXTRACTED updatePricingRule
  //    single-writer (no agent side-door); the partial patch is re-validated
  //    against the merged row (min<=base<=max) inside the writer.
  update_pricing_rule: {
    label: "Pricing-rule changes",
    description:
      "Update your pricing guardrails (base / min / max rate) when Koast recommends it, without asking first.",
    otaTouching: false,
    stakesClass: "medium",
    execute: async (svc, { payload, hostId }) => {
      const action = ((payload as { action?: unknown })?.action ?? {}) as {
        propertyId?: string;
        patch?: UpdatePricingRulePatch;
      };
      if (!action.propertyId || !action.patch || typeof action.patch !== "object") {
        return { ok: false, error: "Proposal payload missing action.propertyId/action.patch" };
      }
      const r = await updatePricingRule(svc, {
        propertyId: action.propertyId,
        hostId,
        patch: action.patch,
      });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, summary: r.summary };
    },
  },

  // ── send_guest_reply (P3.2) — the agent's host-gated guest send on the
  //    proposals lane. otaTouching:false (it's a Channex MESSAGE, not a calendar
  //    write), stakes 'medium', neverAutoApprove (a guest-facing send NEVER fires
  //    without explicit host approval — see the field doc). The voice judges
  //    (J1-J6) + publisher hard-refusal run at PROPOSE time (in the tool + the
  //    loop intercept); by execute time the text is already filtered + the
  //    publisher categories already refused. Execution REUSES the M7 Channex send
  //    single-writer (proposeGuestMessageHandler) — no agent side-door.
  //
  //    NO DOUBLE-SEND (the load-bearing guarantee): /api/proposals/[id]/approve
  //    atomically claims pending|failed → approved before executing, so execution
  //    runs at-most-once. This adapter preserves the invariant
  //    **status='failed' ⟺ Channex did NOT send** by error class:
  //      - ChannexSendError / ColdSendUnsupportedError → {ok:false} (Channex
  //        rejected or the send is structurally unsupported; the proposal goes
  //        'failed' = re-approvable, and a retry re-sends — correct, nothing went
  //        out).
  //      - ANY OTHER throw (a post-Channex-200 local-DB hiccup) → RE-THROW. The
  //        message MAY already be on the OTA, so the proposal must NOT become
  //        re-approvable: re-throwing leaves it 'approved' (un-reclaimable by the
  //        atomic claim) and the webhook reconciles the local messages row. This
  //        mirrors the artifact lane's outer-catch (terminal, no auto re-send).
  //    At-most-once rests SOLELY on (a) the atomic claim and (b) the
  //    failed⟺not-sent invariant. The `result` (proposals.result) threading into
  //    the handler's commit_metadata is belt-and-suspenders that is INERT on this
  //    lane by construction: the only re-approvable state is 'failed', and
  //    finalizeProposalAfterExecute overwrites result with {error} on failure, so
  //    a re-approve never carries a channex id and the handler's step-1 guard
  //    never fires here. It is wired anyway so the handler's guard is honoured if
  //    a future finalize preserves prior ids. Do NOT rely on it as the primary
  //    guarantee.
  send_guest_reply: {
    label: "Guest replies",
    description:
      "Send the guest reply Koast drafts, without asking first. (Not available — guest sends always require your approval.)",
    otaTouching: false,
    stakesClass: "medium",
    neverAutoApprove: true,
    execute: async (svc, { payload, hostId, result }) => {
      const action = ((payload as { action?: unknown })?.action ?? {}) as {
        bookingId?: string;
        messageText?: string;
      };
      if (!action.bookingId || !action.messageText) {
        return { ok: false, error: "Proposal payload missing action.bookingId/action.messageText" };
      }
      // Prior-attempt result → commit_metadata (handler idempotency guard). Only
      // a prior SUCCESS stored channex ids here; a 'failed' retry's result has
      // none, so the handler re-sends (correct: failed ⟺ not sent).
      const commit = (result ?? undefined) as
        | { channex_message_id?: string; message_id?: string; channel?: string }
        | undefined;
      try {
        const r = await proposeGuestMessageHandler({
          host_id: hostId,
          // The proposals lane carries no conversation/turn/artifact context; the
          // handler body does not read these fields (they are vestigial inputs
          // from the M7 artifact lane). proposeGuestMessageHandler writes only to
          // bookings(read), message_threads, messages, property_channels(read) —
          // none turn-keyed — so empty strings are safe here.
          conversation_id: "",
          turn_id: "",
          artifact_id: "",
          payload: { booking_id: action.bookingId, message_text: action.messageText },
          commit_metadata: commit,
        });
        return {
          ok: true,
          summary: {
            channex_message_id: r.channex_message_id,
            message_id: r.message_id,
            channel: r.channel,
          },
        };
      } catch (err) {
        // ColdSendUnsupportedError fires strictly PRE-Channex (the cold-send
        // gates, before any POST) → nothing was sent → safe to mark 'failed'
        // (re-approvable); a retry re-sends, which is correct.
        if (err instanceof ColdSendUnsupportedError) {
          return { ok: false, error: err.message };
        }
        // ChannexSendError is now (H7.1) ALWAYS a true non-2xx OTA rejection
        // (channexPost's !res.ok branch) → nothing was sent → re-approvable. The
        // former "2xx with no data" ambiguous case is its own AmbiguousSendError
        // (not a ChannexSendError), so it falls through to the RE-THROW below.
        if (err instanceof ChannexSendError) {
          return { ok: false, error: err.message };
        }
        // AmbiguousSendError (2xx-no-data), a post-Channex-200 local-DB hiccup, or
        // any unknown error: the message may be on the OTA. Re-throw to keep the
        // proposal 'approved' (un-reclaimable by the atomic claim) so it can
        // never re-send. The webhook reconciles the local messages row.
        throw err;
      }
    },
  },

  // ── OTA trio (HARD-FLOOR, BDC clobber class) — otaTouching, stakes 'high'.
  //    Execution is IMPOSSIBLE while the OTA gate is off: belt 1 (ProposalCard
  //    hides Approve when !executable), belt 2 (executeProposal otaTouching
  //    refusal), belt 3 (applyOtaRestrictions self-refusal). BDC routes through
  //    buildSafeBdcRestrictions; block uses availability=0, never stop_sell.
  block_dates: {
    label: "Date blocks",
    description:
      "Block dates on your connected channels when Koast recommends it, without asking first.",
    otaTouching: true,
    stakesClass: "high",
    execute: (svc, { payload }) =>
      executeOtaOp(svc, payload, () => ({ availability: 0 }), { op: "block" }),
  },
  adjust_price: {
    label: "Price adjustments",
    description:
      "Push the nightly rate Koast recommends to your connected channels, without asking first.",
    otaTouching: true,
    stakesClass: "high",
    execute: (svc, { payload }) => {
      // The rate is whiplash-bounded at PROPOSE time (against pricing_rules), so
      // the value carried here is already clamped — the model's raw number never
      // reaches Channex unbounded. availability=1/stop_sell=false are no-ops
      // (rate pushes don't change bookability) mirroring /api/pricing/apply.
      const rate = Number(
        ((payload as { action?: { rate?: unknown } })?.action?.rate),
      );
      if (!Number.isFinite(rate) || rate <= 0) {
        return Promise.resolve({ ok: false, error: "Proposal payload missing a positive action.rate" });
      }
      return executeOtaOp(
        svc,
        payload,
        () => ({ rate, availability: 1, stop_sell: false }),
        { op: "price", rate },
      );
    },
  },
  set_min_stay: {
    label: "Minimum-stay changes",
    description:
      "Set the minimum nights Koast recommends on your connected channels, without asking first.",
    otaTouching: true,
    stakesClass: "high",
    execute: (svc, { payload }) => {
      const minStay = Number(
        ((payload as { action?: { minStay?: unknown } })?.action?.minStay),
      );
      if (!Number.isInteger(minStay) || minStay < 1) {
        return Promise.resolve({ ok: false, error: "Proposal payload missing a valid action.minStay (>=1)" });
      }
      return executeOtaOp(
        svc,
        payload,
        () => ({ min_stay_arrival: minStay }),
        { op: "min_stay", min_stay: minStay },
      );
    },
  },
};

export function getProposalActionDef(actionType: string): ProposalActionDef | undefined {
  return PROPOSAL_ACTIONS[actionType];
}

/** Client-safe metadata for the auto-approve settings (no execute fn). Actions
 *  flagged neverAutoApprove are OMITTED — the auto-approve toggle must not exist
 *  for them (send_guest_reply: a guest-facing send is never auto-approvable). */
export function getProposalActionMeta(): {
  actionType: string;
  label: string;
  description: string;
  otaTouching: boolean;
}[] {
  return Object.entries(PROPOSAL_ACTIONS)
    .filter(([, def]) => !def.neverAutoApprove)
    .map(([actionType, def]) => ({
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
  /** True when this action writes to an OTA (block/price/min-stay). */
  otaTouching: boolean;
  /**
   * Whether the host can APPROVE+execute this now (belt 1 of the OTA execution-
   * impossibility). Computed SERVER-SIDE: non-OTA actions are always executable;
   * OTA actions are executable only while the unified write gate is on. An
   * unknown action_type is never executable. ProposalCard hides/disables Approve
   * when false (Dismiss stays live).
   */
  executable: boolean;
}

export function normalizeProposal(row: ProposalRow): NormalizedProposal {
  // Validate-on-read (mirrors the agenda render lane): a malformed block — even
  // of a KNOWN kind — is dropped so the rationale prose stands, never rendered
  // as garbage ("Invalid Date"). The Zod parse also strips undeclared keys
  // (e.g. a leaked entity id), enforcing the render-lane no-ids invariant here.
  const rawBlock = (row.payload as { block?: unknown } | null)?.block;
  const parsed = rawBlock != null ? blockDataSchema.safeParse(rawBlock) : null;
  const block: BlockData | null = parsed?.success ? parsed.data : null;
  const def = getProposalActionDef(row.action_type);
  const otaTouching = def?.otaTouching ?? false;
  // Unknown action → not executable (can't run what isn't registered). OTA →
  // gated; non-OTA → always executable.
  const executable = def ? (!def.otaTouching || isOtaWriteEnabled()) : false;
  return {
    id: row.id,
    propertyId: row.property_id,
    actionType: row.action_type,
    block,
    rationale: row.rationale,
    status: row.status,
    result: row.result,
    createdAt: row.created_at,
    otaTouching,
    executable,
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
  // Structural never-auto-approve: independent of (and stricter than) the
  // settings toggle, which getProposalActionMeta already hides. A guest-facing
  // send can never auto-execute regardless of any persisted preference.
  if (def?.neverAutoApprove) return false;
  if (def?.otaTouching && !isOtaWriteEnabled()) return false;
  // H3.1 (P6.2) — the `user_preferences` table was deliberately dropped
  // (migration 20260507020000_drop_deprecated_config_tables). Reading it was a
  // phantom read (PostgREST 404 → {data:null} → false), so the effective behavior
  // was already "no auto-approve". We now return that explicitly — no phantom
  // query, no silent PostgREST error on every proposal create. When a real
  // per-host auto-approve preference home ships (host_state or a recreated prefs
  // table + the Settings writer), wire it HERE. The structural guards above
  // (neverAutoApprove, OTA-off) remain the load-bearing safety.
  void svc;
  void hostId;
  return false;
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
  const result = await def.execute(svc, {
    payload: proposal.payload,
    hostId,
    // Prior result (idempotency input for re-approvable actions, e.g.
    // send_guest_reply's commit_metadata short-circuit).
    result: proposal.result,
  });
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
