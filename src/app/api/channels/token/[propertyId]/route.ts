import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

const CHANNEX_IFRAME_BASE = "https://app.channex.io";

export async function POST(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // Get property with channex_property_id
    const { data: propData } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("id", params.propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((propData ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    if (!property.channex_property_id) {
      return NextResponse.json(
        { error: "Property is not connected to Channex" },
        { status: 400 }
      );
    }

    const channex = createChannexClient();
    const { token } = await channex.createOneTimeToken(property.channex_property_id);

    const iframeUrl = `${CHANNEX_IFRAME_BASE}/auth/exchange?oauth_session_key=${token}&app_mode=headless&redirect_to=/channels&property_id=${property.channex_property_id}`;

    return NextResponse.json({
      token,
      iframe_url: iframeUrl,
      channex_property_id: property.channex_property_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/token] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
