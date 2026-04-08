import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

function channexNameToCode(name: string): string {
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("airbnb")) return "ABB";
  if (lower.includes("booking")) return "BDC";
  if (lower.includes("vrbo") || lower.includes("homeaway")) return "VRBO";
  return name;
}

/**
 * GET /api/channels/status
 * Returns which OTA platforms are connected via OAuth for the current user.
 */
export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Get user's properties that have a Channex property linked
    const { data: props } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);
    const properties = (props ?? []) as { id: string; channex_property_id: string | null }[];
    const propertyIds = properties.map((p) => p.id);

    // Fetch property_channels rows for all user properties
    let dbChannels: { property_id: string; channel_code: string; channex_channel_id: string; status: string }[] = [];
    if (propertyIds.length > 0) {
      const { data } = await supabase
        .from("property_channels")
        .select("property_id, channel_code, channex_channel_id, status")
        .in("property_id", propertyIds);
      dbChannels = (data ?? []) as typeof dbChannels;
    }

    // Fetch live channels from Channex
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelsRes = await channex.request<{ data: { id: string; attributes: Record<string, unknown> }[] }>("/channels");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveChannels = (channelsRes.data ?? []) as any[];

    // Build a map: channel_id -> live channel info
    const liveMap = new Map<string, { name: string; active: boolean }>();
    for (const ch of liveChannels) {
      const attrs = ch.attributes ?? {};
      liveMap.set(ch.id, {
        name: String(attrs.channel ?? ""),
        active: !!attrs.is_active,
      });
    }

    // Build connected status per OTA code
    const connected: Record<string, { active: boolean; channel_id?: string; properties_count?: number }> = {
      ABB: { active: false },
      BDC: { active: false },
      VRBO: { active: false },
    };

    // Count properties per channel from DB data
    const channelPropertyCounts = new Map<string, Set<string>>();
    for (const row of dbChannels) {
      const code = row.channel_code;
      if (!channelPropertyCounts.has(code)) channelPropertyCounts.set(code, new Set());
      channelPropertyCounts.get(code)!.add(row.property_id);
    }

    // Enrich with live Channex data
    for (const ch of liveChannels) {
      const attrs = ch.attributes ?? {};
      const channelName = String(attrs.channel ?? "");
      const code = channexNameToCode(channelName);
      const isActive = !!attrs.is_active;

      if (connected[code]) {
        // If any live channel is active, mark as active
        if (isActive) {
          connected[code] = {
            active: true,
            channel_id: ch.id,
            properties_count: channelPropertyCounts.get(code)?.size ?? 0,
          };
        }
      } else {
        // Unknown OTA — include it anyway
        connected[code] = {
          active: isActive,
          channel_id: ch.id,
          properties_count: channelPropertyCounts.get(code)?.size ?? 0,
        };
      }
    }

    return NextResponse.json({ connected });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
