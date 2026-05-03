/**
 * Pure-function SSE chunk parser.
 *
 * The M4 endpoint emits SSE events in the canonical format
 *   `data: <json>\n\n`
 * per src/lib/agent/sse.ts `serializeSseEvent`. Network chunks may not align
 * with event boundaries — this parser buffers across chunks and emits
 * complete events as it sees `\n\n` terminators.
 *
 * Stateless API: caller passes the prior buffer remainder + the new chunk,
 * gets back parsed events + the new remainder. Caller owns the buffer state.
 * Keeps the function pure-and-testable; useAgentTurn maintains the buffer.
 */

import {
  AgentStreamEventSchema,
  type AgentStreamEvent,
} from "./types";

export type ParseSSEResult = {
  events: AgentStreamEvent[];
  /** Unprocessed buffer remainder — feed back into the next call. */
  remainder: string;
};

/** Parse a chunk of SSE bytes (already decoded to string). Returns any
 *  complete events extracted plus the remaining bytes that didn't form a
 *  full event yet. Malformed events (bad JSON, schema-invalid) are SKIPPED
 *  (not thrown) so a single bad payload doesn't abort the whole stream. */
export function parseSSEChunk(
  prevBuffer: string,
  chunk: string,
): ParseSSEResult {
  const buffer = prevBuffer + chunk;
  const events: AgentStreamEvent[] = [];
  let cursor = 0;

  while (true) {
    const boundary = buffer.indexOf("\n\n", cursor);
    if (boundary === -1) break;
    const block = buffer.slice(cursor, boundary);
    cursor = boundary + 2; // skip past the "\n\n"
    const parsed = parseSSEEventBlock(block);
    if (parsed) events.push(parsed);
  }

  return { events, remainder: buffer.slice(cursor) };
}

/** Parse one event block (text between `\n\n` boundaries, without the
 *  trailing `\n\n`). The block may contain multiple SSE field lines per
 *  spec, but M4 emits only `data:` lines. We accept any payload that has
 *  one or more `data:` fields and concatenates them per the SSE spec. */
export function parseSSEEventBlock(block: string): AgentStreamEvent | null {
  if (block.length === 0) return null;
  const lines = block.split("\n");
  let data = "";
  for (const line of lines) {
    if (line.startsWith(":")) continue; // SSE comment
    if (line.startsWith("data:")) {
      // Strip "data:" prefix and one optional leading space (SSE spec).
      const value = line.slice(5).replace(/^ /, "");
      data = data.length > 0 ? data + "\n" + value : value;
    }
    // Other field types (event:, id:, retry:) are ignored — M4 doesn't use them.
  }
  if (data.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const result = AgentStreamEventSchema.safeParse(json);
  return result.success ? result.data : null;
}
