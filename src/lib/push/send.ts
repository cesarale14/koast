/**
 * Cleaner web-push send path (TURN-S2-send).
 *
 * sendAssignmentPush fans a single notification out to every push subscription
 * a cleaner has registered (one per installed device). Dead endpoints are
 * pruned: a send that returns 410 Gone (or 404) deletes that subscription row.
 *
 * Best-effort by contract — the assign route calls this AFTER it has already
 * committed the assignment, so a push failure must never surface as an assign
 * failure. Every error is caught and reported in the returned summary; nothing
 * throws into the caller. If VAPID isn't configured (env unset), it no-ops with
 * { skipped: true }.
 */

import webpush from "web-push";
import { getVapidConfig } from "./vapid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface AssignmentPushInput {
  cleanerId: string;
  /** Deep link path to the job, e.g. /clean/<taskId>/<token>. */
  url: string;
  title: string;
  body: string;
}

export interface PushSendSummary {
  configured: boolean;
  total: number;
  sent: number;
  pruned: number;
  failed: number;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendAssignmentPush(
  supabase: AnySupabase,
  input: AssignmentPushInput,
): Promise<PushSendSummary> {
  const summary: PushSendSummary = { configured: false, total: 0, sent: 0, pruned: 0, failed: 0 };

  const vapid = getVapidConfig();
  if (!vapid) {
    console.warn("[push/send] VAPID not configured (VAPID_PUBLIC_KEY/PRIVATE_KEY unset) — skipping push");
    return summary;
  }
  summary.configured = true;

  const { data: subsData, error } = await supabase
    .from("cleaner_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("cleaner_id", input.cleanerId);
  if (error) {
    console.error("[push/send] failed to load subscriptions:", error.message ?? error);
    return summary;
  }
  const subs = (subsData ?? []) as SubRow[];
  summary.total = subs.length;
  if (subs.length === 0) return summary;

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const payload = JSON.stringify({ title: input.title, body: input.body, url: input.url });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      summary.sent++;
    } catch (err) {
      // 410 Gone (or 404) → the endpoint is dead; prune it.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        try {
          await supabase.from("cleaner_push_subscriptions").delete().eq("id", sub.id);
          summary.pruned++;
          console.log(`[push/send] pruned dead subscription ${sub.id} (status ${status})`);
        } catch (delErr) {
          summary.failed++;
          console.error(`[push/send] prune failed for ${sub.id}:`, delErr instanceof Error ? delErr.message : delErr);
        }
      } else {
        summary.failed++;
        console.error(`[push/send] send failed for ${sub.id} (status ${status ?? "?"}):`, err instanceof Error ? err.message : err);
      }
    }
  }

  return summary;
}
