/**
 * GET /api/dashboard/tab-visibility — M8 C6 (D12).
 *
 * Returns the boolean visibility map for the five conditional sidebar
 * tabs. The host's properties are scoped via `properties.user_id`
 * (legacy pre-M8 column; M8 host_id substrate is on memory_facts /
 * agent_conversations / agent_audit_log / guests only). Each predicate
 * is an EXISTS-style LIMIT 1 check against the canonical table that
 * backs the tab's UI.
 *
 * Auth: createClient + supabase.auth.getUser. host_id is derived from
 * the authenticated session; never from query params (same pattern as
 * /api/audit-feed/list).
 *
 * Response 200:
 *   { calendar: bool, reviews: bool, turnovers: bool, market_intel: bool, comp_sets: bool }
 * Response 401: unauthenticated
 * Response 500: query error (returned structured per CLAUDE.md "never empty 500s")
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TabVisibility } from "@/lib/tab-visibility";
import { EMPTY_TAB_VISIBILITY } from "@/lib/tab-visibility";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    // Fetch host's property IDs once; each predicate then runs an
    // IN-list LIMIT 1 query. Zero properties → all conditional tabs false.
    const { data: propertyRows, error: propsErr } = await supabase
      .from("properties")
      .select("id")
      .eq("user_id", user.id);
    if (propsErr) {
      return NextResponse.json(
        { error: `properties lookup failed: ${propsErr.message}` },
        { status: 500 },
      );
    }
    const propertyIds = (propertyRows ?? []).map((r) => r.id as string);
    if (propertyIds.length === 0) {
      return NextResponse.json(EMPTY_TAB_VISIBILITY);
    }

    const hasAny = async (table: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .in("property_id", propertyIds)
        .limit(1);
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data?.length ?? 0) > 0;
    };

    const [calendar, reviews, turnovers, market_intel, comp_sets] = await Promise.all([
      hasAny("bookings"),
      hasAny("guest_reviews"),
      hasAny("cleaning_tasks"),
      hasAny("market_snapshots"),
      hasAny("market_comps"),
    ]);

    const visibility: TabVisibility = {
      calendar,
      reviews,
      turnovers,
      market_intel,
      comp_sets,
    };
    return NextResponse.json(visibility);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
