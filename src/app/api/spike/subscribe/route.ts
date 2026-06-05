/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — subscribe endpoint.
 * Receives the browser PushSubscription, LOGS it in full (server-side
 * instrumentation), holds it in-memory (no DB / no migration), and immediately
 * fires a confirmation push back to it ("Alerts on ✓"). Delete with the branch.
 * ==========================================================================*/
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getVapid, VAPID_SUBJECT } from "@/lib/spike/vapid";
import { holdSubscription } from "@/lib/spike/store";
import type { PushSubscription } from "web-push";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const subscription = body?.subscription as PushSubscription | undefined;
  const url =
    typeof body?.url === "string" && body.url.startsWith("/") ? body.url : "/";

  if (!subscription || !subscription.endpoint) {
    console.error("[spike/subscribe] missing subscription");
    return NextResponse.json({ error: "subscription required" }, { status: 400 });
  }

  const v = getVapid();
  webpush.setVapidDetails(VAPID_SUBJECT, v.publicKey, v.privateKey);

  // INSTRUMENTATION: the full subscription JSON in the server logs lets us fire
  // a closed-app test push later even if the in-memory hold was lost to a cold
  // start (copy it into the /api/spike/test-push body).
  console.log("[spike/subscribe] HELD SUBSCRIPTION", JSON.stringify({ url, subscription }));
  holdSubscription({ subscription, url, at: new Date().toISOString() });

  let confirmation = "sent";
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: "Alerts on ✓", body: "Tap to open the job", url })
    );
    console.log("[spike/subscribe] confirmation push SENT");
  } catch (e) {
    confirmation = "failed: " + (e instanceof Error ? e.message : String(e));
    console.error("[spike/subscribe] confirmation push FAILED", e);
  }

  return NextResponse.json({ ok: true, confirmation, subscription });
}
