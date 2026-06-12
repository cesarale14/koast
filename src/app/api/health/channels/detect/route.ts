/**
 * POST /api/health/channels/detect (P6.4) — service-key detector. Sweeps every
 * host's channels and emits a `channel_disconnect` host bell for each channel
 * that is currently disconnected, with a transition-dedup so a channel that
 * stays down doesn't re-ring every run. Called daily by the validator cron
 * (alongside the pricing + opportunity detectors), same x-service-key source.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyServiceKey } from "@/lib/auth/api-auth";
import { loadChannelHealth } from "@/lib/health/channels";
import { emitHostNotification } from "@/lib/notifications/host-feed";

export const dynamic = "force-dynamic";

// Don't re-ring the same channel more than once per this window while it stays down.
const DEDUP_HOURS = 24;

export async function POST(request: NextRequest) {
  if (!verifyServiceKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const svc = createServiceClient();
    const all = await loadChannelHealth(svc, null); // all hosts
    const disconnected = all.filter((c) => c.health === "disconnected");

    const since = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString();
    let emitted = 0;
    let deduped = 0;

    for (const c of disconnected) {
      const { data: propRows } = await svc
        .from("properties").select("user_id").eq("id", c.propertyId).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hostId: string | null = ((propRows ?? []) as any[])[0]?.user_id ?? null;
      if (!hostId) continue;

      // Transition-dedup: skip if a channel_disconnect bell for this exact
      // (property, channel) already fired inside the window.
      const { data: recent } = await svc
        .from("host_notifications")
        .select("payload")
        .eq("host_id", hostId)
        .eq("type", "channel_disconnect")
        .gte("created_at", since);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const already = ((recent ?? []) as any[]).some(
        (r) => r.payload?.propertyId === c.propertyId && r.payload?.channelCode === c.channelCode,
      );
      if (already) { deduped++; continue; }

      await emitHostNotification(svc, hostId, "channel_disconnect", {
        propertyId: c.propertyId,
        propertyName: c.propertyName,
        channelCode: c.channelCode,
        channelName: c.channelName,
        reason: c.reason,
      });
      emitted++;
    }

    return NextResponse.json({
      checked: all.length,
      disconnected: disconnected.length,
      emitted,
      deduped,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
