/**
 * Manual-trigger entry for K1 voice extraction. M10 Phase E STEP 6.
 *
 * D49 attestation vehicle: operators/dev invoke this with a service key to
 * exercise the shared handler against production without waiting for the
 * nightly cron. Useful for testing, attestation, and emergency manual runs.
 *
 * Auth (per ultraplan §13.1 admin/service-key-only):
 *   - `verifyServiceKey` ONLY (mirrors api-auth.ts pattern: x-service-key
 *     header compared null-safely against SUPABASE_SERVICE_ROLE_KEY).
 *   - NO `getAuthenticatedUser` path — closes the scope hole where an
 *     authenticated non-admin host could trigger extraction across every
 *     host's data, not just their own. Per-host self-service variant
 *     deferred to v2.8 if hosts ever need it.
 *
 * Handler:
 *   - Invokes the same `runExtractionForAllHosts` the cron route calls
 *     (shared-handler pattern; prevents path drift).
 *   - Returns the aggregated ExtractionRunSummary JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyServiceKey } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { runExtractionForAllHosts } from "@/lib/voice/extraction-scheduler";

export async function POST(request: NextRequest) {
  if (!verifyServiceKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServiceClient();
    const summary = await runExtractionForAllHosts(supabase);
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice/extract] handler failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
