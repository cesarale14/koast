/**
 * write_memory_fact — the agent loop's first gated write tool.
 *
 * Proposes a memory fact write about a property. Gated through the
 * action substrate (D35 dispatcher fork): when the agent calls this
 * tool, the substrate returns mode='require_confirmation', the
 * dispatcher writes the agent_artifacts row + this tool's
 * `buildProposalOutput` synthesizes the model-facing tool result.
 * The tool's `handler` is NOT invoked at proposal time — post-
 * approval execution lives at
 * src/lib/action-substrate/handlers/write-memory-fact.ts and runs
 * when the host clicks Save on the MemoryArtifact.
 *
 * Stakes class: 'medium'. Memory writes are reversible (host can
 * discard or supersede), but they shape the agent's behavior across
 * future conversations — meaningful enough that the substrate gates
 * them at the higher tier and triggers require_confirmation.
 *
 * Artifact kind: 'property_knowledge_confirmation' (matches the
 * artifact registry's v1 kind from M1's agent_loop_tables migration).
 */

import { z } from "zod";
import type { Tool } from "../types";

// ---------- Input schema ----------

// v1 supports entity_type='property' only — same scope as read_memory.
// Future milestones widen as the agent's scope expands.

// Controlled vocabulary mirrors the migration's CHECK constraint.
// Same six values as read_memory; kept in sync intentionally.
const SUB_ENTITY_TYPES = [
  "front_door",
  "lock",
  "parking",
  "wifi",
  "hvac",
  "kitchen_appliances",
] as const;

const WriteMemoryFactInputSchema = z.object({
  property_id: z.string().uuid(),
  sub_entity_type: z.enum(SUB_ENTITY_TYPES),
  attribute: z.string().min(1).max(200),
  fact_value: z.unknown(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["host_taught", "inferred", "observed"]).default("host_taught"),
  // PE convention (D35): when set, the dispatcher fork propagates
  // this value to agent_artifacts.supersedes so the lifecycle
  // correction-chain cascade fires (prior artifact's state →
  // 'superseded'). Set this when the proposal corrects a PRIOR PENDING
  // artifact (e.g., agent re-proposes after host's verbal correction
  // before saving). The dispatcher's cascade reads this; the post-
  // approval handler does not.
  supersedes: z.string().uuid().optional(),
  // Set this when the proposal corrects an ALREADY-SAVED memory_fact
  // (read_memory returned a fact with this id; host's correction now
  // updates it). The post-approval handler reads this field and:
  //   1. INSERTs the new memory_facts row with status='active'
  //   2. UPDATEs the prior memory_facts row: status='superseded',
  //      superseded_by=<new fact id>
  // Distinct from `supersedes` because agent_artifacts.supersedes has
  // an FK to agent_artifacts(id); it cannot reference a memory_fact.
  supersedes_memory_fact_id: z.string().uuid().optional(),
  // Free-form context surfaced in the artifact UI; lets the agent cite
  // the conversational source for the proposal.
  citation: z
    .object({
      source_text: z.string().max(2000).optional(),
      reasoning: z.string().max(2000).optional(),
    })
    .optional(),
});

// ---------- Output schema (proposal-time, D35 fork) ----------

// What the model sees back when the substrate gates the call. The
// dispatcher's buildProposalOutput call synthesizes this; the tool's
// handler is NOT invoked at proposal time.
const WriteMemoryFactProposalOutputSchema = z.object({
  artifact_id: z.string().uuid(),
  audit_log_id: z.string().uuid(),
  outcome: z.literal("pending"),
  message: z.string(),
});

type WriteMemoryFactInput = z.infer<typeof WriteMemoryFactInputSchema>;
type WriteMemoryFactProposalOutput = z.infer<typeof WriteMemoryFactProposalOutputSchema>;

// ---------- Description (model-facing) ----------

const DESCRIPTION = `Propose to save a fact the host has just taught you about a property — door codes, wifi passwords, parking quirks, HVAC instructions, lock idiosyncrasies, kitchen appliance tricks.

This is a PROPOSAL, not a write. When you call this tool, Koast surfaces a card to the host with the proposed fact; the host clicks Save (it persists), Edit (modify then save), or Discard (rejected). The fact only enters memory when the host approves.

Always call read_memory FIRST for the same property + sub_entity_type. If a fact already exists for that slot:
  - The host's new statement is a CORRECTION → call write_memory_fact with supersedes=<existing_fact_id>
  - The host restated the same fact → don't propose; the prior fact is still active
If read_memory returns nothing for that slot, the proposal is a NEW write (omit supersedes).

When to call:
  - Case 1 (explicit): host says "remember that X" → propose
  - Case 2 (contextual): host states a stable property attribute that fits one of the 6 sub_entity_types → propose
  - Case 3 (Q&A): you asked a clarifying question, host answered with a memorable fact → propose
  - Case 4 (correction): host corrects a fact you read → propose with supersedes
  - Case 5 (summarization of prior facts via read_memory) → propose; cite the prior facts in citation.reasoning

When NOT to call:
  - Vague statements ("the wifi works fine") — ask a clarifying question instead
  - One-time events ("guest broke the kettle") — not a stable property attribute
  - Statistical inference without 3+ supporting signals across conversation history
  - Anything you'd guess at — propose only what's grounded in the host's words or prior approved facts

Bias toward conservative. Proposal fatigue is the failure mode to avoid; the MemoryArtifact UI is signal, not noise.

Inputs:
  - property_id: UUID of the property the fact is about (from ui_context or a prior tool call)
  - sub_entity_type: one of 'front_door' | 'lock' | 'parking' | 'wifi' | 'hvac' | 'kitchen_appliances'
  - attribute: short label for the fact (e.g., 'code', 'password', 'unlock_mechanism')
  - fact_value: the fact itself (string, number, or structured JSON)
  - confidence: 0..1, how sure you are about the fact (default omits → backend treats as 1.0)
  - source: 'host_taught' (default; host stated this), 'inferred' (you derived it), 'observed' (from operational data)
  - supersedes: prior artifact_id or memory_fact_id when this is a correction
  - citation.source_text: quote the host's exact words when proposing
  - citation.reasoning: when the proposal is inferred from prior facts (case 5), explain the reasoning

Returns: artifact_id + audit_log_id + outcome='pending' + a short confirmation message you can echo to the host ("I've proposed saving that — let me know if it looks right"). The host action surface is the chat shell; you don't need to follow up unless the host asks.`;

// ---------- Tool ----------

export const writeMemoryFactTool: Tool<WriteMemoryFactInput, WriteMemoryFactProposalOutput> = {
  name: "write_memory_fact",
  description: DESCRIPTION,
  inputSchema: WriteMemoryFactInputSchema,
  outputSchema: WriteMemoryFactProposalOutputSchema,
  requiresGate: true,
  stakesClass: "medium",
  artifactKind: "property_knowledge_confirmation",
  buildProposalOutput: (_input, _context, refs) => ({
    artifact_id: refs.artifact_id,
    audit_log_id: refs.audit_log_id,
    outcome: "pending",
    message:
      "Proposed — Koast has surfaced the fact for the host to review. They can save, edit, or discard it.",
  }),
  handler: async () => {
    // Unreached at proposal time. The dispatcher's D35 fork intercepts
    // when the substrate returns mode='require_confirmation' and writes
    // the agent_artifacts row directly; this handler would only run on
    // the substrate's bypass path (source='agent_artifact'), which is
    // M6's post-approval flow routed through the
    // /api/agent/artifact endpoint to the action handler at
    // src/lib/action-substrate/handlers/write-memory-fact.ts —
    // not through dispatcher.dispatchToolCall.
    throw new Error(
      "[tool:write_memory_fact] Handler should not run at proposal time; the D35 dispatcher fork bypasses it. Post-approval execution lives in action-substrate/handlers/write-memory-fact.ts.",
    );
  },
};
