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
import { sendAssignmentPush } from "@/lib/push/send";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const svc = createServiceClient();

    // Load task
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tRows } = await (svc.from("cleaning_tasks") as any)
      .select("id, property_id, cleaner_id, scheduled_date, scheduled_time, cleaner_token")
      .eq("id", taskId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = ((tRows as any[] | null) ?? [])[0];
    if (!task) {
      console.error("[turnover/notify] FAILED 404", { error: "task not found", taskId });
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Verify ownership of the property
    const { data: pRows } = await svc
      .from("properties")
      .select("id, name, address")
      .eq("id", task.property_id)
      .eq("user_id", user.id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = ((pRows as any[] | null) ?? [])[0];
    if (!prop) {
      console.error("[turnover/notify] FAILED 403", { taskId, userId: user.id });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!task.cleaner_id) {
      console.error("[turnover/notify] FAILED 400", { error: "no cleaner assigned", taskId });
      return NextResponse.json({ error: "No cleaner assigned" }, { status: 400 });
    }

    // Load cleaner
    const { data: cRows } = await svc
      .from("cleaners")
      .select("id, name, phone")
      .eq("id", task.cleaner_id)
      .eq("user_id", user.id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaner = ((cRows as any[] | null) ?? [])[0];
    if (!cleaner) {
      console.error("[turnover/notify] FAILED 404", { error: "cleaner missing", taskId, cleanerId: task.cleaner_id });
      return NextResponse.json({ error: "Cleaner not found" }, { status: 404 });
    }

    // TURN-S2-send wiring — Notify now fires the SAME web-push dispatch as the
    // assign path (SMS retired). Reuses sendAssignmentPush: sends to all of the
    // cleaner's cleaner_push_subscriptions, deep-links to the job, 410-prunes
    // dead endpoints. Returns the send summary so the UI gives honest feedback
    // (devices reached / none subscribed / not configured) instead of a fake
    // "SMS sent" toast.
    const dateLabel = new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const push = await sendAssignmentPush(svc, {
      cleanerId: task.cleaner_id,
      url: `/clean/${task.id}/${task.cleaner_token}`,
      title: "Cleaning job",
      body: `${prop.name} · ${dateLabel}`,
    });
    return NextResponse.json({ notified: true, cleaner_name: cleaner.name, push });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[turnover/notify] FAILED 500 (outer)", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
