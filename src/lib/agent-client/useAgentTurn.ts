"use client";

/**
 * useAgentTurn — hook that POSTs a user message to /api/agent/turn,
 * consumes the SSE stream, and drives the turn reducer.
 *
 * Reads:
 *   - state: current TurnState (from the reducer)
 * Writes (callable):
 *   - submit(message, ui_context?): kick off a turn
 *   - cancel(): abort the active turn (used by the stop button)
 *
 * The hook owns:
 *   - the reducer + its current state
 *   - an AbortController for the active fetch
 *   - the SSE-chunk buffer (passed across parseSSEChunk calls)
 *
 * The chat page is responsible for:
 *   - harvesting completed turns into history (when state.status flips to
 *     done/error/refusal)
 *   - rendering the active turn from state.content
 */

import { useCallback, useReducer, useRef } from "react";
import { parseSSEChunk } from "./parseSSEEvent";
import { turnReducer } from "./turnReducer";
import { initialTurnState, type TurnState } from "./types";

export type UiContext = {
  active_route?: string;
  active_property_id?: string;
};

export type SubmitOptions = {
  /** When provided, sends as `conversation_id`; null starts a new conversation. */
  conversation_id: string | null;
  /** Optional UI context hints sent in the request body. */
  ui_context?: UiContext;
};

export type UseAgentTurnReturn = {
  state: TurnState;
  /** True while a fetch is in flight (status==='streaming' or about to be). */
  isStreaming: boolean;
  submit: (message: string, options: SubmitOptions) => Promise<void>;
  cancel: () => void;
  /** Imperatively reset to idle (e.g. after harvesting a completed turn). */
  reset: () => void;
};

const RESET_ACTION = { type: "__reset__" } as const;

// Re-export the local reducer so the hook can wrap it with the reset escape-hatch.
function reducerWithReset(
  state: TurnState,
  action: Parameters<typeof turnReducer>[1] | typeof RESET_ACTION,
): TurnState {
  if ((action as { type: string }).type === "__reset__") return initialTurnState;
  return turnReducer(state, action as Parameters<typeof turnReducer>[1]);
}

export function useAgentTurn(): UseAgentTurnReturn {
  const [state, dispatch] = useReducer(reducerWithReset, initialTurnState);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef<boolean>(false);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    isStreamingRef.current = false;
  }, []);

  const reset = useCallback(() => {
    cancel();
    dispatch(RESET_ACTION);
  }, [cancel]);

  const submit = useCallback(
    async (message: string, options: SubmitOptions): Promise<void> => {
      // Cancel any in-flight turn before starting a new one.
      cancel();

      const controller = new AbortController();
      abortRef.current = controller;
      isStreamingRef.current = true;

      // Reset reducer to a fresh active turn (turn_started will land soon).
      dispatch(RESET_ACTION);

      try {
        const response = await fetch("/api/agent/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: options.conversation_id,
            message,
            ui_context: options.ui_context,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          dispatch({
            type: "error",
            code: `http_${response.status}`,
            message: response.statusText || "request failed",
            recoverable: response.status >= 500,
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const { events, remainder } = parseSSEChunk(buffer, chunk);
          buffer = remainder;
          for (const event of events) {
            dispatch(event);
          }
        }
        // Flush any trailing buffer (after final \n\n in the same chunk).
        if (buffer.length > 0) {
          const { events } = parseSSEChunk(buffer, "");
          for (const event of events) dispatch(event);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // Caller invoked cancel() — leave state as-is, host harvests.
          return;
        }
        dispatch({
          type: "error",
          code: "network",
          message: (err as Error).message ?? "network error",
          recoverable: true,
        });
      } finally {
        isStreamingRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [cancel],
  );

  return {
    state,
    isStreaming: state.status === "streaming",
    submit,
    cancel,
    reset,
  };
}
