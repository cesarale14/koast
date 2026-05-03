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
 * Phase 1 STOP D-F1 correction: M4 emits 7 events. The 4 forward-looking
 * events at the bottom of this file are types ONLY (D-FORWARD-EVENTS) —
 * not in the active schema, not in the reducer's switch. When the
 * substrate adds them in M6/M7, lift them into AgentStreamEventSchema
 * and the reducer's exhaustive switch will fail TS until the paired
 * branch is implemented.
 */

import { z } from "zod";

/* ============================================================
   M4-emitted events (active in M5)
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
   Forward-looking events — types only (D-FORWARD-EVENTS, M6/M7)
   ============================================================
   Declared here so consumers can reference the eventual shapes,
   but NOT in AgentStreamEventSchema and NOT in turnReducer's
   switch. When the substrate (src/lib/agent/sse.ts + the loop)
   adds these events:
     1. Add the matching z.object(...) entries to AgentStreamEventSchema
     2. Add `case` branches to turnReducer
     3. Wire the UI components (ActionProposal, MemoryArtifact, etc.)
   The reducer's exhaustiveness check (`_exhaustive: never`) will
   fail TS compilation between steps 1 and 2, forcing pairing.
*/

// TODO M6/M7
export type ForwardLookingToolCallFailed = {
  type: "tool_call_failed";
  tool_use_id: string;
  error_message: string;
  /** Optional ms duration if tracked. */
  duration_ms?: number;
};

// TODO M6/M7
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

// TODO M6/M7
export type ForwardLookingMemoryWritePending = {
  type: "memory_write_pending";
  pending_id: string;
  /** Structured fact spans (key → val pairs) for clean rendering. */
  fact: Array<{ kind: "key"; text: string } | { kind: "val"; text: string }>;
};

// TODO M6/M7
export type ForwardLookingMemoryWriteSaved = {
  type: "memory_write_saved";
  pending_id: string;
  layers_settled: number;
};

/* ============================================================
   UI-side state shapes
   ============================================================ */

/** A block inside the current koast turn — either prose text or an inline tool call. */
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
      status: "in-flight" | "completed";
      /** Filled when status='completed'. */
      success?: boolean;
      /** Filled when status='completed'. */
      result_summary?: string;
      /** Wall-clock ms between tool_call_started and tool_call_completed. */
      duration_ms?: number;
      /** Client-side timestamp at tool_call_started; used to compute duration_ms. */
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
