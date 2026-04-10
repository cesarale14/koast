import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  // Auth check via cookie client
  const auth = createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { taskId, status } = body;
  if (!taskId || !status) {
    return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
  }

  // Service client now uses @supabase/supabase-js directly — bypasses RLS
  const svc = createServiceClient();

  // Verify ownership
  const { data: taskRows, error: fetchError } = await svc
    .from("cleaning_tasks")
    .select("id, property_id")
    .eq("id", taskId)
    .limit(1);

  if (fetchError) {
    console.error("[turnover/update] fetch error:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { data: propRows, error: propError } = await svc
    .from("properties")
    .select("id")
    .eq("id", task.property_id)
    .eq("user_id", user.id)
    .limit(1);

  if (propError) {
    console.error("[turnover/update] property check error:", propError);
    return NextResponse.json({ error: propError.message }, { status: 500 });
  }
  if (!propRows?.length) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { status };
  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  }

  // Update + .select() to verify the row was actually updated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateError } = await (svc.from("cleaning_tasks") as any)
    .update(updateData)
    .eq("id", taskId)
    .select();

  if (updateError) {
    console.error("[turnover/update] update error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    console.error("[turnover/update] no rows updated for task:", taskId);
    return NextResponse.json({ error: "No rows updated" }, { status: 500 });
  }

  console.log("[turnover/update] success:", { taskId, status, rowsUpdated: updated.length });
  return NextResponse.json({ updated: true, status, task: updated[0] });
}
