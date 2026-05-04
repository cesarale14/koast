/**
 * Client-side mirror of the agent loop's SSE event union.
 *
 * Mirrors src/lib/agent/sse.ts intentionally — does NOT import from it,
 * because that module pulls in server-side dependencies (next/server,
 * supabase service client) that webpack would bundle into the client
 * graph (CLAUDE.md feedback memory: "Client/server bundling").
 *
 * The Zod schema below revalidates SSE payloads on the client so any
 * server/client drift is caught at parse time on this side.
 *
 * Phase 1 STOP D-F1 correction: M4 emitted 7 events. M6 promotes 3 of
 * the 4 forward-looking events from D-FORWARD-EVENTS into the active
 * schema (tool_call_failed, memory_write_pending, memory_write_saved).
 * The 4th forward-looking event — `action_proposed` — stays as a
 * type-only declaration, deferred to M7. The reducer's exhaustive
 * switch still fails TS for action_proposed, forcing M7 to address.
 */

import { z } from "zod";

/* ============================================================
   Active SSE events (M4 + M6 promotions)
   ============================================================ */

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("turn_started"),
    conversation_id: z.string(),
  }),
  z.object({
    type: z.literal("token"),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("tool_call_started"),
    tool_use_id: z.string(),
    tool_name: z.string(),
    input_summary: z.string(),
  }),
  z.object({
    type: z.literal("tool_call_completed"),
    tool_use_id: z.string(),
    success: z.boolean(),
    result_summary: z.string(),
  }),
  // M6 D28: per-tool failure with structured taxonomy. Replaces the
  // "tool returned with success=false" pattern; 'tool_call_completed'
  // continues to mean genuine successful execution.
  z.object({
    type: z.literal("tool_call_failed"),
    tool_use_id: z.string(),
    tool_name: z.string(),
    error: z.object({
      kind: z.enum([
        "validation",
        "authorization",
        "constraint",
        "conflict",
        "transient",
        "unknown",
      ]),
      message: z.string(),
      retryable: z.boolean(),
    }),
    latency_ms: z.number().int().nonnegative(),
  }),
  // M6 D35: write_memory_fact proposal landed; agent_artifacts row in
  // state='emitted'. Reducer attaches a memory_artifact ContentBlock
  // to the current turn; cascade marks any prior matching artifact
  // state='superseded' optimistically.
  z.object({
    type: z.literal("memory_write_pending"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    proposed_payload: z.object({
      property_id: z.string(),
      sub_entity_type: z.string(),
      attribute: z.string(),
      fact_value: z.unknown(),
      confidence: z.number().optional(),
      source: z.string(),
      supersedes: z.string().optional(),
      supersedes_memory_fact_id: z.string().optional(),
      citation: z
        .object({
          source_text: z.string().optional(),
          reasoning: z.string().optional(),
        })
        .optional(),
    }),
    supersedes: z.string().optional(),
  }),
  // M6 post-approval: host clicked Save → memory_facts row committed,
  // agent_artifacts.state='confirmed'. Reducer flips the artifact's
  // visual state and the parent turn's KoastMark fires the milestone
  // deposit animation (CF15 visual completion).
  z.object({
    type: z.literal("memory_write_saved"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    memory_fact_id: z.string(),
    superseded_memory_fact_id: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("done"),
    turn_id: z.string(),
    audit_ids: z.array(z.string()),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
  z.object({
    type: z.literal("refusal"),
    reason: z.string(),
    suggested_next_step: z.string().nullable(),
  }),
]);

export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

/* ============================================================
   Forward-looking events — types only (D-FORWARD-EVENTS, M7)
   ============================================================
   M6 promoted tool_call_failed, memory_write_pending, and
   memory_write_saved into the active schema above. The remaining
   forward-looking event — action_proposed — stays as a type-only
   declaration. The reducer's exhaustive switch deliberately fails
   TS compilation for action_proposed; M7 lifts it into the active
   schema and adds the matching reducer branch.
*/

// TODO M7
export type ForwardLookingActionProposed = {
  type: "action_proposed";
  proposal_id: string;
  /** Plain-language summary, e.g. "Push price to $199 on Airbnb · expires Tue 12:00 pm". */
  head: string;
  /** 1-3 sentence rationale. */
  why: string;
  /** Action variants — primary + secondaries + ghost. */
  options: Array<{
    id: string;
    label: string;
    kind: "primary" | "secondary" | "ghost";
  }>;
};

/* ============================================================
   UI-side state shapes
   ============================================================ */

/** Lifecycle state of a memory artifact rendered inline in a turn (M6). */
export type MemoryArtifactState = "pending" | "saved" | "superseded" | "failed";

/** A block inside the current koast turn — prose text, an inline tool call, or an inline memory artifact. */
export type ContentBlock =
  | {
      kind: "paragraph";
      /** Raw accumulated text including any "\n\n" separators; renderer splits to <p>. */
      text: string;
    }
  | {
      kind: "tool";
      tool_use_id: string;
      tool_name: string;
      input_summary: string;
      // M6 D28: 'failed' added — tool_call_failed events transition
      // to this status and populate the `error` field below.
      status: "in-flight" | "completed" | "failed";
      /** Filled when status='completed'. */
      success?: boolean;
      /** Filled when status='completed'. */
      result_summary?: string;
      /** Filled when status='failed' (M6 D28). */
      error?: {
        kind: "validation" | "authorization" | "constraint" | "conflict" | "transient" | "unknown";
        message: string;
        retryable: boolean;
      };
      /** Wall-clock ms between tool_call_started and tool_call_completed/_failed. */
      duration_ms?: number;
      /** Client-side timestamp at tool_call_started; used to compute duration_ms. */
      started_at: number;
    }
  | {
      // M6 D35: write_memory_fact proposal artifact, rendered inline
      // in the turn that produced it. Lifecycle state mirrors
      // agent_artifacts.state (mapped from M5's 4-value enum):
      //   memory_write_pending  → 'pending'   (agent_artifacts.state='emitted')
      //   memory_write_saved    → 'saved'     (agent_artifacts.state='confirmed')
      //   supersession cascade  → 'superseded'
      //   post-approval failure → 'failed'    (recoverable; see error field)
      kind: "memory_artifact";
      artifact_id: string;
      audit_log_id: string;
      state: MemoryArtifactState;
      /** Original proposed payload (from memory_write_pending). */
      payload: {
        property_id: string;
        sub_entity_type: string;
        attribute: string;
        fact_value: unknown;
        confidence?: number;
        source: string;
        supersedes?: string;
        supersedes_memory_fact_id?: string;
        citation?: { source_text?: string; reasoning?: string };
      };
      /** Filled when state='saved' (memory_write_saved fired). */
      memory_fact_id?: string;
      /** Filled when state='superseded' — the artifact_id that superseded this one. */
      superseded_by_artifact_id?: string;
      /** Filled when state='failed' (post-approval execution failed). */
      error?: { message: string; retryable: boolean };
      /** Client-side timestamp at memory_write_pending; for ordering & duration. */
      started_at: number;
    };

/** State of the *current* in-flight or just-finished turn. Past turns are
 *  managed by the page (server-loaded history); the reducer only owns the
 *  active turn. The host harvests on `status === 'done'`/`'error'`/`'refusal'`. */
export type TurnState = {
  status: "idle" | "streaming" | "done" | "error" | "refusal";
  conversation_id: string | null;
  turn_id: string | null;
  audit_ids: string[];
  /** Content blocks in source order. */
  content: ContentBlock[];
  /** Set when status='error'. */
  error: { code: string; message: string; recoverable: boolean } | null;
  /** Set when status='refusal'. */
  refusal: { reason: string; suggested_next_step: string | null } | null;
};

export const initialTurnState: TurnState = {
  status: "idle",
  conversation_id: null,
  turn_id: null,
  audit_ids: [],
  content: [],
  error: null,
  refusal: null,
};

/** Past-turn shape for the history feed (server-loaded via D-Q8). */
export type HistoryTurn = {
  id: string;
  role: "user" | "koast";
  /** ISO timestamp from agent_turns.created_at. */
  created_at: string;
  text: string | null;
  /** Tool calls in source order, normalized from agent_turns.tool_calls JSONB. */
  tool_calls: Array<{
    tool_use_id: string;
    tool_name: string;
    /** Pre-serialized for display; raw input is server-only. */
    input_summary: string;
    success: boolean;
    result_summary: string;
  }>;
  /** Optional refusal payload from refusal column. */
  refusal: { reason: string; suggested_next_step: string | null } | null;
};
