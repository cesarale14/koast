/**
 * GET /api/audit-feed/since — between-turns polling endpoint (M8 C8 Step F).
 *
 * Catch-up channel: returns events newer than the client-provided
 * timestamp, scoped to the authenticated host. Used by ChatBar's
 * useAuditPoll hook to surface a "Koast did something silently"
 * indicator while the chat panel is in resting state.
 *
 * Per conventions v1.4 D2: per-turn streaming preserved as-is; this is
 * the between-turns lightweight polling channel. Persistent SSE deferred.
 *
 * Phase C F9 refactor: query construction delegated to
 * `listAuditFeedEvents` (src/lib/audit-feed.ts). Endpoint contract
 * preserved (`{events, newest_ts, has_more}`); response shape adapted
 * from F9's cursor-based result. Single source of truth for VIEW reads
 * across `/since` (this endpoint), C5 Activity tab, F1 Memory tab.
 *
 * Auth: createClient + supabase.auth.getUser(). host_id derived from
 * the authenticated session — never from query params.
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
import { listAuditFeedEvents } from "@/lib/audit-feed";

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

  const tsDate = new Date(tsParam);
  if (Number.isNaN(tsDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid ts: must be ISO8601 timestamp" },
      { status: 400 },
    );
  }

  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const n = parseInt(limitParam, 10);
    if (Number.isFinite(n) && n > 0) {
      limit = Math.min(n, MAX_LIMIT);
    }
  }

  try {
    const { events, next_cursor } = await listAuditFeedEvents(
      supabase,
      user.id,
      {
        since: tsDate.toISOString(),
        limit,
      },
    );

    // Adapt F9's cursor-based response to the legacy /since contract
    // (ChatBar polling consumer doesn't need cursor — it polls forward
    // from last-seen timestamp). has_more derives from next_cursor;
    // newest_ts is the most recent event in this batch (events are
    // ordered newest-first by F9).
    const hasMore = next_cursor !== null;
    const newestTs = events.length > 0 ? events[0].occurred_at : null;

    // Project to the leaner /since envelope (keeps backwards-compat
    // for the existing ChatBar consumer).
    const projected = events.map((e) => ({
      occurred_at: e.occurred_at,
      category: e.category,
      summary: e.summary,
      source_table: e.source_table,
      source_id: e.source_id,
    }));

    return NextResponse.json({
      events: projected,
      newest_ts: newestTs,
      has_more: hasMore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "query failed";
    return NextResponse.json(
      { error: "Audit feed query failed", detail: message },
      { status: 500 },
    );
  }
}
