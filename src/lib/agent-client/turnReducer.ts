/**
 * Turn reducer — pure function (state, event) => state.
 *
 * Handles M4-emitted events plus M6/M7 promotions:
 *   - tool_call_failed (M6 D28)
 *   - action_proposed   (M7 D39 — was memory_write_pending in M6; now
 *                        discriminated on action_kind: 'memory_write' |
 *                        'guest_message')
 *   - action_completed  (M7 D39 — was memory_write_saved in M6; same
 *                        action_kind discriminator)
 *
 * After M7 there are no remaining forward-looking events. The
 * `_exhaustive: never` assignment in the default branch holds across
 * the full union; M8+ tools introduce their own forward-looking
 * placeholders following the same pattern.
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

    case "tool_call_failed":
      return mutateToolFailed(state, event);

    case "action_proposed":
      // Discriminator on action_kind narrows the proposed_payload shape.
      switch (event.action_kind) {
        case "memory_write":
          return appendMemoryArtifactPending(state, event);
        case "guest_message":
          return appendGuestMessageArtifactPending(state, event);
        default: {
          const _exhaustive: never = event;
          void _exhaustive;
          return state;
        }
      }

    case "action_completed":
      switch (event.action_kind) {
        case "memory_write":
          return mutateMemoryArtifactSaved(state, event);
        case "guest_message":
          return mutateGuestMessageArtifactSent(state, event);
        default: {
          const _exhaustive: never = event;
          void _exhaustive;
          return state;
        }
      }

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

    case "refusal_envelope":
      // M8 Phase D F4 + P4: structured refusal envelope arrived.
      // Status stays 'streaming' until the subsequent 'done' event;
      // the envelope sits on the turn alongside any prior content.
      // ChatClient's harvester reads refusalEnvelope into UITurnLite
      // when the turn finalizes, where RefusalEnvelopeRenderer picks
      // it up.
      return {
        ...state,
        refusalEnvelope: event.envelope,
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

/* ============================================================
   M6 + M7 promotions: tool_call_failed, action_proposed, action_completed
   ============================================================ */

function mutateToolFailed(
  state: TurnState,
  event: Extract<AgentStreamEvent, { type: "tool_call_failed" }>,
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
        status: "failed",
        error: { ...event.error },
        duration_ms: event.latency_ms ?? Math.max(0, now - block.started_at),
      };
    }
    return block;
  });
  if (!mutated) {
    // Defensive: failed event without a matching started block.
    const block: ContentBlock = {
      kind: "tool",
      tool_use_id: event.tool_use_id,
      tool_name: event.tool_name,
      input_summary: "",
      status: "failed",
      error: { ...event.error },
      started_at: now,
      duration_ms: event.latency_ms ?? 0,
    };
    return { ...state, content: [...state.content, block] };
  }
  return { ...state, content };
}

function appendMemoryArtifactPending(
  state: TurnState,
  event: Extract<
    AgentStreamEvent,
    { type: "action_proposed"; action_kind: "memory_write" }
  >,
): TurnState {
  const now = nowFn();

  // Supersession cascade — if this proposal corrects a prior pending
  // artifact, mark the prior block in current state's content array
  // as state='superseded' and link the new artifact_id. Optimistic UI;
  // the substrate's cascade also writes agent_artifacts.state in DB.
  const cascadedContent =
    typeof event.supersedes === "string" && event.supersedes.length > 0
      ? state.content.map((block): ContentBlock => {
          if (
            block.kind === "memory_artifact" &&
            block.artifact_id === event.supersedes
          ) {
            return {
              ...block,
              state: "superseded",
              superseded_by_artifact_id: event.artifact_id,
            };
          }
          return block;
        })
      : state.content;

  const newBlock: ContentBlock = {
    kind: "memory_artifact",
    artifact_id: event.artifact_id,
    audit_log_id: event.audit_log_id,
    state: "pending",
    payload: event.proposed_payload,
    started_at: now,
  };

  return { ...state, content: [...cascadedContent, newBlock] };
}

function mutateMemoryArtifactSaved(
  state: TurnState,
  event: Extract<
    AgentStreamEvent,
    { type: "action_completed"; action_kind: "memory_write" }
  >,
): TurnState {
  let mutated = false;
  const content = state.content.map((block): ContentBlock => {
    if (
      block.kind === "memory_artifact" &&
      block.artifact_id === event.artifact_id &&
      block.state === "pending"
    ) {
      mutated = true;
      return {
        ...block,
        state: "saved",
        memory_fact_id: event.memory_fact_id,
      };
    }
    return block;
  });
  if (!mutated) {
    // Defensive: a saved event for an unknown artifact_id. The
    // conversation-reads extension re-attaches pending artifacts on
    // reload from server; if the saved event arrives before the
    // pending artifact lands in the in-memory state, it would
    // normally be dropped. Append as a synthetic saved-only block to
    // preserve the visual ack; the milestone animation still fires
    // because state='saved' is set.
    const now = nowFn();
    const block: ContentBlock = {
      kind: "memory_artifact",
      artifact_id: event.artifact_id,
      audit_log_id: event.audit_log_id,
      state: "saved",
      // Empty payload — this branch only fires on out-of-order delivery.
      payload: {
        property_id: "",
        sub_entity_type: "",
        attribute: "",
        fact_value: null,
        source: "",
      },
      memory_fact_id: event.memory_fact_id,
      started_at: now,
    };
    return { ...state, content: [...state.content, block] };
  }
  return { ...state, content };
}

function appendGuestMessageArtifactPending(
  state: TurnState,
  event: Extract<
    AgentStreamEvent,
    { type: "action_proposed"; action_kind: "guest_message" }
  >,
): TurnState {
  const now = nowFn();
  const newBlock: ContentBlock = {
    kind: "guest_message_artifact",
    artifact_id: event.artifact_id,
    audit_log_id: event.audit_log_id,
    state: "pending",
    payload: {
      booking_id: event.proposed_payload.booking_id,
      message_text: event.proposed_payload.message_text,
    },
    started_at: now,
  };
  return { ...state, content: [...state.content, newBlock] };
}

function mutateGuestMessageArtifactSent(
  state: TurnState,
  event: Extract<
    AgentStreamEvent,
    { type: "action_completed"; action_kind: "guest_message" }
  >,
): TurnState {
  let mutated = false;
  const content = state.content.map((block): ContentBlock => {
    if (
      block.kind === "guest_message_artifact" &&
      block.artifact_id === event.artifact_id &&
      (block.state === "pending" || block.state === "edited")
    ) {
      mutated = true;
      return {
        ...block,
        state: "sent",
        channex_message_id: event.channex_message_id,
      };
    }
    return block;
  });
  if (!mutated) {
    // Defensive: a sent event for an unknown artifact_id. Append as a
    // synthetic sent-only block to preserve the visual ack.
    const now = nowFn();
    const block: ContentBlock = {
      kind: "guest_message_artifact",
      artifact_id: event.artifact_id,
      audit_log_id: event.audit_log_id,
      state: "sent",
      payload: { booking_id: "", message_text: "" },
      channex_message_id: event.channex_message_id,
      started_at: now,
    };
    return { ...state, content: [...state.content, block] };
  }
  return { ...state, content };
}
