import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { confirmation } = await request.json();
    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const userId = user.id;

    // Get all user's property IDs
    const { data: userProps } = await supabase
      .from("properties")
      .select("id")
      .eq("user_id", userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyIds = ((userProps ?? []) as any[]).map((p) => p.id);

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
