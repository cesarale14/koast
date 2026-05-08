/**
 * GET /api/audit-feed/since — between-turns polling endpoint (M8 C8 Step F).
 *
 * Queries the unified_audit_feed VIEW (Phase A migration 20260507040000)
 * for events newer than the client-provided timestamp, scoped to the
 * authenticated host. Used by ChatBar's useAuditPoll hook to surface
 * a "Koast did something silently" indicator while the chat panel is in
 * resting state.
 *
 * Per conventions v1.4 D2: per-turn streaming preserved as-is; this is
 * the between-turns lightweight polling channel. Persistent SSE deferred
 * to M9 or later.
 *
 * Auth: createClient + supabase.auth.getUser() per existing API pattern.
 * host_id is derived from the authenticated session — never from query
 * params (security; would otherwise let a logged-in host poll anyone's
 * audit feed by URL manipulation).
 *
 * Contract:
 *   GET /api/audit-feed/since?ts=<ISO8601>&limit=<n>
 *
 * Response 200:
 *   {
 *     events: Array<{ occurred_at, category, summary, source_table, source_id }>,
 *     newest_ts: string | null,
 *     has_more: boolean
 *   }
 *
 * Edge cases:
 * - missing or invalid ts → 400
 * - unauthenticated → 401
 * - no events since ts → 200 with empty events array
 * - more than limit rows → events truncated to limit, has_more=true
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tsParam = searchParams.get("ts");
  const limitParam = searchParams.get("limit");

  if (!tsParam) {
    return NextResponse.json(
      { error: "Missing required query param: ts (ISO8601 timestamp)" },
      { status: 400 },
    );
  }

  // Validate ts: parseable ISO8601 string
  const tsDate = new Date(tsParam);
  if (Number.isNaN(tsDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid ts: must be ISO8601 timestamp" },
      { status: 400 },
    );
  }

  // Parse and clamp limit
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const n = parseInt(limitParam, 10);
    if (Number.isFinite(n) && n > 0) {
      limit = Math.min(n, MAX_LIMIT);
    }
  }

  // Query unified_audit_feed VIEW with host_id from session.
  // Fetch limit+1 to detect has_more without an extra COUNT query.
  const { data, error } = await supabase
    .from("unified_audit_feed")
    .select("occurred_at, category, summary, source_table, source_id")
    .eq("host_id", user.id)
    .gt("occurred_at", tsDate.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(limit + 1);

  if (error) {
    return NextResponse.json(
      { error: "Audit feed query failed", detail: error.message },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const newestTs = events.length > 0 ? events[0].occurred_at : null;

  return NextResponse.json({
    events,
    newest_ts: newestTs,
    has_more: hasMore,
  });
}
