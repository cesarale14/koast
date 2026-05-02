# Agent Loop v1 — Milestone 4 Conventions Inventory

*Phase 1 deliverable — read-only inventory before authoring any agent-loop server code. Surfaces the Anthropic SDK 0.80.0 streaming + tools shape (verified via the SDK's `MessageStream` class), existing API-route conventions (no streaming routes exist; M4 establishes the pattern), auth pattern (lean `getAuthenticatedUser()`), missing `ANTHROPIC_API_KEY` in staging (decision needed), and a load-bearing schema/design discrepancy on how to persist tool_results when `agent_turns.role` enum doesn't include `'tool_result'`. STOP after this document; await approval before Phases 2-6.*

Cross-references:
- Design doc: `agent-loop-v1-design.md` §2 (request flow), §3 (streaming contract), §4 (tool dispatch — M3 deliverable), §10 (what M4 proves)
- M2 conventions inventory + report
- M3 conventions inventory + report (substrate + dispatcher patterns)
- Schema: `src/lib/db/schema.ts` (agent_conversations, agent_turns, agent_artifacts, agent_audit_log)
- Migration: `supabase/migrations/20260501020000_agent_loop_tables.sql`

---

## A. Anthropic SDK 0.80.0 — streaming with tools

### `client.messages.stream(params)` returns a `MessageStream` instance

Confirmed via `node_modules/@anthropic-ai/sdk/lib/MessageStream.d.mts:22`:

```typescript
export declare class MessageStream<ParsedT = null>
  implements AsyncIterable<MessageStreamEvent>
{
  messages: MessageParam[];           // mutable history accumulator
  receivedMessages: ParsedMessage<ParsedT>[];
  controller: AbortController;        // for client-disconnect cancellation

  on<E>(event, listener): this;       // event-emitter style
  off<E>(event, listener): this;
  emitted<E>(event): Promise<...>;
  done(): Promise<void>;
  abort(): void;
  finalMessage(): Promise<ParsedMessage<ParsedT>>;  // <-- key for our loop
  finalText(): Promise<string>;

  [Symbol.asyncIterator](): AsyncIterator<MessageStreamEvent>;  // <-- for await of
  toReadableStream(): ReadableStream;
}
```

### Two consumption styles available

**Style 1: `for await (const event of stream)` — raw event iteration.** Works directly with `RawMessageStreamEvent` discriminated union: `RawMessageStartEvent | RawMessageDeltaEvent | RawMessageStopEvent | RawContentBlockStartEvent | RawContentBlockDeltaEvent | RawContentBlockStopEvent`.

**Style 2: `.on('text', cb)` + `.on('inputJson', cb)` + `await stream.finalMessage()`.** The SDK pre-parses events into typed listeners. `finalMessage()` returns the assembled `Message` once the stream completes — including all `ToolUseBlock`s with their fully-parsed `input` JSON (no need to assemble JSON deltas ourselves).

**Recommendation for M4**: hybrid.
- Use `for await of stream` to forward text deltas as SSE `token` events to the client in real time (low latency for the typing-in-progress UX).
- Use `await stream.finalMessage()` after the iteration completes to get fully-assembled `ToolUseBlock`s ready for `dispatchToolCall()`. The SDK already handles input-JSON-streaming and merging; we don't reinvent.

### Stop reasons that drive the multi-turn loop

`StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal'` (verified line 847 of messages.d.mts).

Loop logic per design doc §2.4:
- `end_turn` → assistant is done; emit SSE `done`, persist assistant turn, exit
- `tool_use` → dispatch each pending tool, append `tool_result` user message, run another stream round
- `max_tokens` → treat as `end_turn` for v1 (no continuation logic at v1)
- `refusal` → persist refusal metadata, emit SSE `refusal`, exit
- `stop_sequence` / `pause_turn` → unused at v1; treat as `end_turn`

### Multi-turn tool dispatch — how to feed tool_result back

Per the SDK + Messages API contract:
1. After `finalMessage()`, the assistant message contains `text` + `tool_use` content blocks.
2. To continue the conversation with tool results, append:
   - The assistant's full message (with tool_uses) to `messages`
   - A new user message with `content: ToolResultBlockParam[]` (one per dispatched tool, each with `tool_use_id` matching the `tool_use.id`)
3. Open a new `client.messages.stream(...)` call with the appended history.

Each round is its own `messages.stream()` call. The SDK doesn't have a "continue" API; we explicitly re-stream with the updated `messages`.

### Prompt caching

`cache_control: { type: 'ephemeral' }` on the system prompt block + each tool definition. Cache breakpoints documented per design doc §2.2. The system prompt and tools are stable across turns; only `messages` varies. v1 cache strategy: place breakpoint on the system prompt and on the last tool definition.

---

## B. Existing API route conventions

### Auth pattern

`src/lib/auth/api-auth.ts`:
- `getAuthenticatedUser()` returns `{ user, error }` using `createClient()` (Supabase server client with cookie session)
- `verifyPropertyOwnership(userId, propertyId)` boundary check via service-role
- `verifyServiceKey(request)` for VPS workers via `x-service-key` header

**M4 auth recommendation**: use `getAuthenticatedUser()` only. The agent route is **host-level**, not property-level (the agent operates across the host's whole portfolio; specific property scoping is done via `ui_context` hints inside the request body, not via URL path or auth check).

### Request validation

The codebase uses Zod (per M2/M3 inventories) — `src/lib/validators/properties.ts` is the existing pattern. M4 follows that pattern.

### Streaming responses

**No existing streaming route in `src/app/`.** Verified via `grep -rln "ReadableStream\|text/event-stream" src/app` → empty. M4 establishes the streaming pattern. Per design doc §3.1: native `ReadableStream` in a `Response` object with `Content-Type: text/event-stream` header. No `EventSource`-required GET path; the design uses POST with streaming body.

### Existing Anthropic SDK usage

Two non-streaming usages: `src/lib/claude/messaging.ts:generateDraft()` and `src/lib/reviews/generator.ts`. Both use:
- `client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens, system, messages })`
- Non-streaming
- No tools

M4 introduces the first streaming + tools usage in the codebase.

---

## C. Schema-vs-design mismatch on `agent_turns.role` enum

**This is the biggest decision of Phase 1.**

### Design doc §2.3

Designed `agent_turns.role` as `'user' | 'assistant' | 'tool_result'`, where tool_result rows carry `{ tool_use_id, content }` blocks.

### Migration (locked) shipped

```sql
role text NOT NULL CHECK (role IN ('user', 'assistant'))
```

No `'tool_result'` value. The migration is locked; we don't fix this in M4.

### How to persist tool_results then?

The migration's `agent_turns` schema has these columns relevant to assistant turns:
- `content_text` (text, nullable) — the text portion of the assistant's response
- `tool_calls` (jsonb, nullable) — the assistant's emitted tool_use blocks
- `artifacts` (jsonb, nullable) — emitted artifact references
- `refusal` (jsonb, nullable) — refusal metadata if present

**Decision: store tool_use + tool_result pairs together in `tool_calls` JSONB.** Shape:

```typescript
type ToolCallsRecord = {
  tool_use_id: string;
  tool_name: string;
  input: unknown;                      // the assembled tool_use.input
  result: {
    content: string;                   // the text/JSON we sent back to model
    is_error: boolean;
  };
  audit_log_id: string;                // links to agent_audit_log row
}[];
```

Reasoning:
1. **No new schema required.** The migration's `tool_calls` column is already JSONB, just under-specified about what goes in.
2. **Conversation reconstruction is straightforward.** When rebuilding the SDK history, expand each `tool_calls[i]` entry into:
   - The assistant message gets `{ type: 'tool_use', id, name, input }`
   - Then a synthetic user message with `{ type: 'tool_result', tool_use_id, content, is_error }`
3. **Tool-call results are queryable.** Audit feed via `agent_audit_log`; full payload via `agent_turns.tool_calls`. Both are useful for `/koast/recent-activity` (Phase 1 closeout, not M4).

### `agent_conversations.user_id` vs `host_id`

Design said `user_id`. Migration shipped `host_id`. M4 uses migration: `host_id`.

---

## D. ANTHROPIC_API_KEY in environments

| Env file | ANTHROPIC_API_KEY present? |
|---|---|
| `~/koast/.env.local` (production) | ✓ set |
| `~/koast/.env.staging` | ✗ NOT set |
| Vercel production env | (not visible from VPS; assumed set per existing routes) |
| Vercel preview env | (assumed set; same key) |

**Phase 5 staging smoke needs an Anthropic API key.** Three options:

- **Option A (recommended)**: Add the production `ANTHROPIC_API_KEY` value to `~/koast/.env.staging`. The smoke test uses staging Supabase + production Anthropic key. Cost: a real Anthropic API charge (~$0.01 per smoke run; agentic turn with tools probably costs <2¢ each). Operationally simplest; matches what users will do once the agent ships (everyone uses the same Anthropic account anyway since Anthropic doesn't support per-environment keys at the org level).
- **Option B**: Source `.env.local` for the smoke and override `DATABASE_URL` with staging's value. Brittle; multiple env switching.
- **Option C**: Skip the smoke at v1 (smoke runs only on local dev with `.env.local` sourced fully). Loses the staging-fidelity guarantee that everything else has been built around.

**Recommendation: Option A.** Add `ANTHROPIC_API_KEY` to `.env.staging` with the same value as `.env.local`. Document this in the conventions section. Charges go on the same Anthropic billing — no environment-of-keys confusion.

---

## E. Model selection

Design doc §2.2 says `claude-sonnet-4-5-20250929`. Existing codebase uses the older `claude-sonnet-4-20250514` (in messaging.ts and reviews/generator.ts).

**Decision**: M4 uses `claude-sonnet-4-5-20250929` per the design doc. The existing routes can be migrated separately (they're stable and don't block M4); doing them in lockstep is a small follow-up.

Verified the SDK's example code at `messages.d.mts:65` references `claude-sonnet-4-5-20250929` — model identifier is supported by SDK 0.80.0.

---

## F. SSE in Next.js — proposed pattern

Since the codebase has no precedent, propose a small helper module. v1 shape:

```typescript
// src/lib/agent/sse.ts
import { z } from "zod";

// Discriminated union, validated at emit + consume.
export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn_started"), turn_id: z.string(), conversation_id: z.string() }),
  z.object({ type: z.literal("token"), delta: z.string() }),
  z.object({ type: z.literal("tool_call_started"), tool_use_id: z.string(), tool_name: z.string(), input_summary: z.string() }),
  z.object({ type: z.literal("tool_call_completed"), tool_use_id: z.string(), success: z.boolean(), result_summary: z.string() }),
  z.object({ type: z.literal("done"), turn_id: z.string(), audit_ids: z.array(z.string()) }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string(), recoverable: z.boolean() }),
  z.object({ type: z.literal("refusal"), reason: z.string(), suggested_next_step: z.string().nullable() }),
]);

export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export function serialize(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function makeSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",   // disable nginx/Vercel-edge buffering
    },
  });
}
```

The route handler builds a `ReadableStream` whose enqueued bytes are the SSE-serialized events. The agent loop driver writes events via the controller's `enqueue()` method.

**Note on artifact event type**: design doc §3.2 includes `{ type: 'artifact', ... }`. v1's M4 doesn't emit artifacts (M8 does). So at M4, the artifact event type is **not** in the discriminated union; it'll be added when M8 lands the artifact-emit code paths.

---

## G. System prompt construction

### Existing system prompts in the codebase

`src/lib/claude/messaging.ts:generateDraft()` system prompt structure:
- Identity: "You are a friendly, professional short-term rental host assistant for [property]"
- Property context: bedrooms, bathrooms, max guests
- Booking context: dates, guest name
- Property details: WiFi/door code/check-in (when present)
- Tone instructions: "Respond warmly and helpfully. Keep responses concise (2-4 sentences)."

`src/lib/reviews/generator.ts` system prompt structure:
- Identity: "You are writing a host review..."
- Review constraints: tone, keywords, length
- Examples: none

Both use a single `system: string` parameter.

### M4 system prompt design

Per design doc §2.2, structured as:
```
[voice doctrine: TBD — voice.md doesn't exist yet at v1; placeholder]
[stakes / honesty rules]
[tools manifest, human-readable]
["You are Koast..." identity prefix]
```

**v1 simplified version** (since voice.md isn't ready):

```
You are Koast, an AI co-host helping the host manage their short-term rental properties.

Voice: honest, direct, succinct. When you don't know something, say so. Don't apologize unnecessarily; don't preface every answer with "Great question". Skip filler.

Tools: you have one tool — read_memory — for retrieving facts the host has previously taught about a property. Call read_memory BEFORE answering any question about a property's specific details (door code, wifi password, parking, HVAC, lock idiosyncrasies). If read_memory returns sufficiency_signal='empty' or 'sparse', tell the host you don't have that on file yet and ask them rather than guessing.

Honesty: every named fact you state about a property must be traceable to a tool result in the current turn. If you don't have grounding, say "I don't have that on file yet — what should I know?" instead of fabricating.
```

Iterate during authoring; this is the first draft. Length matters for prompt cache cost (longer prompt → more cached tokens, but same per-cache-hit cost).

---

## H. Test strategy for streaming code

### Strategy: mock the SDK's MessageStream at the module boundary

The `loop.ts` module imports `Anthropic` from `@anthropic-ai/sdk`. Tests `jest.mock("@anthropic-ai/sdk")` and provide a fake constructor that returns a fake client whose `messages.stream(...)` returns a fake `MessageStream` (an async iterable yielding `RawMessageStreamEvent`s + a `finalMessage()` method).

Pattern:

```typescript
function makeFakeStream(events: RawMessageStreamEvent[], finalMsg: Message) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) yield e;
    },
    finalMessage: jest.fn().mockResolvedValue(finalMsg),
    abort: jest.fn(),
  };
}
```

Tests cover:
- Happy path: stream yields text deltas → `for await of` accumulates → SSE token events emitted → `finalMessage()` returns end_turn → done event emitted
- Tool path: stream yields tool_use → finalMessage() includes ToolUseBlock → dispatchToolCall called → tool_result built → second stream call with appended history → end_turn → done
- Round cap: 5 successive tool_use rounds → 6th round refused → error event with code='round_cap_exceeded'
- SDK error: stream throws → error event emitted, no partial assistant turn persisted
- Abort: stream aborted mid-flight → cleanup; no error event emitted (client gone)

### Strategy: test runAgentTurn() directly, route is thin

The route is auth + body-validate + call `runAgentTurn` + stream-response. The interesting logic is in `runAgentTurn`. Test `runAgentTurn` directly with a mocked SDK; test the route's auth/validation paths separately with the loop mocked.

### Staging smoke approach

Test `runAgentTurn()` directly from a Jest gated test (skip the HTTP layer; the loop is the load-bearing piece). A wrapper script:

1. psql-set up test user/property/memory_fact in staging
2. Apply DRIFT-3 GRANT bracket
3. `RUN_STAGING_SMOKE=1 npx jest src/lib/agent/tests/m4-staging-smoke.test.ts`
4. The Jest test imports `runAgentTurn`, calls it with a real Anthropic key + staging Supabase, consumes the async iterable, asserts:
   - At least one token event arrived
   - read_memory was dispatched at least once
   - The final assistant turn's text references the seeded fact
   - Persistence: agent_conversations row + 2 agent_turns rows + agent_audit_log rows present
5. Cleanup: psql delete + REVOKE bracket

Skipping the HTTP layer in the smoke is acceptable because the route is mechanical (auth + stream-pipe). Test the route's surface separately with mocks.

---

## I. Conversation reconstruction pattern

```typescript
// src/lib/agent/conversation.ts
async function reconstructHistory(conversationId: string): Promise<MessageParam[]> {
  // Fetch all turns ordered by turn_index ascending
  // SELECT * FROM agent_turns WHERE conversation_id = $1 ORDER BY turn_index ASC;
  
  const messages: MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.content_text ?? '' });
    } else { // assistant
      const content: ContentBlockParam[] = [];
      if (turn.content_text) content.push({ type: 'text', text: turn.content_text });
      
      const toolCalls = (turn.tool_calls ?? []) as ToolCallsRecord;
      // Add tool_use blocks to assistant message
      for (const tc of toolCalls) {
        content.push({ type: 'tool_use', id: tc.tool_use_id, name: tc.tool_name, input: tc.input });
      }
      messages.push({ role: 'assistant', content });
      
      // Add a synthetic user message with tool_results
      if (toolCalls.length > 0) {
        const toolResults: ContentBlockParam[] = toolCalls.map(tc => ({
          type: 'tool_result',
          tool_use_id: tc.tool_use_id,
          content: tc.result.content,
          is_error: tc.result.is_error,
        }));
        messages.push({ role: 'user', content: toolResults });
      }
    }
  }
  return messages;
}
```

The synthetic user-message-of-tool-results is required because the migration doesn't have `'tool_result'` role; we synthesize at read time and store at write time inside the assistant turn's `tool_calls` JSONB.

---

## J. Open decisions to confirm before Phase 2

1. **Module location**: confirm `src/lib/agent/{conversation,system-prompt,loop,sse}.ts` + `src/app/api/agent/turn/route.ts`. Tests at `src/lib/agent/tests/`.
2. **Tool_result persistence**: confirm storing tool_use + tool_result pairs in `agent_turns.tool_calls` JSONB (per §C). Reconstruction at read time synthesizes the SDK's `MessageParam[]` shape with tool_result-as-user-message.
3. **`ANTHROPIC_API_KEY` in `.env.staging`**: confirm Option A — add the same key to staging .env so the smoke test can run. Approve adding the key (small operational change to `.env.staging`).
4. **Model**: confirm `claude-sonnet-4-5-20250929` per design doc.
5. **Round cap**: confirm 5 tool-use rounds per turn (design doc §2.4).
6. **System prompt v1 text**: confirm the simplified version drafted in §G as the v1 starting point (will iterate).
7. **No artifact emission at M4**: confirm artifact event type deferred to M8; `AgentStreamEvent` discriminated union excludes `'artifact'` at M4 (will be added by M8).
8. **Staging smoke skips the HTTP route**: confirm testing `runAgentTurn()` directly in a Jest gated test; route's auth/validation tested separately with mocks. (HTTP-layer smoke deferred to a manual curl test or M5+ frontend integration.)
9. **Vercel runtime**: confirm Node runtime (default) for the agent route at v1; revisit Edge runtime if streaming durations exceed Vercel's serverless cap.
10. **Atomicity on error**: confirm design doc §2.5 — user turn IS persisted, assistant turn is NOT persisted on SDK error mid-stream.

---

## K. Out-of-scope items (NOT touched by Milestone 4)

- `/api/agent/artifact-action` route (Milestone 8/9)
- `/api/agent/conversations/[id]` GET route (defer)
- Frontend chat shell (Milestone 5/7)
- Artifact registry + components (Milestone 8)
- Round-cap recovery / auto-retry (Phase 2+)
- Stream resumption tokens (Phase 2+)
- Multi-host calibration / host_action_patterns table (no migration; deferred from M2 design)
- DRIFT-3 permanent fix (next staging-arc session; smoke uses GRANT/REVOKE bracket)
- Migrating `messaging.ts` and `reviews/generator.ts` to the newer model (separate session; not blocking M4)
- Voice doctrine doc (`docs/voice.md`) — v1 system prompt uses simplified inline version

---

## L. Risk register

- **Vercel streaming-duration cap** (~10s for the default serverless runtime per old Vercel docs; M4 turns may exceed this for tool-heavy interactions). Risk mitigated by v1's single tool (read_memory <50ms) keeping turns under 10s. If turns get longer, migrate to Edge runtime (see §J9).
- **Anthropic API rate limit** during smoke. Mitigated by single smoke run; not a deploy blocker.
- **Tool input JSON streaming** — the SDK's `inputJson` event listener provides partial JSON. We rely on `finalMessage()` to give us assembled `ToolUseBlock`s with parsed input rather than parsing partial JSON ourselves. Verified the SDK does this (per `MessageStream.d.mts:11`).
- **prompt cache invalidation** — if the system prompt drifts between turns (e.g., per-turn context interpolation), cache hit rate drops. M4 builds the system prompt from per-host static settings only at v1; per-turn ui_context interpolation goes into the messages, not the system prompt.
- **Schema-vs-design role enum mismatch** (§C). Already resolved; flagging for visibility.

---

## Sign-off

- [x] Anthropic SDK 0.80.0 streaming + tools API documented (MessageStream class, for-await + finalMessage hybrid pattern, stop reasons, tool_result feedback API)
- [x] Existing API route conventions surveyed (no streaming routes; M4 establishes the pattern)
- [x] Auth pattern identified (`getAuthenticatedUser()`; host-level)
- [x] ANTHROPIC_API_KEY presence checked: present in `.env.local`, missing in `.env.staging` — decision needed
- [x] Model selection confirmed against design doc + SDK example code (`claude-sonnet-4-5-20250929`)
- [x] SSE pattern proposed (no codebase precedent; M4 establishes via `ReadableStream` + Response with text/event-stream)
- [x] Existing system prompts surveyed; v1 system prompt text drafted
- [x] Test strategy documented (mock SDK at module boundary; runAgentTurn() tested directly)
- [x] Conversation reconstruction pattern documented (with tool_calls JSONB synthesis)
- [x] Schema-vs-design role enum mismatch identified and resolution proposed
- [x] 10 open decisions enumerated for user confirmation
- [ ] User approval to proceed with Phases 2-6

**STOP. No code authored. Awaiting decisions on items J1-J10 and overall approval to proceed.**
