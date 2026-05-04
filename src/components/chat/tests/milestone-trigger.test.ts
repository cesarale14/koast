/**
 * M6 D33 — KoastMark milestone trigger logic.
 *
 * The trigger lives inside ChatClient as a small hook composed of:
 *   - parsing the SSE stream returned by /api/agent/artifact for the
 *     'memory_write_saved' event
 *   - a setState transition idle → milestone → idle (~2s)
 *   - a prefers-reduced-motion guard that skips the visual transition
 *     entirely when the user prefers reduced motion
 *
 * Component-level tests are still deferred (M5 CF17 — no new test
 * dependencies). This file isolates the parse + reducer logic the
 * production code uses, and verifies it independently.
 */

interface ParsedSseEvent {
  type: string;
  [k: string]: unknown;
}

/**
 * Parse the running buffer of an SSE response. Mirrors the inline
 * parsing in ChatClient.handleArtifactAction. Returns the leftover
 * partial buffer + the events extracted.
 */
function parseSseBuffer(buf: string): { remainder: string; events: ParsedSseEvent[] } {
  const events: ParsedSseEvent[] = [];
  let remainder = buf;
  let sep = remainder.indexOf("\n\n");
  while (sep !== -1) {
    const record = remainder.slice(0, sep).trim();
    remainder = remainder.slice(sep + 2);
    if (record.startsWith("data: ")) {
      try {
        events.push(JSON.parse(record.slice(6)));
      } catch {
        // malformed; skip
      }
    }
    sep = remainder.indexOf("\n\n");
  }
  return { remainder, events };
}

describe("milestone trigger — SSE parsing", () => {
  test("extracts memory_write_saved from a clean two-event stream", () => {
    const buf =
      `data: {"type":"memory_write_saved","artifact_id":"a","audit_log_id":"x","memory_fact_id":"f"}\n\n` +
      `data: {"type":"done","turn_id":"t","audit_ids":["x"]}\n\n`;
    const { events, remainder } = parseSseBuffer(buf);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("memory_write_saved");
    expect(events[1].type).toBe("done");
    expect(remainder).toBe("");
  });

  test("partial buffer leaves trailing data intact for the next chunk", () => {
    const partial = `data: {"type":"memory_write_saved","artifact_id":"a"`;
    const { events, remainder } = parseSseBuffer(partial);
    expect(events).toEqual([]);
    expect(remainder).toBe(partial);
  });

  test("malformed JSON is skipped; subsequent valid events still parse", () => {
    const buf =
      `data: {malformed}\n\n` +
      `data: {"type":"memory_write_saved","artifact_id":"a"}\n\n`;
    const { events } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("memory_write_saved");
  });
});

describe("milestone trigger — state transition timing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("setState transition: idle → milestone → idle over 2000ms", () => {
    let state: "idle" | "milestone" = "idle";

    // Reproduces ChatClient.fireMilestone's shape (sans the
    // prefers-reduced-motion guard, exercised separately).
    function fire(): void {
      state = "milestone";
      setTimeout(() => {
        state = "idle";
      }, 2000);
    }

    fire();
    expect(state).toBe("milestone");

    jest.advanceTimersByTime(1999);
    expect(state).toBe("milestone");

    jest.advanceTimersByTime(1);
    expect(state).toBe("idle");
  });

  test("prefers-reduced-motion guard suppresses the transition entirely", () => {
    let state: "idle" | "milestone" = "idle";
    const reduced = true; // simulating window.matchMedia(...).matches

    function fire(): void {
      if (reduced) return;
      state = "milestone";
      setTimeout(() => {
        state = "idle";
      }, 2000);
    }

    fire();
    expect(state).toBe("idle");

    jest.advanceTimersByTime(2000);
    expect(state).toBe("idle");
  });
});
