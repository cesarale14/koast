/**
 * read_memory — the agent loop's first registered tool.
 *
 * Wraps the M2 readMemory() handler. The Zod schemas here are the
 * model-facing contract; they're stricter than the M2 handler's
 * TypeScript signature on purpose — the model's input has to match
 * the migration's controlled vocabulary (sub_entity_type) and v1's
 * entity_type='property' restriction.
 *
 * The output schema mirrors M2's `MemoryReadResult` shape exactly;
 * the dispatcher's outputSchema validation is essentially a contract
 * check that M2's read.ts hasn't drifted.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { readMemory } from "@/lib/memory/read";

// ---------- Input schema ----------

// v1 supports entity_type='property' only. Future milestones widen
// this to 'guest', 'host', 'vendor', 'booking' as the agent's scope
// expands.
const ENTITY_TYPES = ["property"] as const;

// Controlled vocabulary from MemoryFactSubEntityType (mirrors the
// migration's CHECK constraint). Worth keeping in sync if the
// migration adds entries.
const SUB_ENTITY_TYPES = [
  "front_door",
  "lock",
  "parking",
  "wifi",
  "hvac",
  "kitchen_appliances",
] as const;

const ReadMemoryInputSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  sub_entity_type: z.enum(SUB_ENTITY_TYPES).optional(),
  sub_entity_id: z.string().optional(),
  attribute: z.string().optional(),
  freshness_threshold_days: z.number().int().positive().optional(),
});

// ---------- Output schema (mirrors M2's MemoryReadResult) ----------

const FactSchema = z.object({
  id: z.string(),
  attribute: z.string(),
  value: z.unknown(),
  source: z.enum(["host_taught", "inferred", "observed"]),
  confidence: z.number().min(0).max(1),
  learned_from: z.record(z.string(), z.unknown()),
  learned_at: z.string(),
  last_used_at: z.string().nullable(),
  status: z.enum(["active", "superseded", "deprecated"]),
});

const DataSufficiencySchema = z.object({
  fact_count: z.number().int().nonnegative(),
  confidence_aggregate: z.number().nullable(),
  has_recent_learning: z.boolean(),
  sufficiency_signal: z.enum(["rich", "sparse", "empty"]),
  note: z.string(),
});

const ReadMemoryOutputSchema = z.object({
  facts: z.array(FactSchema),
  data_sufficiency: DataSufficiencySchema,
});

type ReadMemoryInput = z.infer<typeof ReadMemoryInputSchema>;
type ReadMemoryOutput = z.infer<typeof ReadMemoryOutputSchema>;

// ---------- Description (model-facing) ----------

const DESCRIPTION = `Read facts the host has previously taught about a property — door codes, wifi passwords, parking instructions, HVAC quirks, lock idiosyncrasies, kitchen appliance tricks.

Call this BEFORE answering any guest or host question that depends on what the host has already confirmed. Reading from memory beats asking the host the same thing twice and lets you ground answers in real provenance instead of guessing.

v1 scope: entity_type='property' only. Pass the property's UUID as entity_id (resolved from ui_context or a prior turn's tool call). Optional narrowing:
  - sub_entity_type: one of 'front_door' | 'lock' | 'parking' | 'wifi' | 'hvac' | 'kitchen_appliances'
  - attribute: free-form (e.g., 'unlock_mechanism' for the front door, 'password' for wifi)
  - freshness_threshold_days: only return facts learned within the last N days

Returns each fact with full provenance (id, attribute, value, source, confidence, learned_at, learned_from JSONB) and a data_sufficiency block. When sufficiency_signal is 'empty' or 'sparse', prefer asking the host directly over guessing or fabricating; when 'rich', answer from the facts and cite the most recent ones.`;

// ---------- Tool ----------

export const readMemoryTool: Tool<ReadMemoryInput, ReadMemoryOutput> = {
  name: "read_memory",
  description: DESCRIPTION,
  inputSchema: ReadMemoryInputSchema,
  outputSchema: ReadMemoryOutputSchema,
  requiresGate: false, // reads don't gate — the dispatcher writes the audit row directly
  handler: async (input, context) => {
    const result = await readMemory({
      host: context.host,
      scope: {
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        sub_entity_type: input.sub_entity_type,
        sub_entity_id: input.sub_entity_id,
      },
      query: {
        attribute: input.attribute,
        freshness_threshold_days: input.freshness_threshold_days,
      },
    });

    // Re-shape as the tool's output schema. The fields match M2's
    // MemoryReadResult exactly; we project explicitly to make the
    // shape contract visible to readers of this file.
    return {
      facts: result.facts.map((f) => ({
        id: f.id,
        attribute: f.attribute,
        value: f.value,
        source: f.source,
        confidence: f.confidence,
        learned_from: f.learned_from,
        learned_at: f.learned_at,
        last_used_at: f.last_used_at,
        status: f.status,
      })),
      data_sufficiency: {
        fact_count: result.data_sufficiency.fact_count,
        confidence_aggregate: result.data_sufficiency.confidence_aggregate,
        has_recent_learning: result.data_sufficiency.has_recent_learning,
        sufficiency_signal: result.data_sufficiency.sufficiency_signal,
        note: result.data_sufficiency.note,
      },
    };
  },
};
