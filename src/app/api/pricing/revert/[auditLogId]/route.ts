/**
 * POST /api/pricing/revert/[auditLogId] — M11 Phase C item 1 (M2; D17d disposition).
 *
 * Audit-row-driven undo for a prior `/api/pricing/apply`. Delegates to
 * the revertRatePush lib (src/lib/pricing/revert.ts). The lib handles
 * the full lifecycle: ownership check, prior_state reconstruction,
 * BDC + non-BDC push, revert audit row insert, original row context
 * mutation for lineage.
 *
 * Concurrency: 60-second advisory lock keyed by audit_log_id prevents
 * double-revert (same audit row clicked twice in quick succession).
 *
 * Env gate: shares KOAST_ALLOW_BDC_CALENDAR_PUSH with apply — if BDC
 * calendar push is disabled, revert is too (the substrate is one).
 *
 * Note on action-substrate integration: pricing/revert (like pricing/apply)
 * is host-direct UI action. The host's UI click in AuditDrawer is the
 * confirmation; request-action.ts currently lacks a "frontend_api_confirmed"
 * bypass shape, so this route INSERTs its audit row directly via the lib.
 * v2.8 candidate: reconcile host-direct UI confirmation with the
 * substrate's stakes-class gating.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  CALENDAR_PUSH_DISABLED_MESSAGE,
  isCalendarPushEnabled,
} from "@/lib/channex/calendar-push-gate";
import { revertRatePush, type RevertOutcome } from "@/lib/pricing/revert";

function statusForOutcome(outcome: RevertOutcome): number {
  switch (outcome) {
    case "succeeded":
      return 200;
    case "audit_row_not_found":
      return 404;
    case "ownership_mismatch":
      return 403;
    case "not_pricing_apply":
    case "no_channel_config":
    case "no_property_channex_link":
      return 400;
    case "non_revertable":
    case "already_reverted":
      return 409;
    case "push_failed":
      return 502;
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { auditLogId: string } },
) {
  if (!isCalendarPushEnabled()) {
    return NextResponse.json(
      { error: CALENDAR_PUSH_DISABLED_MESSAGE },
      { status: 503 },
    );
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auditLogId = params.auditLogId;
    if (!auditLogId) {
      return NextResponse.json(
        { error: "auditLogId is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const lockKey = `pricing_revert:${auditLogId}`;
    const lockAcquired = await acquireLock(supabase, lockKey, 60);
    if (!lockAcquired) {
      return NextResponse.json(
        {
          error: "revert_in_progress",
          message: "A revert is already in flight for this audit row.",
        },
        { status: 409 },
      );
    }

    try {
      const result = await revertRatePush({
        audit_log_id: auditLogId,
        host_id: user.id,
      });
      return NextResponse.json(result, { status: statusForOutcome(result.outcome) });
    } finally {
      await releaseLock(supabase, lockKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/revert]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
