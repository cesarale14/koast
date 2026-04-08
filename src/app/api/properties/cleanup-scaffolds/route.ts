import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/properties/cleanup-scaffolds
 * Silently cleans up orphaned scaffold properties that have no active listing mappings.
 * Called when the Properties page loads and when the Add Property modal is closed without completing.
 */
export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Find local scaffold properties (name starts with "Pending Setup" or "SC-Scaffold")
    const { data: scaffolds } = await supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id)
      .or("name.like.Pending Setup%,name.like.SC-Scaffold%");

    const scaffoldList = (scaffolds ?? []) as { id: string; name: string; channex_property_id: string | null }[];
    if (scaffoldList.length === 0) {
      return NextResponse.json({ cleaned: 0 });
    }

    // Get mapped properties from Channex to determine which scaffolds have real mappings
    const mappedChannexIds = new Set<string>();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelsRes = await channex.request<any>("/channels");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ratePlansRes = await channex.request<any>("/rate_plans");

      // Find rate plans that have listings mapped (via channel rate_plans)
      const rpWithListings = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ch of (channelsRes.data ?? []) as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const rp of (ch.attributes?.rate_plans ?? []) as any[]) {
          if (rp.settings?.listing_id) rpWithListings.add(rp.rate_plan_id);
        }
      }

      // Map rate_plan_id → property_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const rp of (ratePlansRes.data ?? []) as any[]) {
        if (rpWithListings.has(rp.id)) {
          const propId = rp.relationships?.property?.data?.id;
          if (propId) mappedChannexIds.add(propId);
        }
      }
    } catch {
      // If Channex is unreachable, don't delete anything
      return NextResponse.json({ cleaned: 0, error: "Could not verify mappings" });
    }

    // Delete scaffolds that have NO active mapping
    let cleaned = 0;
    for (const scaffold of scaffoldList) {
      if (scaffold.channex_property_id && mappedChannexIds.has(scaffold.channex_property_id)) {
        continue; // Has a real mapping, don't delete
      }

      // Delete from Channex
      if (scaffold.channex_property_id) {
        try {
          // Remove from channel first
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const channelsRes = await channex.request<any>("/channels");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const ch of (channelsRes.data ?? []) as any[]) {
            const props: string[] = ch.attributes?.properties ?? [];
            if (props.includes(scaffold.channex_property_id)) {
              const filtered = props.filter((p) => p !== scaffold.channex_property_id);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await channex.request<any>(`/channels/${ch.id}`, {
                method: "PUT",
                body: JSON.stringify({ channel: { properties: filtered } }),
              });
            }
          }
          // Delete property
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await channex.request<any>(`/properties/${scaffold.channex_property_id}`, {
            method: "DELETE",
          });
        } catch {
          // Non-critical — Channex cleanup failure shouldn't block local cleanup
        }
      }

      // Delete from local DB (cascade tables)
      for (const table of ["channex_room_types", "channex_rate_plans", "property_channels"]) {
        await supabase.from(table).delete().eq("property_id", scaffold.id);
      }
      await supabase.from("properties").delete().eq("id", scaffold.id);
      cleaned++;
    }

    return NextResponse.json({ cleaned });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cleanup-scaffolds]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
