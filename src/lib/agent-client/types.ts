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
 * D39 (M7): action-proposal events are canonicalized into
 * `action_proposed` / `action_completed` with an `action_kind`
 * discriminator (`'memory_write' | 'guest_message'`). The payload shape
 * is itself discriminated by `action_kind`, so the reducer's switch
 * branches get strongly-typed access to the correct payload per kind.
 * No forward-looking events remain — `_exhaustive: never` holds across
 * the full union.
 */

import { z } from "zod";

/* ============================================================
   Active SSE events (M4 + M6 + M7)
   ============================================================ */

// Per-kind payload schemas. `MemoryWriteProposedPayloadSchema` preserves
// the 8 fields M6 emitted on `memory_write_pending` verbatim — the rename
// is wire-shape only. `GuestMessageProposedPayloadSchema` is M7 new.
const MemoryWriteProposedPayloadSchema = z.object({
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
});

const GuestMessageProposedPayloadSchema = z.object({
  booking_id: z.string(),
  message_text: z.string(),
});

const ActionProposedSchema = z.discriminatedUnion("action_kind", [
  z.object({
    type: z.literal("action_proposed"),
    action_kind: z.literal("memory_write"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    proposed_payload: MemoryWriteProposedPayloadSchema,
    supersedes: z.string().optional(),
  }),
  z.object({
    type: z.literal("action_proposed"),
    action_kind: z.literal("guest_message"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    proposed_payload: GuestMessageProposedPayloadSchema,
  }),
]);

const ActionCompletedSchema = z.discriminatedUnion("action_kind", [
  z.object({
    type: z.literal("action_completed"),
    action_kind: z.literal("memory_write"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    memory_fact_id: z.string(),
    superseded_memory_fact_id: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("action_completed"),
    action_kind: z.literal("guest_message"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    channex_message_id: z.string(),
  }),
]);

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
  // M6 D28: per-tool failure with structured taxonomy.
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
  ActionProposedSchema,
  ActionCompletedSchema,
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
   UI-side state shapes
   ============================================================ */

/**
 * Lifecycle state of a memory artifact rendered inline in a turn.
 *
 * - `pending`     — agent_artifacts.state='emitted', awaiting host action
 * - `saved`       — host approved; memory_facts row committed
 * - `superseded`  — a later proposal corrected this one
 * - `failed`      — post-approval handler errored (rare; M6's write_memory_fact
 *                   handler is local-DB only). For a memory artifact, failure
 *                   is unrecoverable — Try-again is not surfaced.
 */
export type MemoryArtifactState = "pending" | "saved" | "superseded" | "failed";

/**
 * Lifecycle state of a guest_message artifact (M7 D43).
 *
 * - `pending`  — agent_artifacts.state='emitted', no host edit yet
 * - `edited`   — host clicked Edit and saved an `edited_text` (M7 D45 first
 *                activator of agent_artifacts.state='edited')
 * - `sent`     — host approved; Channex acknowledged the send
 * - `failed`   — Channex rejected; substrate kept state='emitted' but the
 *                paired audit row is outcome='failed' and
 *                commit_metadata.last_error carries the detail (M7 §6
 *                amendment). Try-again re-runs the post-approval handler.
 */
export type GuestMessageArtifactState = "pending" | "edited" | "sent" | "failed";

/** A block inside the current koast turn — prose text, an inline tool call, an inline memory artifact, or an inline guest-message proposal. */
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
      // M6 D35 + M7 D39: write_memory_fact proposal artifact, rendered inline
      // in the turn that produced it. Lifecycle state mirrors agent_artifacts.state:
      //   action_proposed{action_kind:'memory_write'}    → 'pending'   (state='emitted')
      //   action_completed{action_kind:'memory_write'}   → 'saved'     (state='confirmed')
      //   supersession cascade                           → 'superseded'
      //   post-approval failure                          → 'failed'    (rare; non-retryable)
      kind: "memory_artifact";
      artifact_id: string;
      audit_log_id: string;
      state: MemoryArtifactState;
      /** Original proposed payload (from action_proposed). */
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
      /** Filled when state='saved' (action_completed fired). */
      memory_fact_id?: string;
      /** Filled when state='superseded' — the artifact_id that superseded this one. */
      superseded_by_artifact_id?: string;
      /** Filled when state='failed' (post-approval execution failed). */
      error?: { message: string; retryable: boolean };
      /** Client-side timestamp at action_proposed; for ordering & duration. */
      started_at: number;
    }
  | {
      // M7 D43: propose_guest_message proposal artifact. Free-text payload
      // with inline edit affordance (D38 editable=true). Lifecycle state
      // is derived from agent_artifacts.state + audit_outcome (D42 + §6
      // amendment): substrate keeps state='emitted' on Channex failure
      // and signals via audit outcome + commit_metadata.last_error so the
      // UI can render 'failed' without polluting the lifecycle enum.
      kind: "guest_message_artifact";
      artifact_id: string;
      audit_log_id: string;
      state: GuestMessageArtifactState;
      /** Original proposed payload (from action_proposed). edited_text is set after a host Edit. */
      payload: {
        booking_id: string;
        message_text: string;
        edited_text?: string;
      };
      /** Filled when state='sent' (action_completed fired with channex_message_id). */
      channex_message_id?: string;
      /** Filled when state='failed' (commit_metadata.last_error). Try-again clears. */
      error?: { message: string };
      /** Client-side timestamp at action_proposed; for ordering. */
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
