/**
 * POST /api/clean/[taskId]/[token]/subscribe  (TURN-S2-send)
 *
 * The cleaner portal's "Enable job alerts" flow posts the browser
 * PushSubscription here. The task token authenticates the device: we resolve
 * (taskId, token) → task → cleaner_id and bind the subscription to that
 * cleaner, so one installed device receives all of that cleaner's future jobs.
 *
 * Idempotent on endpoint (UNIQUE): re-subscribing the same device updates its
 * keys + cleaner binding + last_seen_at rather than duplicating. Service-role
 * client (cleaners are not Supabase auth users; the token is the auth).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { verifyCleanerToken } from "@/lib/cleaner-token/verify";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string; token: string } },
) {
  try {
    const body = await request.json().catch(() => null);
    const subscription = body?.subscription as
      | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      | undefined;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "subscription with endpoint + keys required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // P6.3 — throttle subscribe attempts per IP.
    const rl = await rateLimit(supabase, { key: `clean-subscribe:${clientIp(request)}`, limit: 20, windowSec: 60 });
    if (!rl.allowed) return rateLimited(rl);

    // Token authenticates the device → resolve the owning cleaner.
    const tokenAuth = await verifyCleanerToken(supabase, params.taskId, params.token, "id, cleaner_id");
    if (!tokenAuth.ok) return NextResponse.json({ error: tokenAuth.error }, { status: tokenAuth.status });
    const task = tokenAuth.task;
    if (!task.cleaner_id) {
      // No cleaner to bind to yet — the task must be assigned first.
      return NextResponse.json({ error: "Task not assigned to a cleaner yet" }, { status: 409 });
    }

    const userAgent = request.headers.get("user-agent");
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertErr } = await (supabase.from("cleaner_push_subscriptions") as any).upsert(
      {
        cleaner_id: task.cleaner_id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        last_seen_at: now,
      },
      { onConflict: "endpoint" },
    );
    if (upsertErr) {
      console.error("[clean/subscribe] upsert error:", upsertErr.message ?? upsertErr);
      return NextResponse.json({ error: upsertErr.message ?? "Failed to save subscription" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
