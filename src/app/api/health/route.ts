/**
 * GET /api/health (P6.4) — public liveness/readiness for monitors + load balancers.
 * No auth (it leaks nothing sensitive — just up/down + DB latency + the last applied
 * migration as an implicit "workers/migrations are flowing" signal). Never throws:
 * any failure → status 'degraded'/'error' with the reason, 200 so the probe still
 * gets a body (monitors read the `status` field, not the HTTP code).
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const out: Record<string, unknown> = { status: "ok", timestamp: new Date().toISOString() };

  try {
    const supabase = createServiceClient();
    // DB connectivity + latency — a trivial read against a tiny table.
    const t0 = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: last, error } = await (supabase.from("koast_migration_history") as any)
      .select("migration_name, applied_at")
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    out.db_latency_ms = Date.now() - t0;
    if (error) {
      out.status = "degraded";
      out.db_error = error.message;
    } else {
      out.last_migration = last?.migration_name ?? null;
      out.last_migration_at = last?.applied_at ?? null;
    }
  } catch (err) {
    out.status = "error";
    out.error = err instanceof Error ? err.message : "Unknown error";
  }

  out.elapsed_ms = Date.now() - startedAt;
  return NextResponse.json(out);
}
