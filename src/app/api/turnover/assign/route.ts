import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assignCleaner } from "@/lib/turnover/assign";
import { writeAuditLog } from "@/lib/action-substrate/audit-writer";

export async function POST(request: NextRequest) {
  const auth = createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { taskId, cleanerId } = (body ?? {}) as { taskId?: string; cleanerId?: string };
  if (!taskId || !cleanerId) {
    return NextResponse.json({ error: "taskId and cleanerId required" }, { status: 400 });
  }

  // Single writer — the SAME lib fn the proposal-execute path calls (no
  // agent side-door). Service client bypasses RLS; ownership is enforced
  // inside assignCleaner against the host id.
  const svc = createServiceClient();
  const result = await assignCleaner(svc, { taskId, cleanerId, hostId: user.id });

  if (!result.ok) {
    const status =
      result.code === "already_started" ? 409 : result.code === "update_failed" ? 500 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Audit the manual assign so the unified feed reflects it (manual assigns
  // were previously unaudited). Best-effort — an audit failure must not fail
  // the already-committed assignment.
  try {
    await writeAuditLog({
      host_id: user.id,
      action_type: "assign_cleaner",
      payload: { taskId, cleanerId },
      source: "frontend_api",
      actor_kind: "host",
      actor_id: user.id,
      autonomy_level: "confirmed",
      outcome: "succeeded",
      context: {
        cleaner_name: result.cleanerName,
        property_name: result.propertyName,
        push: result.push ?? null,
      },
      stakes_class: "medium",
    });
  } catch (err) {
    console.warn("[turnover/assign] audit write failed:", err);
  }

  return NextResponse.json({ assigned: true, cleanerName: result.cleanerName, push: result.push ?? null });
}
