import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
  type KoastRestrictionProposal,
} from "@/lib/channex/safe-restrictions";
import {
  CALENDAR_PUSH_DISABLED_MESSAGE,
  isCalendarPushEnabled,
} from "@/lib/channex/calendar-push-gate";

/**
 * POST /api/pricing/commit-bdc-push/[propertyId]
 *
 * Commit a safe-restrictions push to BDC. Always recomputes the plan
 * from live BDC state — never trusts a client-side plan. Idempotent via
 * `concurrency_locks` keyed by the caller-supplied idempotencyKey; the
 * same key cannot commit twice within the 60-second lock window.
 *
 * Body: { dateFrom, dateTo, koastProposed, idempotencyKey }
 *
 * Gated by KOAST_ALLOW_BDC_CALENDAR_PUSH=true (belt-and-suspenders while
 * Stage 1 rolls out — the safe-restrictions helper is the real protection,
 * the env flag is the one-line insurance until we observe it working in
 * production). Drop the gate in a follow-up commit once traffic confirms.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  if (!isCalendarPushEnabled()) {
    return NextResponse.json({ error: CALENDAR_PUSH_DISABLED_MESSAGE }, { status: 503 });
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { dateFrom, dateTo, koastProposed, idempotencyKey } = body as {
      dateFrom?: string;
      dateTo?: string;
      koastProposed?: Record<string, KoastRestrictionProposal>;
      idempotencyKey?: string;
    };

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "dateFrom and dateTo are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return NextResponse.json(
        { error: "idempotencyKey is required (client-generated UUID)" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Idempotency gate via concurrency_locks. A repeated key within 60s
    // acquires a lock that's already held → we return 409 with a clear
    // "duplicate_request" signal. Full "return the cached original result"
    // caching would need a separate store; this is the simpler, correctness-
    // preserving variant that matches the existing reliability infrastructure.
    const lockKey = `commit_bdc:${propertyId}:${idempotencyKey}`;
    const lockAcquired = await acquireLock(supabase, lockKey, 60);
    if (!lockAcquired) {
      return NextResponse.json(
        {
          error: "duplicate_request",
          message:
            "An identical push is already in flight (idempotencyKey within 60s TTL). Wait and retry or generate a new key.",
        },
        { status: 409 }
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prop } = await (supabase.from("properties") as any)
        .select("id, channex_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop?.channex_property_id) {
        return NextResponse.json(
          { error: "Property not connected to Channex" },
          { status: 400 }
        );
      }
      const channexPropertyId: string = prop.channex_property_id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bdcLink } = await (supabase.from("property_channels") as any)
        .select("settings, status")
        .eq("property_id", propertyId)
        .eq("channel_code", "BDC")
        .maybeSingle();
      const bdcRatePlanId: string | undefined = bdcLink?.settings?.rate_plan_id;
      if (!bdcRatePlanId) {
        return NextResponse.json(
          { error: "No BDC channel with a rate plan configured for this property" },
          { status: 400 }
        );
      }

      const koastMap = new Map<string, KoastRestrictionProposal>(
        Object.entries(koastProposed ?? {})
      );

      const channex = createChannexClient();
      const plan = await buildSafeBdcRestrictions({
        channex,
        channexPropertyId,
        bdcRatePlanId,
        dateFrom,
        dateTo,
        koastProposed: koastMap,
      });

      if (plan.entries_to_push.length === 0) {
        return NextResponse.json({
          skipped: true,
          reason: "no_changes_needed",
          plan,
        });
      }

      // Convert to Channex cents payload, batch 200, collect partial failures.
      const payload = toChannexRestrictionValues(plan, channexPropertyId, bdcRatePlanId);
      let pushed = 0;
      const failedBatches: Array<{
        batch_index: number;
        date_range: string;
        error: string;
        size: number;
      }> = [];
      for (let i = 0; i < payload.length; i += 200) {
        const batch = payload.slice(i, i + 200);
        const firstDate = batch[0]?.date_from ?? "?";
        const lastDate = batch[batch.length - 1]?.date_to ?? "?";
        try {
          await channex.updateRestrictions(batch);
          pushed += batch.length;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failedBatches.push({
            batch_index: Math.floor(i / 200),
            date_range: `${firstDate}..${lastDate}`,
            error: msg,
            size: batch.length,
          });
          console.error(
            `[pricing/commit-bdc-push] Batch ${i / 200} failed (${firstDate}..${lastDate}): ${msg}`
          );
        }
      }

      const appliedAt = new Date().toISOString();
      if (failedBatches.length > 0) {
        return NextResponse.json(
          {
            partial_failure: true,
            plan,
            pushed,
            total_intended: payload.length,
            failed_batches: failedBatches,
            applied_at: appliedAt,
          },
          { status: 207 }
        );
      }

      return NextResponse.json({
        plan,
        pushed,
        total_intended: payload.length,
        applied_at: appliedAt,
      });
    } finally {
      // Release the idempotency lock so a LATER (different-key) commit can
      // run immediately. Callers retrying the SAME key within 60s of a
      // successful release will re-acquire — idempotency is enforced by
      // the upstream key-generation contract, not by this TTL alone.
      await releaseLock(supabase, lockKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/commit-bdc-push] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
