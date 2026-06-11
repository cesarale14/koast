/**
 * notifyCleaner — the single writer of the "notify the cleaner about this job"
 * turnover action. Extracted from POST /api/turnover/notify so BOTH the manual
 * host route AND the proposal-execute path (P3.2 notify_cleaner) call the SAME
 * logic — no agent side-door, no HTTP self-call (the M7 handler convention:
 * handlers call shared lib fns directly; mirrors assignCleaner).
 *
 * Fires the SAME web-push dispatch as the assign path (sendAssignmentPush) for
 * the turnover's already-assigned cleaner (SMS retired — the toll-free number is
 * unverified). The push is the action; a push failure is captured in the
 * returned summary (configured/total/sent/pruned/failed) rather than thrown, so
 * the caller can give honest feedback. Requires a cleaner to be assigned.
 *
 * Ownership is authoritative: the task's property must be owned by the host and
 * the cleaner must be owned by the host. Returns a structured result (never
 * throws for expected outcomes) so callers map to HTTP status (route) or
 * proposal status (execute handler).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAssignmentPush } from "@/lib/push/send";

export type NotifyCleanerFailCode =
  | "task_not_found"
  | "property_not_found"
  | "no_cleaner_assigned"
  | "cleaner_not_found"
  | "load_failed";

export type NotifyCleanerResult =
  | {
      ok: true;
      cleanerName: string;
      propertyName: string;
      push: Awaited<ReturnType<typeof sendAssignmentPush>> | null;
    }
  | { ok: false; code: NotifyCleanerFailCode; error: string };

export async function notifyCleaner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
  { taskId, hostId }: { taskId: string; hostId: string },
): Promise<NotifyCleanerResult> {
  // Task.
  const { data: taskRows, error: taskError } = await svc
    .from("cleaning_tasks")
    .select("id, property_id, cleaner_id, scheduled_date, cleaner_token")
    .eq("id", taskId)
    .limit(1);
  if (taskError) return { ok: false, code: "load_failed", error: taskError.message };
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

  if (!task.cleaner_id) {
    return { ok: false, code: "no_cleaner_assigned", error: "No cleaner assigned to this turnover" };
  }

  // Cleaner must be owned by the host.
  const { data: cleanerRows } = await svc
    .from("cleaners")
    .select("id, name")
    .eq("id", task.cleaner_id)
    .eq("user_id", hostId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaner = ((cleanerRows ?? []) as any[])[0];
  if (!cleaner) return { ok: false, code: "cleaner_not_found", error: "Cleaner not found" };

  const dateLabel = new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const push = await sendAssignmentPush(svc, {
    cleanerId: task.cleaner_id,
    url: `/clean/${task.id}/${task.cleaner_token}`,
    title: "Cleaning job",
    body: `${prop.name} · ${dateLabel}`,
  });

  return { ok: true, cleanerName: cleaner.name, propertyName: prop.name, push };
}
