/**
 * GET /api/notifications — the host's curated notification feed (newest first),
 * powering the bell's panel. Host-scoped (service client filtered to the
 * authenticated host; host_notifications RLS is SELECT-only).
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeHostNotification, type HostNotificationRow } from "@/lib/notifications/host-feed";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceClient();
    const { data, error } = await svc
      .from("host_notifications")
      .select("*")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const notifications = ((data ?? []) as HostNotificationRow[]).map(normalizeHostNotification);
    return NextResponse.json({ notifications });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
