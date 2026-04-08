import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

const CHANNEX_PROP = "4d52bb8c-5bee-479a-81ae-2d0a9cb02785";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const baseUrl = process.env.CHANNEX_API_URL ?? "https://app.channex.io/api/v1";
    const apiKey = process.env.CHANNEX_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "CHANNEX_API_KEY not set" }, { status: 500 });

    // Call one_time_token endpoint
    const tokenRes = await fetch(`${baseUrl}/auth/one_time_token`, {
      method: "POST",
      headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: CHANNEX_PROP }),
    });

    const tokenStatus = tokenRes.status;
    const tokenBody = await tokenRes.text();

    let parsed;
    try { parsed = JSON.parse(tokenBody); } catch { parsed = null; }

    const token = parsed?.data?.token ?? parsed?.data?.attributes?.token ?? null;

    // The iframe server is the same as API but without /api/v1
    const iframeServer = "https://app.channex.io";

    // Generate multiple URL variations to test
    const variations = token ? {
      // Current (broken) — no redirect_to
      v1_no_redirect: `${iframeServer}/auth/exchange?oauth_session_key=${token}&app_mode=headless&property_id=${CHANNEX_PROP}&available_channels=ABB`,

      // With redirect_to=/channels — should land on channel management page
      v2_redirect_channels: `${iframeServer}/auth/exchange?oauth_session_key=${token}&app_mode=headless&redirect_to=/channels&property_id=${CHANNEX_PROP}&channels=ABB`,

      // With redirect_to=/channels and multiple channels
      v3_redirect_channels_multi: `${iframeServer}/auth/exchange?oauth_session_key=${token}&app_mode=headless&redirect_to=/channels&property_id=${CHANNEX_PROP}&channels=ABB,BDC,VRBO`,

      // Without headless mode — shows full UI with navigation
      v4_full_ui_channels: `${iframeServer}/auth/exchange?oauth_session_key=${token}&redirect_to=/channels&property_id=${CHANNEX_PROP}&channels=ABB`,

      // With channels_filter (display only) + available_channels (connect permission)
      v5_filter_and_available: `${iframeServer}/auth/exchange?oauth_session_key=${token}&app_mode=headless&redirect_to=/channels&property_id=${CHANNEX_PROP}&channels_filter=ABB&available_channels=ABB`,

      // All channels allowed, redirect to channels page
      v6_all_channels: `${iframeServer}/auth/exchange?oauth_session_key=${token}&app_mode=headless&redirect_to=/channels&property_id=${CHANNEX_PROP}`,
    } : null;

    return NextResponse.json({
      debug: {
        channex_api_url: baseUrl,
        iframe_server: iframeServer,
        api_key_prefix: apiKey.slice(0, 12) + "...",
        property_id: CHANNEX_PROP,
      },
      token_request: {
        status: tokenStatus,
        response: parsed ?? tokenBody,
        extracted_token: token,
      },
      iframe_urls: variations,
      recommendation: "v2_redirect_channels or v3_redirect_channels_multi should land on the channels page with the Create button visible",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
