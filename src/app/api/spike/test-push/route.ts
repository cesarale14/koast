/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — secret-guarded "send a test push" endpoint.
 * This is the REAL use case: fire a push while the cleaner's app is
 * closed/backgrounded and confirm it arrives + tapping opens the job page.
 *
 *   POST /api/spike/test-push?secret=<secret>
 *        body: { subscription, url }   ← reliable (pass the sub from the page)
 *   POST/GET /api/spike/test-push?secret=<secret>
 *        ← convenience: uses the last in-memory-held subscription (warm
 *          instance only; may be lost to a cold start — then use the body form)
 * Delete with the spike branch.
 * ==========================================================================*/
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getVapid, VAPID_SUBJECT, SPIKE_TEST_SECRET } from "@/lib/spike/vapid";
import { lastHeldSubscription } from "@/lib/spike/store";
import type { PushSubscription } from "web-push";

export const runtime = "nodejs";

async function fire(subscription: PushSubscription, url: string) {
  const v = getVapid();
  webpush.setVapidDetails(VAPID_SUBJECT, v.publicKey, v.privateKey);
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: "Koast — new cleaning job",
      body: "Tap to open the job",
      url,
    })
  );
}

export async function POST(req: NextRequest) {
  const qSecret = req.nextUrl.searchParams.get("secret") ?? "";
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const secret = qSecret || (typeof body.secret === "string" ? body.secret : "");
  if (secret !== SPIKE_TEST_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const held = lastHeldSubscription();
  const subscription =
    (body.subscription as PushSubscription | undefined) ?? held?.subscription;
  const url =
    (typeof body.url === "string" ? (body.url as string) : undefined) ??
    held?.url ??
    "/";
  if (!subscription) {
    return NextResponse.json(
      { error: "no subscription — pass {subscription} in the body (copy it from the page or the subscribe logs)" },
      { status: 400 }
    );
  }
  try {
    await fire(subscription, url);
    console.log("[spike/test-push] sent to", subscription.endpoint);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? "";
  if (secret !== SPIKE_TEST_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const held = lastHeldSubscription();
  if (!held) {
    return NextResponse.json(
      { error: "no held subscription (warm-instance only) — use POST with {subscription}" },
      { status: 400 }
    );
  }
  try {
    await fire(held.subscription, held.url);
    return NextResponse.json({ ok: true, url: held.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
