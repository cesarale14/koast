/**
 * GET /api/notifications/unread-count — the bell badge count (read_at IS NULL),
 * with a display string ("1".."9"|"9+"|null).
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceClient();
    const { count, error } = await svc
      .from("host_notifications")
      .select("id", { count: "exact", head: true })
      .eq("host_id", user.id)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const n = count ?? 0;
    const display = n <= 0 ? null : n > 9 ? "9+" : String(n);
    return NextResponse.json({ count: n, display });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
