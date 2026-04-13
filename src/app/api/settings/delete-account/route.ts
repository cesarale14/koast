import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { confirmation } = await request.json();
    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();
    const userId = user.id;

    // Get all user's property IDs AND Channex linkage info so we can
    // clean up Channex resources before destroying the local rows.
    const { data: userProps } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("user_id", userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyRows = ((userProps ?? []) as Array<{ id: string; channex_property_id: string | null }>);
    const propertyIds = propertyRows.map((p) => p.id);

    // Channex cleanup — best-effort, doesn't block local delete.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelRows } = await (supabase.from("property_channels") as any)
      .select("channex_channel_id, channel_code, settings, property_id")
      .in("property_id", propertyIds.length > 0 ? propertyIds : ["__none__"]);
    for (const ch of ((channelRows ?? []) as Array<{ channex_channel_id: string; channel_code: string; settings: { rate_plan_id?: string } | null }>)) {
      if (ch.channex_channel_id.startsWith("auto-")) continue;
      try {
        await channex.deleteChannel(ch.channex_channel_id);
      } catch (err) {
        console.warn(`[delete-account] Channex channel ${ch.channex_channel_id} delete failed:`, err instanceof Error ? err.message : err);
      }
      const ratePlanId = ch.settings?.rate_plan_id;
      if (ratePlanId) {
        try {
          await channex.deleteRatePlan(ratePlanId);
        } catch (err) {
          console.warn(`[delete-account] Channex rate plan ${ratePlanId} delete failed:`, err instanceof Error ? err.message : err);
        }
      }
    }
    // Delete Channex properties owned only by this user.
    for (const p of propertyRows) {
      if (!p.channex_property_id) continue;
      try {
        await channex.deleteProperty(p.channex_property_id);
      } catch (err) {
        console.warn(`[delete-account] Channex property ${p.channex_property_id} delete failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (propertyIds.length > 0) {
      // Delete all property-scoped data
      const tables = [
        "pricing_outcomes",
        "market_comps",
        "market_snapshots",
        "local_events",
        "calendar_rates",
        "cleaning_tasks",
        "ical_feeds",
        "guest_reviews",
        "review_rules",
        "messages",
        "message_templates",
        "bookings",
        "listings",
        "property_details",
        "property_channels",
        "channex_room_types",
        "channex_rate_plans",
      ];

      for (const table of tables) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from(table) as any)
          .delete()
          .in("property_id", propertyIds);
      }

      // Delete properties
      await supabase
        .from("properties")
        .delete()
        .eq("user_id", userId);
    }

    // Note: leads and revenue_checks are anonymous/public data without user_id — not deleted

    // Delete the auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("[delete-account] Auth delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to delete auth account" }, { status: 500 });
    }

    console.log(`[delete-account] User ${userId} fully deleted`);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[delete-account] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deletion failed" },
      { status: 500 }
    );
  }
}
