/**
 * GET /api/memory/export — M11 Phase D item 1 (M4; M8 C13 R-5 disposition).
 *
 * Returns the authenticated host's accumulated memory as a JSON file
 * download. Honors the M8 C13 binding copy commitment ("structured
 * download of everything Koast has accumulated"). Last Cluster M item.
 *
 * HARD-FLOOR INVARIANT — cross-host data isolation:
 * The hostId for the export query is derived EXCLUSIVELY from the
 * authenticated session (`getAuthenticatedUser().user.id`). It is
 * NEVER read from request input (no query param, no body, no path
 * segment). Any client-supplied identifier is ignored. The adversarial
 * regression-guard test asserts this invariant per operator sign-off
 * msg 3436 — the route must "try to leak and prove it can't."
 *
 * Defense layers (4-deep):
 *   1. Route auth (getAuthenticatedUser → 401 on no user)
 *   2. hostId = user.id ONLY (no client input considered)
 *   3. Server-side .eq("host_id", hostId) at the data layer (in lib)
 *   4. RLS policy on memory_facts (auth.uid() = host_id; defense-in-depth)
 *
 * Audit logging: writes a `memory_export` agent_audit_log row on
 * success (transparency-of-actions; consistent with pricing_apply
 * direct-INSERT pattern from M9 Phase G E2 and Phase C precedent).
 * The action_type is NOT registered in stakes-registry (no caller
 * passes it to requestAction; consistent with pricing_apply).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { exportMemoryForHost } from "@/lib/memory/export";

// Suppress unused-param lint on _request — by-design (the route reads
// hostId from auth, NEVER from request input; the param exists for the
// Next.js handler signature but its contents are intentionally ignored).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // HARD-FLOOR ASSERTION: hostId comes from auth only. We do NOT
    // read request.url query params or body. Even if the client passes
    // ?hostId=<other-host>, this code ignores it.
    const hostId = user.id;

    const payload = await exportMemoryForHost(hostId);

    // Audit log (transparency-of-actions per values commitment).
    // Direct INSERT pattern — bypasses request-action.ts; consistent
    // with pricing_apply per Phase C precedent.
    try {
      const supabase = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("agent_audit_log") as any).insert({
        host_id: hostId,
        action_type: "memory_export",
        source: "frontend_api",
        actor_kind: "host",
        actor_id: hostId,
        autonomy_level: "confirmed",
        outcome: "succeeded",
        payload: {
          fact_count: payload.fact_count,
          exported_at: payload.exported_at,
        },
        context: { koast_version: payload.koast_version },
      });
    } catch (auditErr) {
      const msg =
        auditErr instanceof Error ? auditErr.message : String(auditErr);
      console.warn(`[memory/export] agent_audit_log insert failed (non-fatal): ${msg}`);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=koast-memory-${dateStr}.json`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[memory/export]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
