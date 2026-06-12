/**
 * P6.4 — channel-health classification (read-only over existing signals).
 *
 * Health is derived from property_channels (status, last_error). No new schema.
 * The classification is deliberately CONSERVATIVE about calling a channel
 * "disconnected" — a false disconnect alert erodes trust more than a missed one.
 * Only an explicit non-active status (set by Channex disconnect/reconnect
 * webhooks) counts as disconnected; a last_error is the softer "degraded".
 *
 *   disconnected — status is not 'active' (the channel is explicitly down)
 *   degraded     — active but carrying a last_error
 *   healthy      — active, no error
 *
 * NOTE on staleness: last_sync_at is NOT a reliable health input today — the
 * polling workers don't consistently bump it (observed 2-months-stale on live
 * active channels), so treating staleness as "degraded" would flag every channel
 * permanently. We REPORT staleMinutes for the UI (informational "synced X ago")
 * but do not let it drive health. Making freshness load-bearing requires the
 * workers to maintain last_sync_at first (documented follow-up).
 */

export type ChannelHealthStatus = "healthy" | "degraded" | "disconnected";

export interface ChannelHealthInput {
  propertyId: string;
  propertyName?: string | null;
  channelCode: string;
  channelName: string;
  status: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface ChannelHealth extends ChannelHealthInput {
  health: ChannelHealthStatus;
  reason: string;
  staleMinutes: number | null;
}

export function classifyChannel(input: ChannelHealthInput, now: number = Date.now()): ChannelHealth {
  const staleMinutes =
    input.lastSyncAt != null
      ? Math.floor((now - new Date(input.lastSyncAt).getTime()) / 60_000)
      : null;

  let health: ChannelHealthStatus;
  let reason: string;

  if ((input.status ?? "active") !== "active") {
    health = "disconnected";
    reason = `channel status is "${input.status}"`;
  } else if (input.lastError) {
    health = "degraded";
    reason = `last sync reported an error: ${input.lastError}`;
  } else {
    health = "healthy";
    reason = staleMinutes == null ? "active" : `active · last sync ${staleMinutes} min ago`;
  }

  return { ...input, health, reason, staleMinutes };
}

/**
 * Load + classify every channel owned by a host (or all hosts when hostId is
 * null — for the service-key detector cron). Read-only.
 */
export async function loadChannelHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  hostId: string | null,
  now: number = Date.now(),
): Promise<ChannelHealth[]> {
  // Resolve the property set first (RLS-safe ownership scoping).
  let propsQuery = svc.from("properties").select("id, name");
  if (hostId) propsQuery = propsQuery.eq("user_id", hostId);
  const { data: props } = await propsQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propList = (props ?? []) as any[];
  if (propList.length === 0) return [];
  const nameById = new Map<string, string | null>(propList.map((p) => [p.id, p.name ?? null]));

  const { data: channels } = await svc
    .from("property_channels")
    .select("property_id, channel_code, channel_name, status, last_sync_at, last_error")
    .in("property_id", propList.map((p) => p.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelList = (channels ?? []) as any[];

  return channelList.map((c) =>
    classifyChannel(
      {
        propertyId: c.property_id,
        propertyName: nameById.get(c.property_id) ?? null,
        channelCode: c.channel_code,
        channelName: c.channel_name,
        status: c.status,
        lastSyncAt: c.last_sync_at,
        lastError: c.last_error,
      },
      now,
    ),
  );
}
