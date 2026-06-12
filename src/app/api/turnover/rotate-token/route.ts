import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyCleaner } from "@/lib/turnover/notify";

/**
 * POST /api/turnover/rotate-token  (P6.3 — cleaner-token rotation)
 *
 * Host-authenticated. Mints a fresh `cleaner_token` for a turnover, which
 * INSTANTLY invalidates the old link (any /clean/[taskId]/[oldToken] request
 * stops matching) and re-pushes the new link to the assigned cleaner. Use when
 * a link leaks or a cleaner is swapped off a job.
 *
 * Body: { taskId: string }
 * Returns: { rotated: true, link, repush }
 */
export async function POST(request: NextRequest) {
  const auth = createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const taskId: string | undefined = body?.taskId;
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const svc = createServiceClient();

  // Ownership: the task's property must belong to the caller.
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

  // Mint a new token (same format as turnover creation) and clear any prior
  // revoke/expiry so the fresh link is immediately valid.
  const newToken = crypto.randomBytes(16).toString("hex");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updErr } = await (svc.from("cleaning_tasks") as any)
    .update({ cleaner_token: newToken, token_invalidated_at: null, token_expires_at: null })
    .eq("id", taskId)
    .select("id");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: "No rows updated" }, { status: 500 });

  // Re-push the new link to the assigned cleaner (best-effort — the rotation
  // itself already succeeded; a push failure shouldn't 500 the request).
  let repush: { ok: boolean; code?: string } = { ok: false, code: "not_attempted" };
  try {
    const res = await notifyCleaner(svc, { taskId, hostId: user.id });
    repush = res.ok ? { ok: true } : { ok: false, code: res.code };
  } catch (err) {
    console.warn("[turnover/rotate-token] re-push failed:", err instanceof Error ? err.message : err);
    repush = { ok: false, code: "push_threw" };
  }

  return NextResponse.json({
    rotated: true,
    link: `/clean/${taskId}/${newToken}`,
    repush,
  });
}
