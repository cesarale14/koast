/**
 * Mock SSE stream driver — D16.
 *
 * A scripted sequence of typed AgentStreamEvent values with optional
 * inter-event delays. Used by:
 *   - tests/turnReducer.test.ts (sync iteration)
 *   - tests/parseSSEEvent.test.ts (round-trip via SSE wire)
 *   - src/app/(dashboard)/_preview/m5-states/[state]/page.tsx (D-PREVIEW-ROUTES)
 *
 * No external mock framework — keeps the dependency footprint flat.
 */

import type { AgentStreamEvent } from "../types";

export type MockEvent = {
  event: AgentStreamEvent;
  /** Delay before yielding this event, in ms. Defaults to 0. */
  delayMs?: number;
};

/** Async generator: yields events with the configured delays.
 *  Useful for preview routes and integration tests. */
export async function* runMockStream(
  events: MockEvent[],
): AsyncGenerator<AgentStreamEvent> {
  for (const { event, delayMs } of events) {
    if (delayMs && delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    yield event;
  }
}

/** Synchronous variant — useful for reducer tests. */
export function collectMockEvents(events: MockEvent[]): AgentStreamEvent[] {
  return events.map((e) => e.event);
}

/* ============================================================
   Pre-built scripts
   ============================================================ */

/** A representative koast turn that:
 *    1. starts
 *    2. streams a paragraph of tokens
 *    3. invokes read_memory
 *    4. completes the tool
 *    5. streams a closing paragraph
 *    6. finishes cleanly
 *
 *  Used by integration tests and the streaming preview route. */
export const sampleStreamingTurn: MockEvent[] = [
  { event: { type: "turn_started", conversation_id: "conv-test-1" }, delayMs: 0 },
  { event: { type: "token", delta: "Looking into the rate floor for that weekend.\n\n" }, delayMs: 40 },
  {
    event: {
      type: "tool_call_started",
      tool_use_id: "tu-1",
      tool_name: "read_memory",
      input_summary: "scope=property:bfb0750e",
    },
    delayMs: 80,
  },
  {
    event: {
      type: "tool_call_completed",
      tool_use_id: "tu-1",
      success: true,
      result_summary: "Found 1 fact: floor=$184",
    },
    delayMs: 240,
  },
  { event: { type: "token", delta: "$184 is " }, delayMs: 40 },
  { event: { type: "token", delta: "1.8% under last year's clear price for the same Fri-Sat at this listing." }, delayMs: 60 },
  { event: { type: "done", turn_id: "turn-test-1", audit_ids: ["audit-1", "audit-2"] }, delayMs: 100 },
];
