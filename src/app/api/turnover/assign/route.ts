import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendAssignmentPush } from "@/lib/push/send";

export async function POST(request: NextRequest) {
  const auth = createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { taskId, cleanerId } = body;
  if (!taskId || !cleanerId) {
    return NextResponse.json({ error: "taskId and cleanerId required" }, { status: 400 });
  }

  // Service client bypasses RLS
  const svc = createServiceClient();

  // Fetch the cleaner
  const { data: cleanerRows, error: cleanerError } = await svc
    .from("cleaners")
    .select("id, name, phone")
    .eq("id", cleanerId)
    .eq("user_id", user.id)
    .limit(1);

  if (cleanerError) {
    console.error("[turnover/assign] cleaner fetch error:", cleanerError);
    return NextResponse.json({ error: cleanerError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaner = ((cleanerRows ?? []) as any[])[0];
  if (!cleaner) return NextResponse.json({ error: "Cleaner not found" }, { status: 404 });

  // Fetch the task
  const { data: taskRows, error: taskError } = await svc
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, scheduled_time, cleaner_token")
    .eq("id", taskId)
    .limit(1);

  if (taskError) {
    console.error("[turnover/assign] task fetch error:", taskError);
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Verify user owns the property
  const { data: propRows } = await svc
    .from("properties")
    .select("id, name")
    .eq("id", task.property_id)
    .eq("user_id", user.id)
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = ((propRows ?? []) as any[])[0];
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // Update + verify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateError } = await (svc.from("cleaning_tasks") as any)
    .update({ cleaner_id: cleanerId, status: "assigned" })
    .eq("id", taskId)
    .select();

  if (updateError) {
    console.error("[turnover/assign] update error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    console.error("[turnover/assign] no rows updated for task:", taskId);
    return NextResponse.json({ error: "No rows updated" }, { status: 500 });
  }

  // TURN-S2-send — notify the cleaner via web-push (replaces the abandoned
  // SMS path). Best-effort: the assignment is already committed above, so a
  // push failure must not fail the request. sendAssignmentPush fans out to all
  // of the cleaner's installed devices and prunes any 410-Gone endpoints.
  let push;
  try {
    const dateLabel = new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    push = await sendAssignmentPush(svc, {
      cleanerId: cleanerId,
      url: `/clean/${task.id}/${task.cleaner_token}`,
      title: "New cleaning job",
      body: `${prop.name} · ${dateLabel}`,
    });
  } catch (err) {
    console.warn("[turnover/assign] push notify failed:", err);
  }

  return NextResponse.json({ assigned: true, cleanerName: cleaner.name, push: push ?? null });
}
