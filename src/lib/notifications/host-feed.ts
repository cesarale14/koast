/**
 * host-feed (P2.4) — emit a row into the curated host_notifications feed (the
 * bell). Best-effort: a feed-write failure must never break the event that
 * triggered it (a cleaning completion, a booking, a proposal). Writes via the
 * service client (host_notifications RLS is SELECT-only).
 *
 * This is the curated host UX feed — distinct from `notifications` (outbound
 * SMS/email audit log) and unified_audit_feed (the deep operational ledger).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HostNotificationType } from "@/lib/db/schema";

export interface HostNotificationRow {
  id: string;
  host_id: string;
  type: HostNotificationType;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface NormalizedHostNotification {
  id: string;
  type: HostNotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export function normalizeHostNotification(row: HostNotificationRow): NormalizedHostNotification {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function emitHostNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
  hostId: string,
  type: HostNotificationType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("host_notifications") as any).insert({
      host_id: hostId,
      type,
      payload,
    });
    if (error) console.warn(`[host-feed] emit ${type} failed:`, error.message);
  } catch (err) {
    console.warn(`[host-feed] emit ${type} threw:`, err);
  }
}
