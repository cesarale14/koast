import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyHostComplete, notifyHostIssue } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string; token: string } }
) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    // Validate token
    const { data: tasks } = await supabase
      .from("cleaning_tasks")
      .select("id, property_id, scheduled_date, cleaner_token")
      .eq("id", params.taskId)
      .eq("cleaner_token", params.token)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = ((tasks ?? []) as any[])[0];
    if (!task) {
      return NextResponse.json({ error: "Invalid task or token" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (body.status) {
      updateData.status = body.status;
      if (body.status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (body.checklist) updateData.checklist = body.checklist;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.photos) updateData.photos = body.photos;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("cleaning_tasks") as any)
      .update(updateData)
      .eq("id", params.taskId);

    // Get property name + owning host for notifications. M10 Phase C STEP 7
    // (M3): cleaner-facing route is public-token (no auth.uid); host_id
    // derived via task.property_id -> properties.user_id.
    const { data: props } = await supabase
      .from("properties").select("name, user_id").eq("id", task.property_id).limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = ((props ?? []) as any[])[0];
    const propName: string = prop?.name ?? "Property";
    const hostId: string | null = prop?.user_id ?? null;

    // Send notifications
    if (body.status === "completed") {
      await notifyHostComplete(supabase, hostId, task, propName);
    } else if (body.status === "issue") {
      await notifyHostIssue(supabase, hostId, task, propName, body.issueDescription ?? "Issue reported");
    }

    return NextResponse.json({ updated: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
