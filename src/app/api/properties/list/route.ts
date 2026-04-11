import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/properties/list
 *
 * Lightweight list of the authed user's properties (id + name). Used by the
 * conflict resolution modal to populate relocation candidates.
 */
export async function GET() {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("properties")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name");

    return NextResponse.json({ properties: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "list failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
