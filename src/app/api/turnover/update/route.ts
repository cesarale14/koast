import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { taskId, status } = body;
  if (!taskId || !status) {
    return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Fetch task and verify ownership
  const { data: taskRows } = await svc
    .from("cleaning_tasks")
    .select("id, property_id")
    .eq("id", taskId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { data: propRows } = await svc
    .from("properties")
    .select("id")
    .eq("id", task.property_id)
    .eq("user_id", user.id)
    .limit(1);
  if (!propRows?.length) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { status };
  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc.from("cleaning_tasks") as any).update(updateData).eq("id", taskId);

  return NextResponse.json({ updated: true, status });
}
