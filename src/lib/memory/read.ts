/**
 * Memory retrieval handler. Reads facts from `memory_facts` scoped by
 * entity (with optional sub_entity narrowing and guest narrowing) and
 * returns them with a `data_sufficiency` block — the per-call signal
 * the agent loop uses to reason about how much it knows.
 *
 * Caller contract: the caller is responsible for authenticating the
 * host and passing the host id explicitly. This handler trusts its
 * `host` argument; defense-in-depth comes from the
 * `host_id = $1` filter on every query and the table's RLS policy
 * (which we bypass via service-role for handler reusability across
 * route/worker/tool contexts).
 *
 * On every read, the handler updates `last_used_at = now()` for the
 * facts it returned. This is the memory access tracking that
 * BELIEF_3_MEMORY_INVENTORY commits to: which facts are alive vs
 * accumulating dust.
 *
 * Sufficiency thresholds (v1):
 *   - empty:  fact_count === 0
 *   - sparse: fact_count 1-2
 *   - rich:   fact_count >= 3
 *   - has_recent_learning: any fact with learned_at within 7 days
 *   - confidence_aggregate: avg(confidence) over returned facts; null
 *                           when no facts.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type {
  MemoryFactEntityType,
  MemoryFactSource,
  MemoryFactStatus,
  MemoryFactSubEntityType,
} from "@/lib/db/schema";

export interface MemoryReadScope {
  entity_type: MemoryFactEntityType;
  entity_id: string;
  sub_entity_type?: MemoryFactSubEntityType;
  sub_entity_id?: string;
  guest_id?: string;
}

export interface MemoryReadQuery {
  attribute?: string;
  freshness_threshold_days?: number;
  /** Default: false — only active facts returned. */
  include_superseded?: boolean;
}

export interface MemoryFact {
  id: string;
  attribute: string;
  value: unknown;
  source: MemoryFactSource;
  confidence: number;
  learned_from: Record<string, unknown>;
  learned_at: string;
  last_used_at: string | null;
  status: MemoryFactStatus;
}

export type SufficiencySignal = "rich" | "sparse" | "empty";

export interface DataSufficiency {
  fact_count: number;
  confidence_aggregate: number | null;
  has_recent_learning: boolean;
  sufficiency_signal: SufficiencySignal;
  note: string;
}

export interface MemoryReadResult {
  facts: MemoryFact[];
  data_sufficiency: DataSufficiency;
}

export interface ReadMemoryInput {
  host: { id: string };
  scope: MemoryReadScope;
  query: MemoryReadQuery;
}

const RECENT_LEARNING_WINDOW_DAYS = 7;
const RICH_THRESHOLD = 3;

interface MemoryFactRow {
  id: string;
  attribute: string;
  value: unknown;
  source: MemoryFactSource;
  confidence: string | number;
  learned_from: Record<string, unknown> | null;
  learned_at: string;
  last_used_at: string | null;
  status: MemoryFactStatus;
}

function toFact(row: MemoryFactRow): MemoryFact {
  return {
    id: row.id,
    attribute: row.attribute,
    value: row.value,
    source: row.source,
    confidence: typeof row.confidence === "string"
      ? parseFloat(row.confidence)
      : row.confidence,
    learned_from: row.learned_from ?? {},
    learned_at: row.learned_at,
    last_used_at: row.last_used_at,
    status: row.status,
  };
}

function computeSufficiency(facts: MemoryFact[], scope: MemoryReadScope): DataSufficiency {
  const factCount = facts.length;

  let signal: SufficiencySignal;
  if (factCount === 0) signal = "empty";
  else if (factCount < RICH_THRESHOLD) signal = "sparse";
  else signal = "rich";

  const confidenceAggregate = factCount === 0
    ? null
    : facts.reduce((sum, f) => sum + f.confidence, 0) / factCount;

  const cutoffMs = Date.now() - RECENT_LEARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const hasRecentLearning = facts.some((f) => {
    const learnedAtMs = new Date(f.learned_at).getTime();
    return learnedAtMs >= cutoffMs;
  });

  const scopeLabel = scope.sub_entity_type
    ? `this ${scope.sub_entity_type}`
    : `this ${scope.entity_type}`;

  let note: string;
  if (factCount === 0) {
    note = `No facts yet about ${scopeLabel} — this would be new learning.`;
  } else {
    const recentDescription = hasRecentLearning
      ? "; most recent learned within the last week"
      : "";
    note = `Found ${factCount} ${factCount === 1 ? "fact" : "facts"} about ${scopeLabel}${recentDescription}.`;
  }

  return {
    fact_count: factCount,
    confidence_aggregate: confidenceAggregate,
    has_recent_learning: hasRecentLearning,
    sufficiency_signal: signal,
    note,
  };
}

export async function readMemory(input: ReadMemoryInput): Promise<MemoryReadResult> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase.from("memory_facts") as any)
    .select(
      "id, attribute, value, source, confidence, learned_from, learned_at, last_used_at, status",
    )
    .eq("host_id", input.host.id)
    .eq("entity_type", input.scope.entity_type)
    .eq("entity_id", input.scope.entity_id);

  if (input.scope.sub_entity_type !== undefined) {
    query = query.eq("sub_entity_type", input.scope.sub_entity_type);
  }
  if (input.scope.sub_entity_id !== undefined) {
    query = query.eq("sub_entity_id", input.scope.sub_entity_id);
  }
  if (input.scope.guest_id !== undefined) {
    query = query.eq("guest_id", input.scope.guest_id);
  }
  if (input.query.attribute !== undefined) {
    query = query.eq("attribute", input.query.attribute);
  }

  if (input.query.include_superseded) {
    query = query.in("status", ["active", "superseded"]);
  } else {
    query = query.eq("status", "active");
  }

  if (input.query.freshness_threshold_days !== undefined) {
    const cutoffIso = new Date(
      Date.now() - input.query.freshness_threshold_days * 24 * 60 * 60 * 1000,
    ).toISOString();
    query = query.gte("learned_at", cutoffIso);
  }

  query = query.order("learned_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw new Error(`[memory.read] Query failed: ${error.message}`);
  }

  const rows = (data ?? []) as MemoryFactRow[];
  const facts = rows.map(toFact);

  // Update last_used_at on returned active facts. Per BELIEF_3:
  // memory access tracking — which facts are alive vs accumulating
  // dust. Skip for include_superseded reads since superseded facts
  // shouldn't be marked as in-use.
  if (facts.length > 0) {
    const activeIds = facts.filter((f) => f.status === "active").map((f) => f.id);
    if (activeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("memory_facts") as any)
        .update({ last_used_at: new Date().toISOString() })
        .in("id", activeIds);
    }
  }

  return {
    facts,
    data_sufficiency: computeSufficiency(facts, input.scope),
  };
}
