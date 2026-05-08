/**
 * GET /api/audit-feed/list — rich-shape audit feed reader (M8 C5).
 *
 * Distinct from `/api/audit-feed/since`: this endpoint serves the
 * Activity tab's paginated browsing (cursor-based, full envelope), while
 * /since is the lean polling channel used by ChatBar's useAuditPoll.
 * Both wrap the same F9 helper — single source of truth for the VIEW.
 *
 * Auth: createClient + supabase.auth.getUser(). host_id derived from
 * the authenticated session — never from query params.
 *
 * Contract:
 *   GET /api/audit-feed/list?filter=<chip>&cursor=<base64>&limit=<n>
 *
 *   filter — one of: all | memory | messages | pricing | sms (default 'all')
 *   cursor — opaque base64 from a previous response's next_cursor (optional)
 *   limit  — 1..100 (default 50)
 *
 * Response 200:
 *   { events: AuditEvent[], next_cursor: string | null }
 *
 * Response 400: invalid filter or cursor
 * Response 401: unauthenticated
 * Response 500: F9 threw
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listAuditFeedEvents,
  type AuditFeedFilter,
} from "@/lib/audit-feed";

const VALID_FILTERS: ReadonlySet<AuditFeedFilter> = new Set([
  "all",
  "memory",
  "messages",
  "pricing",
  "sms",
]);

const DEFAULT_LIMIT = 50;
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
  const filterParam = (searchParams.get("filter") ?? "all").toLowerCase();
  const cursorParam = searchParams.get("cursor") ?? undefined;
  const limitParam = searchParams.get("limit");

  if (!VALID_FILTERS.has(filterParam as AuditFeedFilter)) {
    return NextResponse.json(
      { error: `Invalid filter. Allowed: ${[...VALID_FILTERS].join(", ")}` },
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
    const result = await listAuditFeedEvents(supabase, user.id, {
      filter: filterParam as AuditFeedFilter,
      cursor: cursorParam,
      limit,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "query failed";
    // Surface 400 for cursor-decode errors; 500 for everything else.
    const status = message.startsWith("Invalid cursor") ? 400 : 500;
    return NextResponse.json(
      { error: "Audit feed query failed", detail: message },
      { status },
    );
  }
}
