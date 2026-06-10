import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/turnover/photos/[taskId]  (S3b — v1 program)
 *
 * Owner-gated host view of a turnover's cleaner-confirmation photos. The bucket
 * is private, so the host views via short-lived signed URLs minted here. Verifies
 * the task's property belongs to the caller before returning anything.
 */
export const runtime = "nodejs";

const BUCKET = "cleaning-photos";

export async function GET(
  _request: NextRequest,
  { params }: { params: { taskId: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const { data: tasks } = await supabase
      .from("cleaning_tasks")
      .select("id, property_id, photos")
      .eq("id", params.taskId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = ((tasks ?? []) as any[])[0];
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (!(await verifyPropertyOwnership(user.id, task.property_id)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const photos = Array.isArray(task.photos) ? task.photos : [];
    const out: { url: string; uploaded_at: string | null }[] = [];
    for (const p of photos) {
      const path = p?.path;
      if (!path || typeof path !== "string") continue;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (signed?.signedUrl) out.push({ url: signed.signedUrl, uploaded_at: p.uploaded_at ?? null });
    }
    return NextResponse.json({ photos: out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
