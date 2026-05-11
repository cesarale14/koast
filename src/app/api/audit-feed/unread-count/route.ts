/**
 * GET /api/audit-feed/unread-count — M8 Phase G C4 (D16 + D17d).
 *
 * Returns the count of unified_audit_feed events occurring after the
 * host's host_state.last_seen_inspect_at. Used by ChatClient to drive
 * the topbar audit icon notification badge.
 *
 * Auth: createClient + getUser. host_id derived from the authenticated
 * session — never from query params.
 *
 * Response 200:
 *   { count: number, display: string }
 *
 *   count   — exact integer (capped at 100 server-side to bound the
 *             query), 0 when host has caught up
 *   display — UI-shape: "1"–"9", or "9+" for overflow, or null when 0.
 *             Frontend uses this verbatim per C4 R-7 badge framing.
 *
 * NULL last_seen_inspect_at semantics (per C4 R-11): treated as "all
 * events unread", count capped at 100 server-side, display capped at
 * "9+" client-side. First-open will surface the cap, not the real
 * historical count — honest UX framing.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COUNT_HARD_CAP = 100;

function formatDisplay(count: number): string | null {
  if (count <= 0) return null;
  if (count >= 10) return "9+";
  return String(count);
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { data: stateRow, error: stateErr } = await supabase
      .from("host_state")
      .select("last_seen_inspect_at")
      .eq("host_id", user.id)
      .maybeSingle();
    if (stateErr) {
      return NextResponse.json(
        { error: `host_state lookup failed: ${stateErr.message}` },
        { status: 500 },
      );
    }

    let query = supabase
      .from("unified_audit_feed")
      .select("source_id", { count: "exact", head: true })
      .eq("host_id", user.id);
    if (stateRow?.last_seen_inspect_at) {
      query = query.gt("occurred_at", stateRow.last_seen_inspect_at);
    }
    query = query.limit(COUNT_HARD_CAP);

    const { count, error: countErr } = await query;
    if (countErr) {
      return NextResponse.json(
        { error: `audit feed count failed: ${countErr.message}` },
        { status: 500 },
      );
    }

    const cappedCount = Math.min(count ?? 0, COUNT_HARD_CAP);
    return NextResponse.json({
      count: cappedCount,
      display: formatDisplay(cappedCount),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
