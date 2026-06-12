/**
 * GET /api/health/channels (P6.4) — per-channel health detail for the signed-in
 * host. Read-only over property_channels (status / last_sync_at / last_error);
 * see src/lib/health/channels.ts for the classification.
 */
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadChannelHealth } from "@/lib/health/channels";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const svc = createServiceClient();
    const channels = await loadChannelHealth(svc, user.id);
    const summary = {
      total: channels.length,
      healthy: channels.filter((c) => c.health === "healthy").length,
      degraded: channels.filter((c) => c.health === "degraded").length,
      disconnected: channels.filter((c) => c.health === "disconnected").length,
    };
    return NextResponse.json({ channels, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
