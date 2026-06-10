import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyHostComplete, notifyHostIssue } from "@/lib/notifications";
import { blockCompletionForMissingPhotos } from "@/lib/turnover/completion-gate";

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
      .select("id, property_id, scheduled_date, cleaner_token, photos")
      .eq("id", params.taskId)
      .eq("cleaner_token", params.token)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = ((tasks ?? []) as any[])[0];
    if (!task) {
      return NextResponse.json({ error: "Invalid task or token" }, { status: 403 });
    }

    // S3b — required-photo gate: can't mark complete without a confirmation
    // photo when the property requires it (require_completion_photos, default on).
    if (body.status === "completed") {
      const { data: pdRows } = await supabase
        .from("property_details")
        .select("require_completion_photos")
        .eq("property_id", task.property_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requirePhotos = ((pdRows ?? []) as any[])[0]?.require_completion_photos !== false;
      const photoCount = Array.isArray(task.photos) ? task.photos.length : 0;
      if (blockCompletionForMissingPhotos(body.status, requirePhotos, photoCount)) {
        return NextResponse.json(
          { error: "Add at least one photo before marking this clean complete." },
          { status: 400 },
        );
      }
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
    // photos are written server-side by the token-verified upload route
    // (/api/clean/[taskId]/[token]/photo) — the client no longer passes a
    // photos array here, so it can't inject arbitrary JSON.

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
