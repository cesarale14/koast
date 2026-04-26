// MSG-S1 — POST /api/messages/sync
//
// Manual refresh trigger. Mirrors POST /api/reviews/sync. Calls the
// shared helper at src/lib/messages/sync.ts. Optional propertyId
// scope.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { syncMessagesForOneProperty, syncMessagesForUser } from "@/lib/messages/sync";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    let body: { property_id?: string } = {};
    try { body = await request.json(); } catch { /* empty body ok */ }

    if (body.property_id) {
      const owned = await verifyPropertyOwnership(user.id, body.property_id);
      if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pRows } = await (supabase.from("properties") as any)
        .select("id, name, channex_property_id")
        .eq("id", body.property_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = ((pRows as any[] | null) ?? [])[0];
      if (!p?.channex_property_id) {
        return NextResponse.json({ error: "Property has no channex linkage" }, { status: 400 });
      }

      const result = await syncMessagesForOneProperty(supabase, p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("properties") as any)
        .update({ messages_last_synced_at: new Date().toISOString() })
        .eq("id", p.id);
      return NextResponse.json({ scope: "property", property_id: p.id, result });
    }

    const all = await syncMessagesForUser(supabase, user.id);
    return NextResponse.json({ scope: "user", ...all });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/messages/sync] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
