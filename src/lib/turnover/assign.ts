/**
 * assignCleaner — the single writer of the "assign + dispatch" turnover action
 * (P2.3). Extracted from POST /api/turnover/assign so BOTH the manual host
 * route AND the proposal-execute path call the SAME logic — no agent side-door,
 * no HTTP self-call (the M7 handler convention: handlers call shared lib fns
 * directly).
 *
 * "Assign IS Assign+Dispatch": sets cleaner_id + status=assigned AND fires the
 * web-push. The push is best-effort/post-commit — a push failure never fails
 * the assignment (the outcome is driven by the cleaning_tasks update, matching
 * the route's contract).
 *
 * Ownership is the authoritative gate: the cleaner must be owned by the host
 * and the task's property must be owned by the host. Re-assigning a turnover
 * that is already in_progress/completed is refused (the route lacked this
 * guard; the shared fn adds it).
 *
 * Returns a structured result (never throws for expected outcomes) so callers
 * map to HTTP status (route) or proposal status (execute handler).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAssignmentPush } from "@/lib/push/send";
import { emitHostNotification } from "@/lib/notifications/host-feed";

export type AssignCleanerFailCode =
  | "cleaner_not_found"
  | "task_not_found"
  | "property_not_found"
  | "already_started"
  | "update_failed";

export type AssignCleanerResult =
  | {
      ok: true;
      cleanerName: string;
      propertyName: string;
      push: Awaited<ReturnType<typeof sendAssignmentPush>> | null;
    }
  | { ok: false; code: AssignCleanerFailCode; error: string };

export async function assignCleaner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
  { taskId, cleanerId, hostId }: { taskId: string; cleanerId: string; hostId: string },
): Promise<AssignCleanerResult> {
  // Cleaner must be owned by the host.
  const { data: cleanerRows, error: cleanerError } = await svc
    .from("cleaners")
    .select("id, name, phone")
    .eq("id", cleanerId)
    .eq("user_id", hostId)
    .limit(1);
  if (cleanerError) return { ok: false, code: "update_failed", error: cleanerError.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaner = ((cleanerRows ?? []) as any[])[0];
  if (!cleaner) return { ok: false, code: "cleaner_not_found", error: "Cleaner not found" };

  // Task.
  const { data: taskRows, error: taskError } = await svc
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, scheduled_time, cleaner_token, status")
    .eq("id", taskId)
    .limit(1);
  if (taskError) return { ok: false, code: "update_failed", error: taskError.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return { ok: false, code: "task_not_found", error: "Task not found" };

  // Property must be owned by the host — the authoritative ownership gate.
  const { data: propRows } = await svc
    .from("properties")
    .select("id, name")
    .eq("id", task.property_id)
    .eq("user_id", hostId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = ((propRows ?? []) as any[])[0];
  if (!prop) return { ok: false, code: "property_not_found", error: "Property not found" };

  // Refuse re-assigning a turnover that is already being cleaned or is done.
  if (task.status === "in_progress" || task.status === "completed") {
    return {
      ok: false,
      code: "already_started",
      error: `Cannot reassign a turnover that is ${task.status}.`,
    };
  }

  // Mutate: assign + flip to 'assigned'.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateError } = await (svc.from("cleaning_tasks") as any)
    .update({ cleaner_id: cleanerId, status: "assigned" })
    .eq("id", taskId)
    .select();
  if (updateError) return { ok: false, code: "update_failed", error: updateError.message };
  if (!updated || updated.length === 0) {
    return { ok: false, code: "update_failed", error: "No rows updated" };
  }

  // Dispatch the web-push (best-effort, post-commit). A failure is logged and
  // swallowed — the assignment already succeeded.
  let push: Awaited<ReturnType<typeof sendAssignmentPush>> | null = null;
  try {
    const dateLabel = new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    push = await sendAssignmentPush(svc, {
      cleanerId,
      url: `/clean/${task.id}/${task.cleaner_token}`,
      title: "New cleaning job",
      body: `${prop.name} · ${dateLabel}`,
    });
    // P2.4: the cleaner has device(s) but NONE received the push → surface it on
    // the host's bell so a dispatch silently failing is visible. (total===0 is
    // "no devices subscribed yet", not a failure.)
    if (push && push.configured && push.total > 0 && push.sent === 0) {
      await emitHostNotification(svc, hostId, "push_delivery_failure", {
        cleanerName: cleaner.name,
        propertyName: prop.name,
        total: push.total,
      });
    }
  } catch (err) {
    console.warn("[assignCleaner] push notify failed:", err);
  }

  return { ok: true, cleanerName: cleaner.name, propertyName: prop.name, push };
}
