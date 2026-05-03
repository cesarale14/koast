/**
 * Turn reducer — pure function (state, event) => state.
 *
 * Handles the 7 M4-emitted SSE events. Forward-looking events
 * (tool_call_failed, action_proposed, memory_write_pending,
 * memory_write_saved) are intentionally not in the switch (D-FORWARD-EVENTS):
 * if/when the substrate adds them to AgentStreamEventSchema, the
 * `_exhaustive: never` assignment in the default branch will fail
 * TypeScript compilation, forcing the paired implementation. Dead
 * branches are worse than no branches.
 *
 * All transitions are immutable — no mutation of the input state.
 */

import type { AgentStreamEvent } from "./types";
import {
  initialTurnState,
  type ContentBlock,
  type TurnState,
} from "./types";

/** Unix-ms timestamp source — overrideable for deterministic tests. */
let nowFn: () => number = () => Date.now();

/** Test seam: replace the timestamp source. Default is Date.now(). */
export function __setNowForTests(fn: () => number): void {
  nowFn = fn;
}

export function turnReducer(
  state: TurnState,
  event: AgentStreamEvent,
): TurnState {
  switch (event.type) {
    case "turn_started":
      // Resets prior turn state — the reducer owns one turn at a time.
      // Caller harvests previous done/error/refusal turns into history before
      // submitting a new turn (the next user message triggers turn_started).
      return {
        ...initialTurnState,
        status: "streaming",
        conversation_id: event.conversation_id,
      };

    case "token":
      return appendToken(state, event.delta);

    case "tool_call_started":
      return appendToolStart(state, event);

    case "tool_call_completed":
      return mutateToolCompleted(state, event);

    case "done":
      return {
        ...state,
        status: "done",
        turn_id: event.turn_id,
        audit_ids: event.audit_ids,
      };

    case "error":
      return {
        ...state,
        status: "error",
        error: {
          code: event.code,
          message: event.message,
          recoverable: event.recoverable,
        },
      };

    case "refusal":
      return {
        ...state,
        status: "refusal",
        refusal: {
          reason: event.reason,
          suggested_next_step: event.suggested_next_step,
        },
      };

    default: {
      // TS exhaustiveness — adding any forward-looking event to
      // AgentStreamEventSchema without a matching `case` will fail compile.
      const _exhaustive: never = event;
      void _exhaustive;
      return state;
    }
  }
}

/* ============================================================
   Internal — block-list manipulation
   ============================================================ */

function appendToken(state: TurnState, delta: string): TurnState {
  if (delta.length === 0) return state;
  const last = state.content[state.content.length - 1];
  if (last && last.kind === "paragraph") {
    // Append into the existing trailing paragraph.
    const updated: ContentBlock = { kind: "paragraph", text: last.text + delta };
    return {
      ...state,
      content: [...state.content.slice(0, -1), updated],
    };
  }
  // Start a new paragraph block (covers initial token or token-after-tool).
  return {
    ...state,
    content: [...state.content, { kind: "paragraph", text: delta }],
  };
}

function appendToolStart(
  state: TurnState,
  event: Extract<AgentStreamEvent, { type: "tool_call_started" }>,
): TurnState {
  const block: ContentBlock = {
    kind: "tool",
    tool_use_id: event.tool_use_id,
    tool_name: event.tool_name,
    input_summary: event.input_summary,
    status: "in-flight",
    started_at: nowFn(),
  };
  return { ...state, content: [...state.content, block] };
}

function mutateToolCompleted(
  state: TurnState,
  event: Extract<AgentStreamEvent, { type: "tool_call_completed" }>,
): TurnState {
  const now = nowFn();
  let mutated = false;
  const content = state.content.map((block): ContentBlock => {
    if (
      block.kind === "tool" &&
      block.tool_use_id === event.tool_use_id &&
      block.status === "in-flight"
    ) {
      mutated = true;
      return {
        ...block,
        status: "completed",
        success: event.success,
        result_summary: event.result_summary,
        duration_ms: Math.max(0, now - block.started_at),
      };
    }
    return block;
  });
  if (!mutated) {
    // Defensive: a completed event for an unknown tool_use_id (out-of-order
    // delivery, dropped started event). Append as a completed block.
    const block: ContentBlock = {
      kind: "tool",
      tool_use_id: event.tool_use_id,
      tool_name: "(unknown)",
      input_summary: "",
      status: "completed",
      success: event.success,
      result_summary: event.result_summary,
      started_at: now,
      duration_ms: 0,
    };
    return { ...state, content: [...state.content, block] };
  }
  return { ...state, content };
}
