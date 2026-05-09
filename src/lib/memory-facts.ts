/**
 * F1 — server-side memory facts query helper (M8 Phase C).
 *
 * Canonical reader for the `memory_facts` table for the Memory tab
 * (`/koast/inspect/memory`). Future surfaces (memory editing, agent
 * loop reads of host facts) consume this helper. Single source of
 * truth for memory_facts shape transformations.
 *
 * D6 conventions: groups facts by entity_type at the top level
 * (Properties / Guests / About you / Vendors / Bookings). Within an
 * entity type, facts list per entity. Display labels humanized at the
 * helper boundary so consumers don't repeat the (sub_entity_type,
 * attribute) → "Wifi password" transform.
 *
 * D7 conventions: supersession_reason rendered honestly. M6-era rows
 * pre-D7 have NULL reasons — surface as "(reason not recorded)" rather
 * than fabricate. Active fact carries its supersession history pre-
 * walked so the inline expansion in MemorySupersessionInline.tsx
 * doesn't need a second helper call.
 *
 * D19 honest scope: only entity types with rows surface. Entity types
 * with zero rows for this host don't render stub-empty sections.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemorySupersessionReason } from "./db/schema";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type MemoryFactStatus = "active" | "superseded" | "deprecated";

/**
 * Pre-walked supersession history entry. Hangs off an active fact.
 * Each entry is the prior version (most-recent-first), as walked
 * backward through the `superseded_by` self-FK chain.
 */
export type MemorySupersessionEntry = {
  id: string;
  display_value: string;
  reason: MemorySupersessionReason | null;
  reason_label: string;
  superseded_at: string;
};

export type MemoryFact = {
  id: string;
  entity_type: string;
  entity_id: string;
  sub_entity_type: string | null;
  sub_entity_id: string | null;
  attribute: string;
  display_label: string;
  display_value: string;
  status: MemoryFactStatus;
  learned_at: string;
  /**
   * Prior versions of this fact, walked backward via `superseded_by`.
   * Empty array if no history. Most-recent-first; oldest version is
   * the last entry.
   */
  supersession_history: MemorySupersessionEntry[];
};

export type MemoryEntity = {
  entity_id: string;
  entity_name: string;
  facts: MemoryFact[];
};

export type MemoryEntityGroup = {
  entity_type: string;
  entity_type_label: string;
  entities: MemoryEntity[];
};

export type ListMemoryFactsResult = {
  groups: MemoryEntityGroup[];
  total_active: number;
  total_superseded: number;
};

// ----------------------------------------------------------------------
// Humanization (pure)
// ----------------------------------------------------------------------

const ENTITY_TYPE_LABELS: Record<string, string> = {
  property: "PROPERTIES",
  guest: "GUESTS",
  host: "ABOUT YOU",
  vendor: "VENDORS",
  booking: "BOOKINGS",
};

export function humanizeEntityTypeLabel(entityType: string): string {
  return (
    ENTITY_TYPE_LABELS[entityType] ?? entityType.toUpperCase().replace(/_/g, " ")
  );
}

const REASON_LABELS: Record<MemorySupersessionReason, string> = {
  outdated: "(was no longer true)",
  incorrect: "(was wrong)",
};

export function humanizeSupersessionReason(
  reason: MemorySupersessionReason | string | null | undefined,
): string {
  if (reason === "outdated" || reason === "incorrect") {
    return REASON_LABELS[reason];
  }
  return "(reason not recorded)";
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Humanize a (sub_entity_type, attribute) pair into a sentence-case
 * display label — e.g., ("wifi", "password") → "Wifi password",
 * ("front_door", "code") → "Front door code".
 */
export function humanizeFactLabel(
  subEntityType: string | null | undefined,
  attribute: string,
): string {
  if (!subEntityType) return titleCase(attribute);
  const sub = titleCase(subEntityType);
  const attr = attribute.replace(/_/g, " ").toLowerCase();
  return `${sub} ${attr}`;
}

/**
 * Render a memory_facts.value JSONB cell as a string for display. The
 * column is JSONB so values can be string, number, boolean, object, or
 * array. Strings render unquoted; everything else JSON-stringifies.
 */
export function humanizeFactValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ----------------------------------------------------------------------
// Supersession chain assembly (pure)
// ----------------------------------------------------------------------

/**
 * Raw memory_facts row shape (database snake_case). Helper-internal —
 * not exported. Matches columns selected by listMemoryFacts.
 */
type RawFactRow = {
  id: string;
  host_id: string;
  entity_type: string;
  entity_id: string;
  sub_entity_type: string | null;
  sub_entity_id: string | null;
  attribute: string;
  value: unknown;
  status: string;
  superseded_by: string | null;
  supersession_reason: string | null;
  learned_at: string;
};

/**
 * Walk the supersession chain for an active fact and return its prior
 * versions, most-recent-first. The active fact's id appears in some
 * other row's `superseded_by` column at most never (active means it
 * has no replacement); we walk *backward* by finding rows whose
 * `superseded_by` points to this row, then their predecessors.
 *
 * Pure — takes the full row set and returns a derivative.
 */
export function buildSupersessionHistory(
  activeFactId: string,
  allRows: RawFactRow[],
): MemorySupersessionEntry[] {
  // Index rows by their `superseded_by` value: maps replacement_id →
  // the row(s) it superseded. In practice each fact key has a linear
  // chain, but the index handles the general case cleanly.
  const bySupersededBy = new Map<string, RawFactRow[]>();
  for (const row of allRows) {
    if (!row.superseded_by) continue;
    const list = bySupersededBy.get(row.superseded_by);
    if (list) {
      list.push(row);
    } else {
      bySupersededBy.set(row.superseded_by, [row]);
    }
  }

  const history: MemorySupersessionEntry[] = [];
  let cursor = activeFactId;
  // Defensive bound: depth-cap walks at 100 to avoid pathological
  // cycles in malformed data.
  for (let depth = 0; depth < 100; depth++) {
    const predecessors = bySupersededBy.get(cursor) ?? [];
    if (predecessors.length === 0) break;
    // If multiple rows claim to be superseded by the same active fact
    // (data anomaly), walk the most recent one and surface the others
    // as same-level history entries.
    predecessors.sort((a, b) => b.learned_at.localeCompare(a.learned_at));
    const next = predecessors[0];
    const reason = (next.supersession_reason ?? null) as
      | MemorySupersessionReason
      | null;
    history.push({
      id: next.id,
      display_value: humanizeFactValue(next.value),
      reason,
      reason_label: humanizeSupersessionReason(reason),
      superseded_at: next.learned_at,
    });
    cursor = next.id;
  }
  return history;
}

// ----------------------------------------------------------------------
// Helper
// ----------------------------------------------------------------------

/**
 * List memory facts for a host, grouped per D6 (entity_type → entity →
 * facts). Caller passes the verified hostId; helper trusts input.
 *
 * Single host-scoped query against memory_facts; entity name resolution
 * via a follow-up batched lookup against `properties` (only entity
 * type with rows in production today). Other entity types render
 * entity_id as fallback name.
 */
export async function listMemoryFacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  hostId: string,
): Promise<ListMemoryFactsResult> {
  if (!hostId) {
    throw new Error("listMemoryFacts: hostId is required");
  }

  const { data, error } = await supabase
    .from("memory_facts")
    .select(
      "id, host_id, entity_type, entity_id, sub_entity_type, sub_entity_id, attribute, value, status, superseded_by, supersession_reason, learned_at",
    )
    .eq("host_id", hostId)
    .order("learned_at", { ascending: false });

  if (error) {
    throw new Error(`Memory facts query failed: ${error.message}`);
  }

  const rows = (data ?? []) as RawFactRow[];

  // Resolve property names (only entity_type with rows in production).
  const propertyIds = Array.from(
    new Set(
      rows
        .filter((r) => r.entity_type === "property")
        .map((r) => r.entity_id),
    ),
  );
  const propertyNames = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, name")
      .in("id", propertyIds);
    for (const p of (props ?? []) as Array<{ id: string; name: string | null }>) {
      if (p.name) propertyNames.set(p.id, p.name);
    }
  }

  let totalActive = 0;
  let totalSuperseded = 0;

  // Build per-entity-type → per-entity map of active facts. Superseded
  // rows are not surfaced as their own facts; they hang off the active
  // fact's supersession_history (D7 inline expansion).
  const groupMap = new Map<string, Map<string, MemoryEntity>>();

  for (const row of rows) {
    if (row.status === "superseded") {
      totalSuperseded++;
      continue;
    }
    if (row.status === "active") totalActive++;
    // Only render active + deprecated facts as top-level rows. Deprecated
    // are extremely rare today; treat as active for rendering purposes
    // (they still represent something Koast knows, just flagged for
    // future cleanup).
    const fact: MemoryFact = {
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      sub_entity_type: row.sub_entity_type,
      sub_entity_id: row.sub_entity_id,
      attribute: row.attribute,
      display_label: humanizeFactLabel(row.sub_entity_type, row.attribute),
      display_value: humanizeFactValue(row.value),
      status: row.status as MemoryFactStatus,
      learned_at: row.learned_at,
      supersession_history: buildSupersessionHistory(row.id, rows),
    };

    let entityMap = groupMap.get(row.entity_type);
    if (!entityMap) {
      entityMap = new Map();
      groupMap.set(row.entity_type, entityMap);
    }
    let entity = entityMap.get(row.entity_id);
    if (!entity) {
      entity = {
        entity_id: row.entity_id,
        entity_name:
          row.entity_type === "property"
            ? propertyNames.get(row.entity_id) ?? row.entity_id
            : row.entity_id,
        facts: [],
      };
      entityMap.set(row.entity_id, entity);
    }
    entity.facts.push(fact);
  }

  // Stable order: properties first, then alphabetic by entity_type.
  const ENTITY_ORDER = ["property", "host", "guest", "vendor", "booking"];
  const groups: MemoryEntityGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => {
      const ai = ENTITY_ORDER.indexOf(a);
      const bi = ENTITY_ORDER.indexOf(b);
      const ax = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
      const bx = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
      if (ax !== bx) return ax - bx;
      return a.localeCompare(b);
    })
    .map(([entityType, entityMap]) => ({
      entity_type: entityType,
      entity_type_label: humanizeEntityTypeLabel(entityType),
      entities: Array.from(entityMap.values()).sort((a, b) =>
        a.entity_name.localeCompare(b.entity_name),
      ),
    }));

  return { groups, total_active: totalActive, total_superseded: totalSuperseded };
}
