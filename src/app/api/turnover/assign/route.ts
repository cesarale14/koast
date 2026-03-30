import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyCleanerAssigned } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { taskId, cleanerId } = body;
  if (!taskId || !cleanerId) {
    return NextResponse.json({ error: "taskId and cleanerId required" }, { status: 400 });
  }

  // Fetch the cleaner
  const { data: cleanerRows } = await supabase
    .from("cleaners")
    .select("id, name, phone")
    .eq("id", cleanerId)
    .eq("user_id", user.id)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaner = ((cleanerRows ?? []) as any[])[0];
  if (!cleaner) return NextResponse.json({ error: "Cleaner not found" }, { status: 404 });

  // Fetch the task
  const { data: taskRows } = await supabase
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, scheduled_time, cleaner_token")
    .eq("id", taskId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Verify user owns the property
  const { data: propRows } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", task.property_id)
    .eq("user_id", user.id)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = ((propRows ?? []) as any[])[0];
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // Update the task with the assigned cleaner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("cleaning_tasks") as any)
    .update({ cleaner_id: cleanerId, status: "assigned" })
    .eq("id", taskId);

  // Send SMS notification
  await notifyCleanerAssigned(supabase, task, prop.name, cleaner, {
    checkoutTime: task.scheduled_time ?? undefined,
    userId: user.id,
  });

  return NextResponse.json({ assigned: true, cleanerName: cleaner.name });
}
