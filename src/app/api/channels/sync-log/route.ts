import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const channelFilter = searchParams.get("channel");
    const statusFilter = searchParams.get("status");
    const eventTypeFilter = searchParams.get("event_type");

    const supabase = createServiceClient();

    // Get this user's property channex IDs to scope logs
    const { data: userProps } = await supabase
      .from("properties")
      .select("channex_property_id")
      .eq("user_id", user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channexIds = ((userProps ?? []) as any[])
      .map((p) => p.channex_property_id)
      .filter(Boolean) as string[];

    if (channexIds.length === 0) {
      return NextResponse.json({ logs: [], total: 0, page });
    }

    // Build query
    let query = supabase
      .from("channex_webhook_log")
      .select("*", { count: "exact" })
      .in("channex_property_id", channexIds)
      .order("created_at", { ascending: false });

    if (eventTypeFilter) {
      query = query.ilike("event_type", `%${eventTypeFilter}%`);
    }
    if (statusFilter) {
      query = query.eq("action_taken", statusFilter);
    }
    if (channelFilter) {
      // Channel filter searches in the payload's ota_name or action_taken fields
      // Since the webhook log stores guest_name, we search broadly
      query = query.ilike("action_taken", `%${channelFilter}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("[channels/sync-log] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: data ?? [],
      total: count ?? 0,
      page,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/sync-log] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
