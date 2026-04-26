// TURN-S1a — POST /api/turnover/notify
//
// Replaces the placeholder `alert("SMS notifications coming soon...")`
// in TurnoverBoard.tsx (was at :571-577 desktop and :747-755 expanded
// panel). Real Twilio send via the existing notifyCleanerReminder
// helper at src/lib/notifications/index.ts:56-81.
//
// Auth: getAuthenticatedUser + property-ownership double-check (same
// shape as /api/turnover/update).
// Body: { taskId: uuid }
// Response: 200 { notified: true, sid }; 400 if no cleaner assigned;
//   404 task/cleaner missing; 403 not your property; 500 Twilio error.
//
// Logs every 4xx/5xx to stderr so Vercel logs surface failures
// (Amendment 3).

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyCleanerReminder } from "@/lib/notifications";

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

    try {
      await notifyCleanerReminder(svc, task, prop.name, prop.address ?? "", cleaner, {
        checkoutTime: task.scheduled_time ?? undefined,
        userId: user.id,
      });
      return NextResponse.json({ notified: true, cleaner_name: cleaner.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Twilio send failed";
      console.error("[turnover/notify] FAILED 500 (Twilio)", { taskId, error: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[turnover/notify] FAILED 500 (outer)", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
