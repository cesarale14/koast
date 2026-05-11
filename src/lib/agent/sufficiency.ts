/**
 * Sufficiency classifier (M8 C3 / D11 minimal scope).
 *
 * Pure rollup over the required-capability registry: how complete is
 * the host's onboarding from the perspective of v1-essential
 * capabilities (draft check-in messages + watch rates)?
 *
 * Output:
 *   'rich' — at least one property has all four required-capability
 *            fields present. Host can use propose_guest_message without
 *            hitting the structured-fallback path.
 *   'lean' — at least one property has 1-3 required-capability fields
 *            present. Onboarding partially underway.
 *   'thin' — no property has any required-capability field present.
 *            Cold-start state.
 *
 * D11 distinguishes this from P3 (M9-deferred) — P3 ships per-tool
 * sufficiency thresholds for guidance during proposal generation;
 * D11 minimal is the binary "do we have enough to draft check-in
 * messages and watch rates" rollup.
 *
 * Read-only over properties + memory_facts. No host-facing surface;
 * consumed by the loop's system-prompt context injection and the
 * ChatClient idle-detection logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCapabilities } from "./required-capabilities";

export type SufficiencyLevel = "rich" | "lean" | "thin";

export interface PerPropertySufficiency {
  property_id: string;
  property_name: string | null;
  missing_count: number;
}

export interface SufficiencyClassification {
  level: SufficiencyLevel;
  per_property: PerPropertySufficiency[];
  /** Total required-capability fields across all of the host's
   *  properties; used by the prompt-injection context block for
   *  honest scope language. */
  rollup: { properties: number; rich_properties: number };
}

interface PropertyRow {
  id: string;
  name: string | null;
  city: string | null;
  property_type: string | null;
}

interface MemoryFactRow {
  property_id: string;
  sub_entity_type: string | null;
  attribute: string;
  value: unknown;
}

export async function classifySufficiency(
  supabase: SupabaseClient,
  hostId: string,
): Promise<SufficiencyClassification> {
  const { data: propRows, error: propErr } = await supabase
    .from("properties")
    .select("id, name, city, property_type")
    .eq("user_id", hostId)
    .returns<PropertyRow[]>();
  if (propErr) {
    throw new Error(`properties lookup failed: ${propErr.message}`);
  }
  const properties = propRows ?? [];
  if (properties.length === 0) {
    return {
      level: "thin",
      per_property: [],
      rollup: { properties: 0, rich_properties: 0 },
    };
  }
  const propIds = properties.map((p) => p.id);
  const { data: factRows, error: factErr } = await supabase
    .from("memory_facts")
    .select("entity_id, sub_entity_type, attribute, value")
    .eq("entity_type", "property")
    .eq("status", "active")
    .in("entity_id", propIds)
    .in("sub_entity_type", ["front_door", "lock", "wifi", "parking"])
    .returns<Array<{ entity_id: string; sub_entity_type: string | null; attribute: string; value: unknown }>>();
  if (factErr) {
    throw new Error(`memory_facts lookup failed: ${factErr.message}`);
  }
  const factsByProperty = new Map<string, MemoryFactRow[]>();
  for (const f of factRows ?? []) {
    const list = factsByProperty.get(f.entity_id) ?? [];
    list.push({ ...f, property_id: f.entity_id });
    factsByProperty.set(f.entity_id, list);
  }

  const per_property: PerPropertySufficiency[] = [];
  let richProperties = 0;
  let anyPartial = false;
  for (const p of properties) {
    const facts = factsByProperty.get(p.id) ?? [];
    const result = evaluateCapabilities(p, facts);
    per_property.push({
      property_id: p.id,
      property_name: p.name,
      missing_count: result.missing.length,
    });
    // 4 capability categories total (property_structural / front_door /
    // wifi / parking). 0 missing = rich; 1-3 missing = lean (at least
    // one category present, not all); 4 missing = thin (cold-start).
    if (result.missing.length === 0) richProperties += 1;
    if (result.missing.length > 0 && result.missing.length < 4) anyPartial = true;
  }

  let level: SufficiencyLevel;
  if (richProperties > 0) level = "rich";
  else if (anyPartial) level = "lean";
  else level = "thin";

  return {
    level,
    per_property,
    rollup: { properties: properties.length, rich_properties: richProperties },
  };
}
