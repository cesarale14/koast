/**
 * Vercel Cron entry for K1 voice extraction. M10 Phase E STEP 6.
 *
 * Invoked nightly by Vercel Cron (schedule at vercel.json — STEP 7).
 *
 * Auth (per ultraplan §13.2 null-safe):
 *   - Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron invocations
 *   - We compare null-safely: !!expected && !!supplied && expected === supplied
 *   - UNSET `CRON_SECRET` in env denies ALL requests (never pass-both-undefined).
 *     This is the fail-safe behavior when the operator hasn't yet configured the
 *     secret in Vercel (STEP 7 operator-action precondition).
 *
 * Handler:
 *   - Invokes the shared `runExtractionForAllHosts` (STEP 5; same handler the
 *     manual route at /api/voice/extract calls). Single source of truth.
 *   - Returns the aggregated ExtractionRunSummary JSON.
 *   - Idempotent re-entry safe (extractor's supersession threshold handles
 *     duplicate runs; per-host failure-isolation handles partial failures).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runExtractionForAllHosts } from "@/lib/voice/extraction-scheduler";

function verifyCronAuth(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const expected = process.env.CRON_SECRET;
  // Null-safe per ultraplan §13.2 — unset secret denies all (mirrors
  // api-auth.ts verifyServiceKey pattern).
  return !!expected && !!supplied && expected === supplied;
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServiceClient();
    const summary = await runExtractionForAllHosts(supabase);
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/voice-extraction] handler failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron sends GET (per docs). Support both for flexibility + manual curl.
export const GET = POST;
