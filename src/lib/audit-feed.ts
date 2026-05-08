/**
 * F9 — server-side audit feed query helper (M8 Phase C).
 *
 * Canonical reader for the `unified_audit_feed` Postgres VIEW (Phase A
 * migration `20260507040000`). Consumed by:
 *   - C5 Activity tab (`/koast/inspect/activity`) — paginated + filtered
 *   - F1 Memory tab (`/koast/inspect/memory`) — memory_write filtered
 *   - `/api/audit-feed/since` — between-turns polling channel (M8 D2)
 *
 * Path β + γ.1 fix from Phase C HARD GATE means all four sources now
 * surface (channex rows recovered). This helper enforces host-scoping
 * (caller passes hostId; helper trusts it — auth happens at the route
 * boundary), cursor-based pagination (stable across feed churn), and
 * D17b chip-name → category fold.
 *
 * Index considerations: VIEW is non-materialized; sort happens
 * post-UNION-ALL in the planner. Underlying source tables already have
 * appropriate `(host_id, <ts>)` indexes (Phase A 030000 added the
 * sms_log composite). At current volumes no new indexes needed; defer
 * EXPLAIN-driven index decisions to production observation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ----------------------------------------------------------------------
// Types — canonical for M8 audit-feed consumers
// ----------------------------------------------------------------------

export type AuditEventActor = "koast" | "host" | "system";

export type AuditEventCategory =
  | "memory_write"
  | "guest_message"
  | "rate_push"
  | "sms"
  | "pricing_outcome"
  | "other";

export type AuditEventOutcome =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled"
  | null;

export type AuditEvent = {
  occurred_at: string;
  actor: AuditEventActor;
  category: AuditEventCategory;
  entity_type: string | null;
  entity_id: string | null;
  outcome: AuditEventOutcome;
  summary: string;
  source_table: string;
  source_id: string;
  metadata: Record<string, unknown> | null;
};

/**
 * D17b chip-name vocabulary. Maps to the granular VIEW categories at
 * the FILTER_TO_CATEGORIES table below. Conventions v1.2 freezes the
 * five chips: All / Memory / Messages / Pricing / SMS. The "SMS" chip
 * is honest about M8 content (notifications source excluded; rejoins
 * in M9 with host_id schema migration, at which point the chip
 * renames to "Notifications" and surfaces sms + notification rows).
 */
export type AuditFeedFilter =
  | "all"
  | "memory"
  | "messages"
  | "pricing"
  | "sms";

const FILTER_TO_CATEGORIES: Record<AuditFeedFilter, AuditEventCategory[] | null> =
  {
    all: null,
    memory: ["memory_write"],
    messages: ["guest_message"],
    pricing: ["rate_push", "pricing_outcome"],
    sms: ["sms"],
  };

export type AuditFeedCursor = {
  occurred_at: string;
  source_id: string;
};

export type ListAuditFeedOptions = {
  filter?: AuditFeedFilter;
  cursor?: string;
  limit?: number;
  /**
   * Optional ISO8601 timestamp; returns events strictly newer than this.
   * Used by `/api/audit-feed/since` polling channel. Mutually exclusive
   * with `cursor` — if both are provided, cursor wins (cursor is for
   * descend-deeper-into-history, since is for catch-up-since-last-poll;
   * mixing them would scope a query to "older than cursor AND newer
   * than since" which is not a useful shape today).
   */
  since?: string;
};

export type ListAuditFeedResult = {
  events: AuditEvent[];
  next_cursor: string | null;
};

// ----------------------------------------------------------------------
// Cursor utilities (pure)
// ----------------------------------------------------------------------

/**
 * Encode a cursor as opaque base64 JSON. Clients receive this as a
 * string and pass it back unchanged on the next request — they never
 * inspect the contents, so the helper is free to evolve the cursor
 * shape in future revisions without breaking existing consumers.
 */
export function encodeCursor(cursor: AuditFeedCursor): string {
  const json = JSON.stringify(cursor);
  // Browser-safe + Node-safe: prefer Buffer when available (Node), else
  // fall back to btoa (Edge runtime). Both produce identical base64.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeCursor(encoded: string): AuditFeedCursor {
  let json: string;
  if (typeof Buffer !== "undefined") {
    json = Buffer.from(encoded, "base64").toString("utf-8");
  } else {
    json = decodeURIComponent(escape(atob(encoded)));
  }
  const parsed = JSON.parse(json) as Partial<AuditFeedCursor>;
  if (
    typeof parsed.occurred_at !== "string" ||
    typeof parsed.source_id !== "string"
  ) {
    throw new Error("Invalid cursor: missing occurred_at or source_id");
  }
  return { occurred_at: parsed.occurred_at, source_id: parsed.source_id };
}

// ----------------------------------------------------------------------
// Filter mapping (pure)
// ----------------------------------------------------------------------

/**
 * Map a chip-name filter to the underlying category list. Returns null
 * for the 'all' chip (no filter applied). Exported for unit testing
 * the D17b fold in isolation.
 */
export function categoriesForFilter(
  filter: AuditFeedFilter,
): AuditEventCategory[] | null {
  return FILTER_TO_CATEGORIES[filter];
}

// ----------------------------------------------------------------------
// Helper
// ----------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * List audit events for a host. The caller is responsible for
 * authenticating the session and passing the verified host UUID;
 * F9 trusts the input.
 */
export async function listAuditFeedEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  hostId: string,
  options: ListAuditFeedOptions = {},
): Promise<ListAuditFeedResult> {
  if (!hostId) {
    throw new Error("listAuditFeedEvents: hostId is required");
  }

  const filter = options.filter ?? "all";
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  let query = supabase
    .from("unified_audit_feed")
    .select(
      "occurred_at, actor, category, entity_type, entity_id, outcome, summary, source_table, source_id, metadata",
    )
    .eq("host_id", hostId)
    .order("occurred_at", { ascending: false })
    .order("source_id", { ascending: false })
    .limit(limit + 1);

  const categories = categoriesForFilter(filter);
  if (categories !== null) {
    query = query.in("category", categories);
  }

  // Pagination: cursor (descend deeper) vs since (catch-up). Cursor
  // wins if both provided (see ListAuditFeedOptions JSDoc).
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    // Row-comparison semantics: (occurred_at, source_id) <
    // (cursor.occurred_at, cursor.source_id). PostgREST doesn't expose
    // tuple < directly; emulate with the standard split:
    //   occurred_at < cursor.occurred_at
    //   OR (occurred_at = cursor.occurred_at AND source_id < cursor.source_id)
    query = query.or(
      `occurred_at.lt.${cursor.occurred_at},and(occurred_at.eq.${cursor.occurred_at},source_id.lt.${cursor.source_id})`,
    );
  } else if (options.since) {
    query = query.gt("occurred_at", options.since);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Audit feed query failed: ${error.message}`);
  }

  const rows = (data ?? []) as AuditEvent[];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && events.length > 0
      ? encodeCursor({
          occurred_at: events[events.length - 1].occurred_at,
          source_id: events[events.length - 1].source_id,
        })
      : null;

  return { events, next_cursor: nextCursor };
}
