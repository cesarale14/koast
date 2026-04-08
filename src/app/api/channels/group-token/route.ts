import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

const CHANNEX_IFRAME_BASE = "https://app.channex.io";

/**
 * Group-level Channex iframe token.
 * Includes property_id of the first Channex property so the iframe
 * channels page renders correctly (it needs a property context).
 */
export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Get user's first Channex property for iframe context
    const { data: props } = await supabase
      .from("properties")
      .select("channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null)
      .limit(1);
    const channexPropertyId = ((props ?? []) as { channex_property_id: string }[])[0]?.channex_property_id;

    // Generate token (include property_id for iframe routing context)
    const tokenBody: Record<string, string> = {};
    if (channexPropertyId) tokenBody.property_id = channexPropertyId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await channex.request<any>("/auth/one_time_token", {
      method: "POST",
      body: JSON.stringify(tokenBody),
    });
    const token = res.data?.token;
    if (!token) throw new Error("No token in Channex response");

    // Build iframe URL — property_id gives the channels page a rendering context
    const params = new URLSearchParams({
      oauth_session_key: token,
      app_mode: "headless",
      redirect_to: "/channels",
    });
    if (channexPropertyId) params.set("property_id", channexPropertyId);

    const iframeUrl = `${CHANNEX_IFRAME_BASE}/auth/exchange?${params.toString()}`;

    return NextResponse.json({
      token,
      iframe_url: iframeUrl,
      channex_property_id: channexPropertyId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/group-token] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
