/**
 * Memory export lib — M11 Phase D item 1 (M4; M8 C13 R-5 disposition).
 *
 * Returns the host's accumulated memory in a structured JSON shape
 * suitable for human-readable download. Honors the M8 C13 binding
 * copy at koast/guide/memory/page.tsx:55-62 — "This memory is your
 * asset, not Koast's ... structured download of everything Koast has
 * accumulated".
 *
 * Caller contract (mirrors memory/read.ts:1-25): the caller is
 * responsible for authenticating the host and passing the host id
 * EXPLICITLY. This handler trusts its `hostId` argument; defense-in-
 * depth comes from the `.eq("host_id", hostId)` filter and the table's
 * RLS policy (which we bypass via service-role for lib reusability
 * across route + worker + tool contexts).
 *
 * THE HARD-FLOOR INVARIANT (M11 Phase D operator sign-off msg 3436):
 * cross-host data isolation. The lib alone is only as safe as its
 * caller's wiring — the ROUTE must derive hostId exclusively from the
 * authenticated session (never from query/body/path). The lib doesn't
 * and can't enforce that; the adversarial regression-guard test at
 * the route boundary does.
 *
 * Returns: structured JSON with metadata + memory_facts grouped by
 * entity_type → sub_entity_type. Includes all statuses (active +
 * superseded + deprecated) with the status field intact for receiver-
 * side filtering — lineage transparency per the values commitment.
 */

import { createServiceClient } from "@/lib/supabase/service";

export interface MemoryExportFact {
  id: string;
  host_id: string;
  entity_type: string;
  entity_id: string;
  sub_entity_type: string | null;
  sub_entity_id: string | null;
  guest_id: string | null;
  attribute: string;
  value: unknown;
  source: string;
  confidence: number | string;
  learned_from: unknown;
  status: string;
  superseded_by: string | null;
  learned_at: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  supersession_reason: string | null;
}

export interface MemoryExportPayload {
  exported_at: string;
  host_id: string;
  koast_version: string;
  fact_count: number;
  memory_facts: {
    /** Grouped by entity_type → sub_entity_type → fact[]. Sub-entity
     *  key `_unspecified` holds rows where sub_entity_type IS NULL
     *  (pre-CHECK-tightening host-level facts; pattern-match index). */
    [entity_type: string]: {
      [sub_entity_type_or_unspecified: string]: MemoryExportFact[];
    };
  };
}

const KOAST_VERSION = "M11-Phase-D";

/**
 * Build the memory export payload for `hostId`. Service-role supabase
 * client; `.eq("host_id", hostId)` filter on the memory_facts query.
 * Returns empty groups + metadata when host has no facts (valid
 * receipt for "I have no memory accumulated yet").
 *
 * The .eq("host_id", hostId) filter is the load-bearing host-scoping
 * boundary at the data layer. Combined with the RLS policy + the
 * route's auth-derived hostId, this is the 4-deep defense against
 * cross-host data leak.
 */
export async function exportMemoryForHost(
  hostId: string,
): Promise<MemoryExportPayload> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("memory_facts") as any)
    .select(
      "id, host_id, entity_type, entity_id, sub_entity_type, sub_entity_id, guest_id, attribute, value, source, confidence, learned_from, status, superseded_by, learned_at, last_used_at, created_at, updated_at, supersession_reason",
    )
    .eq("host_id", hostId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `[memory/export] memory_facts query failed: ${error.message}`,
    );
  }

  const rows = (data ?? []) as MemoryExportFact[];

  // Group by entity_type → sub_entity_type. Null sub_entity_type maps
  // to `_unspecified` for predictable receiver-side key access.
  const grouped: MemoryExportPayload["memory_facts"] = {};
  for (const row of rows) {
    const eType = row.entity_type;
    const sType = row.sub_entity_type ?? "_unspecified";
    if (!grouped[eType]) grouped[eType] = {};
    if (!grouped[eType][sType]) grouped[eType][sType] = [];
    grouped[eType][sType].push(row);
  }

  return {
    exported_at: new Date().toISOString(),
    host_id: hostId,
    koast_version: KOAST_VERSION,
    fact_count: rows.length,
    memory_facts: grouped,
  };
}
