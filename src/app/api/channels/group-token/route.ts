import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createChannexClient } from "@/lib/channex/client";

const CHANNEX_IFRAME_BASE = "https://app.channex.io";

/**
 * Group-level Channex iframe token — not scoped to a single property.
 * Used for initial OTA OAuth where we want to connect the user's entire
 * Airbnb/BDC/VRBO account, not just one listing.
 */
export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const channex = createChannexClient();

    // Get the user's Channex group (first group found)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = await channex.request<any>("/groups");
    const groupId = groups.data?.[0]?.id;

    // Generate group-level token (no property_id = access to all properties + channels)
    const body: Record<string, string> = {};
    if (groupId) body.group_id = groupId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await channex.request<any>("/auth/one_time_token", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const token = res.data?.token;
    if (!token) throw new Error("No token in Channex response");

    // Group-level iframe URL — no property_id filter, shows all channels
    const iframeUrl = `${CHANNEX_IFRAME_BASE}/auth/exchange?oauth_session_key=${token}&app_mode=headless&redirect_to=/channels`;

    return NextResponse.json({ token, iframe_url: iframeUrl, group_id: groupId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/group-token] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
