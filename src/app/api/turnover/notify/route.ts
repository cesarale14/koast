// POST /api/turnover/notify — manual "notify the cleaner about this job".
//
// TURN-S2-send: fires the SAME web-push dispatch as the assign path
// (sendAssignmentPush) and returns its summary. SMS (notifyCleanerReminder)
// is retired — the toll-free number is unverified and never delivered, so the
// old path was both the wrong channel and a false-success toast.
//
// Auth: getUser + property-ownership double-check (same shape as
// /api/turnover/update).
// Body: { taskId: uuid }
// Response: 200 { notified: true, cleaner_name, push: { configured, total,
//   sent, pruned, failed } }; 400 if no cleaner assigned; 404 task/cleaner
//   missing; 403 not your property.
//
// Logs every 4xx/5xx to stderr so Vercel logs surface failures.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyCleaner, type NotifyCleanerFailCode } from "@/lib/turnover/notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map the shared fn's fail code to the HTTP status the route has always returned.
const STATUS_FOR: Record<NotifyCleanerFailCode, number> = {
  task_not_found: 404,
  property_not_found: 403,
  no_cleaner_assigned: 400,
  cleaner_not_found: 404,
  load_failed: 500,
};

export async function POST(request: NextRequest) {
  try {
    const auth = createAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      console.error("[turnover/notify] FAILED 401");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const taskId = body && typeof body === "object" ? (body as { taskId?: unknown }).taskId : null;
    if (typeof taskId !== "string" || !UUID_RE.test(taskId)) {
      console.error("[turnover/notify] FAILED 400", { error: "taskId must be a uuid" });
      return NextResponse.json({ error: "taskId required (uuid)" }, { status: 400 });
    }

    // Same single writer the proposal-execute path uses (no agent side-door).
    const svc = createServiceClient();
    const r = await notifyCleaner(svc, { taskId, hostId: user.id });
    if (!r.ok) {
      const status = STATUS_FOR[r.code];
      console.error(`[turnover/notify] FAILED ${status}`, { error: r.error, taskId, code: r.code });
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ notified: true, cleaner_name: r.cleanerName, push: r.push });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[turnover/notify] FAILED 500 (outer)", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
