import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFilteredCompSet } from "@/lib/airroi/compsets";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Check for cached comps — return if <7 days old.
    const { data: cached } = await supabase
      .from("market_comps")
      .select("*")
      .eq("property_id", propertyId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedComps = (cached ?? []) as any[];
    if (cachedComps.length > 0) {
      const newest = cachedComps.reduce((a, b) =>
        new Date(a.last_synced) > new Date(b.last_synced) ? a : b
      );
      const age = Date.now() - new Date(newest.last_synced).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          source: "cache",
          comps: cachedComps,
        });
      }
    }

    // Build fresh via the canonical filtered builder (same one used by
    // property import + daily market_sync refresh). Unified in Track B
    // Stage 1 PR A — see src/lib/airroi/compsets.ts.
    const result = await buildFilteredCompSet(supabase, propertyId);

    if (result.inserted === 0) {
      return NextResponse.json({
        source: "airroi",
        comps: [],
        summary: result.summary,
        skipped_reason: result.reason ?? null,
      });
    }

    return NextResponse.json({
      source: "airroi",
      comps: result.comps,
      summary: result.summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[market/comps] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
