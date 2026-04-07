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
    const iframeUrl = token
      ? `https://app.channex.io/auth/exchange?oauth_session_key=${token}&app_mode=headless&property_id=${CHANNEX_PROP}&available_channels=ABB`
      : null;

    return NextResponse.json({
      debug: {
        channex_base_url: baseUrl,
        api_key_prefix: apiKey.slice(0, 12) + "...",
        property_id: CHANNEX_PROP,
      },
      token_request: {
        status: tokenStatus,
        raw_response: parsed ?? tokenBody,
        extracted_token: token,
      },
      iframe_url: iframeUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
