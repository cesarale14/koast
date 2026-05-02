# Agent Loop v1 — Milestone 4 Report

*Executed 2026-05-02. The agent loop server. End-to-end staging smoke confirmed: a real Anthropic API call retrieved a seeded memory_fact through the dispatcher → tool → handler chain and produced a streaming response that referenced the fact. The full agent loop now exists server-side: conversation persistence, system prompt, multi-turn streaming with tool dispatch, SSE protocol, and the POST /api/agent/turn route. M5 (frontend chat shell) consumes the SSE stream this milestone produces.*

Cross-references:
- Conventions inventory: [`agent-loop-v1-milestone-4-conventions.md`](./agent-loop-v1-milestone-4-conventions.md)
- Milestone 1: schema (foundation)
- Milestone 2: substrate + memory handlers
- Milestone 3: tool dispatcher + read_memory tool
- Design doc: §2 (request flow), §3 (streaming), §4 (tool dispatch), §10 (what M4 proves)

---

## Phase outcomes

### Phase 1 — Conventions inventory (CLEAN, STOPPED for approval)

10 decisions surfaced and approved. Most load-bearing:
- **Tool_result persistence in `agent_turns.tool_calls` JSONB** (since migration's role enum doesn't include `'tool_result'`). Reconstruction at read time synthesizes the SDK's tool_result-as-user-message convention.
- **Anthropic SDK 0.80.0 streaming pattern**: hybrid `for await` for real-time text deltas + `await stream.finalMessage()` for fully-assembled `ToolUseBlock`s.
- **`ANTHROPIC_API_KEY` added to `.env.staging`** (same value as production; staging shares the production key for v1).
- **Model**: `claude-sonnet-4-5-20250929`.

### Phase 2 — Conversation state + system prompt (CLEAN, 18 tests)

**Modules (NEW):**

| File | Lines | Purpose |
|---|---:|---|
| `src/lib/agent/conversation.ts` | 278 | `getOrCreateConversation` (host ownership check), `persistTurn` (computes next turn_index via count + bumps last_turn_at on conversation), `reconstructHistory` (synthesizes SDK MessageParam[] including tool_result-as-user-message blocks from tool_calls JSONB) |
| `src/lib/agent/system-prompt.ts` | 55 | `SYSTEM_PROMPT_TEXT` constant + `buildSystemPrompt(context)` function. v1 = identity + voice + tools + honesty (4 paragraphs, ~130 words) |

**System prompt — final v1.1 text** (verbatim):

> You are Koast, an AI co-host helping the host manage their short-term rental properties.
>
> Voice: honest, direct, succinct. When you don't know something, say so. Don't apologize unnecessarily; don't preface every answer with "Great question". Skip filler.
>
> Tools: you have one tool — read_memory — for retrieving facts the host has previously taught about a property. Call read_memory BEFORE answering any question about a property's specific details (door code, wifi password, parking, HVAC, lock idiosyncrasies). If read_memory returns sufficiency_signal='empty' or 'sparse', tell the host you don't have that on file yet and ask them rather than guessing.
>
> Honesty: every fact you state about properties, operations, guests, or host-specific details must be traceable to a tool result in the current turn or to the host's current message. Don't make up specifics.

The honesty rule was refined per user direction (M4 Phase 1 prompt) — the original draft prohibited even trivial conversational answers ("what's your name?"). The final text scopes the rule to property/operations/guest/host-specific facts.

**Tests (NEW):**

| File | Lines | Tests |
|---|---:|---:|
| `tests/conversation.test.ts` | 274 | 12 |
| `tests/system-prompt.test.ts` | 44 | 6 |

### Phase 3 — Loop orchestration (CLEAN, 6 tests)

**Module (NEW):**

| File | Lines | Purpose |
|---|---:|---|
| `src/lib/agent/loop.ts` | 380 | `runAgentTurn()` — async generator yielding `AgentStreamEvent` values. Multi-turn streaming with tool dispatch, round cap = 5, atomic persistence per design doc §2.5 |

**Implementation flow** (matches design doc §2.4):

1. `getOrCreateConversation` (M2 helper) → conversation row
2. `persistTurn` user role with the message
3. Yield `turn_started`
4. `reconstructHistory` → `MessageParam[]`
5. `buildSystemPrompt` + `getToolsForAnthropicSDK`
6. **Round loop (cap = 5):**
   a. `client.messages.stream(...)` with prompt caching on system prompt
   b. `for await` — forward `content_block_delta.text_delta` as `token` events
   c. `await stream.finalMessage()` — get assembled `Message` with full ToolUseBlocks
   d. If `stop_reason === 'tool_use'`:
      - For each ToolUseBlock: yield `tool_call_started`, call `dispatchToolCall` (M3), yield `tool_call_completed`
      - Build tool_result blocks; append assistant message + synthetic user message of tool_results to history
      - round++
      - If round > 5 after iteration: error `round_cap_exceeded`
   e. If `stop_reason === 'refusal'`: prepare refusal metadata, break
   f. Else (`end_turn` / `max_tokens` / etc.): break
7. Persist assistant turn — text accumulated across all rounds + tool_calls JSONB combining all rounds' tool calls + token counts from the final round's usage
8. Yield `done` with `turn_id` + `audit_ids[]`

**Atomicity per §2.5**: SDK error mid-stream → user turn IS persisted (already done in step 2); assistant turn NOT persisted. Round-cap and refusal both produce a turn worth persisting (assistant turn IS persisted with refusal/error metadata).

**Tests (NEW):** `tests/loop.test.ts` (351 lines, 6 tests):
- Happy path (text-only): turn_started → token(s) → done; persists user + assistant; verifies token counts roundtrip
- Tool path: 2-round dispatch with read_memory mocked; verifies SDK called twice, tool_call_started + tool_call_completed events, assistant turn persisted with tool_calls JSONB
- Round cap: 5 successive tool_use rounds → error event with code `round_cap_exceeded`; assistant turn still persisted
- SDK error mid-stream: error event emitted; user turn persisted but NOT assistant turn (atomicity verified)
- Refusal: refusal event; assistant turn persisted with refusal metadata
- Missing API key: throws

Mock strategy: `jest.mock("@anthropic-ai/sdk")` with a fake constructor returning a fake client whose `messages.stream(...)` returns a fake async-iterable + `finalMessage()` mock.

### Phase 4 — SSE + route handler (CLEAN, 21 tests)

**Modules (NEW):**

| File | Lines | Purpose |
|---|---:|---|
| `src/lib/agent/sse.ts` | 92 | Zod-validated `AgentStreamEventSchema` discriminated union (7 event types per design doc §3.2, minus `'artifact'` deferred to M7); `serializeSseEvent()` formats as `data: <json>\n\n`; `makeSseResponse()` wraps a ReadableStream with text/event-stream headers + `X-Accel-Buffering: no` |
| `src/app/api/agent/turn/route.ts` | 111 | POST handler. Auth via `getAuthenticatedUser()` (host-level, no property scoping). Zod-validated body: `{ conversation_id: uuid \| null, message: string(1..8000), ui_context?: ... }`. Pulls `runAgentTurn()` events into a ReadableStream; honors `request.signal.aborted` for client-disconnect |

The route also imports `@/lib/agent/tools` for its registration side-effect — Next.js's bundler ensures this runs once at module load time.

**Tests (NEW):**

| File | Lines | Tests |
|---|---:|---:|
| `tests/sse.test.ts` | 125 | 12 |
| `__tests__/route.test.ts` | 149 | 9 |

### Phase 5 — Staging smoke (CLEAN — real Anthropic API call)

**Setup wrapper (psql)**: insert test user + property, apply transactional `GRANT USAGE ON SCHEMA public + GRANT ON ALL TABLES` to `authenticated`/`anon`/`service_role` (DRIFT-3 workaround per M2/M3 pattern), seed memory_fact via `writeMemoryFact()`.

**Run**: `RUN_STAGING_SMOKE=1 npx jest src/lib/agent/tests/m4-staging-smoke.test.ts`

**Result**: ✅ PASS (16.4 seconds end-to-end)

```
[dispatcher] Registered tool 'read_memory' (gated=false).
[dispatcher] Tool 'read_memory' succeeded in 628ms.
[m4-smoke] event sequence: turn_started → tool_call_started → tool_call_completed → token → token → done
[m4-smoke] tokens: input=406 output=21 cache_read=1033
[m4-smoke] tool dispatches: 1
[m4-smoke] response excerpt: The wifi password is **m4-smoke-password-1777711409901**.
```

**Event sequence**: 6 events in order: `turn_started → tool_call_started → tool_call_completed → token → token → done`. Note that `tool_call_started/completed` arrived BEFORE the tokens — the model emitted tool_use first, then text after the tool result was fed back. Matches expected behavior.

**Persistence verified**:
- 1 row in `agent_conversations` (host-scoped, status='active')
- 2 rows in `agent_turns`: `(role='user', turn_index=0, content_text="What's the wifi password...")` and `(role='assistant', turn_index=1, content_text="The wifi password is...", tool_calls=[1 ToolCallRecord], model_id='claude-sonnet-4-5-20250929', input_tokens=406, output_tokens=21, cache_read_tokens=1033)`
- 1 row in `agent_audit_log` for the read_memory dispatch: `action_type='read_memory'`, `source='agent_tool'`, `actor_kind='agent'`, `autonomy_level='silent'`, `outcome='succeeded'`, `latency_ms=628`

**Cost estimate** (claude-sonnet-4-5-20250929 pricing as of 2026-05-02):
- Input: 406 tokens × $3/M = **$0.001218**
- Cache reads: 1033 tokens × $0.30/M = **$0.000310**
- Output: 21 tokens × $15/M = **$0.000315**
- **Total: $0.001843 ≈ 0.18¢ per turn** (well under 1¢)

The `cache_read=1033` indicates prompt caching is working — the system prompt + tools manifest were served from cache rather than re-billed at input rate.

**Cleanup**: smoke's `afterAll` deleted memory_fact + agent_audit_log rows + conversation (cascades to turns); wrapper psql deleted property + user + REVOKE'd grants. Staging post-smoke: 0 rows for the test host across all tables.

### Phase 6 — Verification + report (CLEAN)

```
$ npx tsc --noEmit
(exit 0)

$ npm test
Test Suites: 3 skipped, 15 passed, 15 of 18 total
Tests:       3 skipped, 156 passed, 159 total
Time:        27.5s

$ npx next lint --max-warnings=0
✔ No ESLint warnings or errors
```

The 3 skipped suites are the gated staging smokes (M2 + M3 + M4 — all pass when run with `RUN_STAGING_SMOKE=1` and the corresponding wrapper).

---

## Architectural decisions during authoring

### D1 — Loop emits events via async generator (not callback-style)

`runAgentTurn` is `async function*`. Callers consume via `for await of`. Reasoning: the generator pattern composes naturally with `ReadableStream`'s pull model (the route's stream `start()` uses `for await`); avoids manual queue/buffer management; lets the loop yield events at any point in its multi-step flow without inversion of control.

**Trade-off**: one async iterator per turn means the generator can't be re-driven. Acceptable at v1; if streaming with retries lands, a different pattern may be needed.

### D2 — Hybrid SDK consumption: `for await` + `finalMessage()`

For text deltas we use the raw async iterator (real-time forwarding to SSE). For tool_use blocks we use `await stream.finalMessage()` after the iteration completes. The SDK assembles tool input JSON internally; we don't reinvent.

**Trade-off**: tool_use events are NOT real-time — the user sees `tool_call_started` only after the model finishes streaming the assistant turn's text. Acceptable since v1 has read-only tools that are fast (read_memory <1s); for slow write tools, switching to per-block-completion events via `.on('contentBlock')` may be needed in M5+.

### D3 — Turn structure: assistant rounds collapsed into ONE assistant turn

Even if the model loops 3 times (text → tool_use → text → tool_use → text → end_turn), we persist ONE row in `agent_turns` per HTTP request. The text from all rounds is concatenated; the tool_calls JSONB array carries every tool dispatch from every round.

Reasoning: turn_index is "what the host typed and what the assistant said back" — round-internal state isn't a host-visible turn. The reconstruction logic re-expands the assistant turn's tool_calls into the SDK's per-round Message shape.

**Trade-off**: a single tool_calls JSONB entry can have N tool dispatches from N rounds. The shape is well-suited to JSONB (array of records), but downstream queries against agent_turns can't distinguish round 1 vs round 2 tool dispatches without parsing the array. agent_audit_log retains per-call metadata if that distinction matters.

### D4 — Atomicity rule: persist user turn FIRST, then assistant turn at the end

User turn is persisted in step 2 (before the SDK call). Assistant turn is persisted in step 7 (after the loop completes). If the SDK errors mid-stream:
- User turn IS in the database (host won't lose what they typed)
- Assistant turn is NOT in the database (no half-formed reply)

The host can retry the same conversation_id and the loop will reconstruct including the previous user turn but excluding the failed assistant attempt.

### D5 — Tool result content serialized as JSON for the model, raw for the audit log

The dispatcher returns `ToolCallResult { ok, value | error, audit_log_id }`. The loop builds the tool_result content for the SDK by `JSON.stringify(value)` (for success) or constructing an error string (for failure). The same string is stored in `agent_turns.tool_calls[i].result.content`.

**Reasoning**: the model sees JSON. The audit log stores what the model saw, byte-for-byte, so debugging "what did the agent see" never requires reconstruction.

### D6 — Round cap is 5 (per user-approved decision)

5 tool_use rounds per turn. After the 5th round if stop_reason is still tool_use, the loop exits with `error` code `round_cap_exceeded`. The assistant turn IS still persisted (see D3) so the partial state is debuggable.

### D7 — Honesty rule scoped, not universal

Original system prompt draft said "every named fact must be tool-traceable" — too prescriptive (would prohibit "thanks!" / "sure!" / "what should I call you?"). Final v1.1 scopes the rule to facts about properties, operations, guests, or host-specific details. Conversational turns flow naturally without unnecessary tool calls.

### D8 — Route reads tool registration as a side-effect import

`src/app/api/agent/turn/route.ts` does `import "@/lib/agent/tools"` at the top of the file. The imported module's top-level statements (registerTool calls) run on first import. Next.js evaluates the route module once per server instance.

**Trade-off**: the side-effect-import pattern is a smell (ESLint typically warns on imports without bindings). Mitigated here because the registration is the ONLY job of `src/lib/agent/tools/index.ts` — there's nothing else to import. If the file grew responsibilities, the registration should move to an explicit `bootstrapTools()` function.

---

## Files added (11) + modified (1)

### Added
- `src/lib/agent/conversation.ts` (278 lines)
- `src/lib/agent/system-prompt.ts` (55 lines)
- `src/lib/agent/loop.ts` (380 lines)
- `src/lib/agent/sse.ts` (92 lines)
- `src/app/api/agent/turn/route.ts` (111 lines)
- `src/lib/agent/tests/conversation.test.ts` (274 lines)
- `src/lib/agent/tests/system-prompt.test.ts` (44 lines)
- `src/lib/agent/tests/loop.test.ts` (351 lines)
- `src/lib/agent/tests/sse.test.ts` (125 lines)
- `src/lib/agent/tests/m4-staging-smoke.test.ts` (201 lines, gated)
- `src/app/api/agent/turn/__tests__/route.test.ts` (149 lines)
- `docs/architecture/agent-loop-v1-milestone-4-conventions.md` (Phase 1 inventory)
- `docs/architecture/agent-loop-v1-milestone-4-report.md` (this file)

### Modified
- `~/koast/.env.staging` — added `ANTHROPIC_API_KEY` (gitignored; not in repo)

**Locked / unchanged**: all migration files; the design document; M1 + M2 + M3 modules.

---

## Test counts

| Suite | Tests | Lines |
|---|---:|---:|
| `conversation.test.ts` | 12 | 274 |
| `system-prompt.test.ts` | 6 | 44 |
| `loop.test.ts` | 6 | 351 |
| `sse.test.ts` | 12 | 125 |
| `m4-staging-smoke.test.ts` | 1 (gated) | 201 |
| `route.test.ts` | 9 | 149 |
| **Net new this milestone** | **+45 unit + 1 gated smoke** | **+1144 lines** |
| **Grand total project tests** | **156 unit + 3 gated smokes** | — |

Code lines: 916 across 5 modules (conversation 278, loop 380, route 111, sse 92, system-prompt 55).

---

## Open carry-forwards for Milestone 5 and beyond

1. **M5 — Frontend chat shell** consumes the SSE stream from `/api/agent/turn`. Must Zod-validate each event with `AgentStreamEventSchema` (imported from `src/lib/agent/sse.ts`) so client-side type safety matches server-side.

2. **`/api/agent/conversations/[id]` GET endpoint** — fetch full conversation history. Defer per user constraint; needed when the chat shell adds "view past conversations" UI.

3. **`/api/agent/artifact-action` route** — M8 work; M4 doesn't emit artifacts.

4. **Real-time tool_call_started events** — currently the user only sees `tool_call_started` AFTER the assistant's text streams (because we wait for `finalMessage()` to get assembled tool blocks). For slow write tools in M5+, switch to listening on the SDK's `contentBlock` event for per-block completion to get earlier tool_call_started signals.

5. **Stream resumption tokens** (Phase 2+). v1 has no resumption; client retries are full-restarts.

6. **Edge runtime migration** — if streaming durations regularly exceed Vercel's serverless cap (~30s), migrate the route to Edge runtime. Not needed at v1 (read-only tool keeps turns under 20s in the smoke).

7. **Migrate `messaging.ts` + `reviews/generator.ts` to claude-sonnet-4-5-20250929** in lockstep — separate session.

8. **DRIFT-3 permanent fix** — staging service_role grants. Smoke uses transactional GRANT/REVOKE bracket. Permanent fix is a recovery migration `20260502100000_recovery_supabase_role_grants.sql`. Out of scope this session.

9. **Action_type rename** `'memory_fact_write'` → `'write_memory_fact'` (M3 carry-forward).

10. **Audit-row aging diagnostic** (M2 carry-forward) — query for stuck `outcome='pending'` rows.

11. **M1 carry-forwards still active**: messaging_executor INSERT path attribution gate; drop messages_pre_milestone1_snapshot ≥2026-05-09.

12. **Voice doctrine doc** (`docs/voice.md`) — currently the v1 system prompt has voice rules inlined. When the doc is consolidated, system-prompt.ts should reference it rather than duplicating.

13. **Per-host context in the system prompt** — `buildSystemPrompt(context)` accepts a context arg but v1 ignores it. Future: interpolate host's `voice_mode`, owned property names, etc.

---

## Sign-off

- [x] Phase 1 conventions inventory complete; 10 decisions approved
- [x] Phase 2 conversation.ts + system-prompt.ts authored; 18 tests pass
- [x] Phase 3 loop.ts authored; 6 tests pass; round cap + atomicity verified in tests
- [x] Phase 4 sse.ts + route handler authored; 21 tests pass
- [x] Phase 5 staging smoke ran against real Anthropic API; full event sequence + tool dispatch + persistence + audit roundtripped clean; ~$0.0018 per turn
- [x] Phase 6 verification clean: tsc 0, npm test 156/156 unit + 3 gated smokes pass when run, lint clean
- [x] Migration files unchanged
- [x] Design document unchanged
- [x] M1/M2/M3 work substantively unchanged (only stakes-registry mutability extension was M3 work; M4 just consumed it)
- [x] Production data untouched
- [x] No new dependencies introduced

After this session: the agent loop server exists, streams SSE responses, handles multi-turn tool dispatch, and roundtrips against staging using a real Anthropic API call. M5 (frontend chat shell) consumes the SSE stream this milestone produces.
