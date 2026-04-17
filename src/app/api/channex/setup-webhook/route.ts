// DEV-ONLY: Channex certification/testing endpoint — not for production use
import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const propertyId = body.property_id ?? "c83ba211-2e79-4de0-b388-c88d9f695581";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!body.callback_url && !appUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not set — can't build default callback URL");
    }
    const callbackUrl = body.callback_url ?? `${appUrl}/api/webhooks/channex`;
    const eventMask = body.event_mask ?? "booking";

    const channex = createChannexClient();

    console.log(`[setup-webhook] Creating webhook for property ${propertyId}`);
    console.log(`[setup-webhook] Callback: ${callbackUrl}`);
    console.log(`[setup-webhook] Events: ${eventMask}`);

    const res = await channex.createWebhook({
      property_id: propertyId,
      callback_url: callbackUrl,
      event_mask: eventMask,
      is_active: true,
      send_data: true,
    });

    const webhookId = res.data?.id;
    console.log(`[setup-webhook] Webhook created: ${webhookId}`);

    return NextResponse.json({
      webhook_id: webhookId,
      property_id: propertyId,
      callback_url: callbackUrl,
      event_mask: eventMask,
      response: res,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[setup-webhook] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
