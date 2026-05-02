# Agent Loop v1 — First Vertical Slice Design

*Status: design draft. May 1, 2026. This document becomes the implementation reference for the build work. Mark "DECISION" entries are committed; mark "ALTERNATIVES" entries flag choices the team should discuss before commit.*

This document designs the first vertical slice of Koast's agent loop — Phase 1 foundation work per `docs/method/koast-method-in-code.md`. The slice does **one** real end-to-end thing while forcing every Phase 1 architectural commitment to be designed concretely. Once the slice works, breadth is added without rebuilding foundations.

The grounding is the seven Belief inventories under `docs/method/BELIEF_*_INVENTORY.md`, the Method document `docs/method/koast-method.md`, and the Method-in-Code map `docs/method/koast-method-in-code.md`. When this document references existing codebase shapes, the references are grounded in those investigations.

---

## 1. Scope of the first vertical slice

### 1.1 The one user-visible scenario, end-to-end

**Scenario name**: *Host teaches Koast a property quirk through chat.*

This is the canonical Method example from Belief 1: *"the front door key at Brickell needs to come out horizontally because the lock mechanism gets stuck if you pull straight."* The slice traces a single host turn from input to persisted state.

**Trace**:

1. Host opens Koast and sees the persistent chat slot at the bottom of the screen (or in orb mode, depending on toggle). Existing dashboard / calendar / properties pages remain peer surfaces but the chat is reserved layout space across all routes.
2. Host types into the chat input: *"At Villa Jamaica the front door needs to be pulled out horizontally — the lock sticks if you pull straight out. It's a hurricane door."*
3. Frontend posts to `POST /api/agent/turn` with the message and the active conversation id (or null to start a new one).
4. The agent loop starts. System prompt assembled from voice doctrine + available tools manifest + the consolidated stakes / honesty rules.
5. Anthropic SDK call with `stream: true`, `tools` array including `read_memory`, prompt caching enabled on the static prefix.
6. Model decides to read existing memory before saving — emits a `tool_use` block: `read_memory({ entity_type: "property", entity_id: "<resolved-villa-jamaica-id>", sub_entity_handle: "front_door" })`.
7. Server resolves the property reference, dispatches to the tool handler, returns a `tool_result` (likely empty in v1 prod since `memory_facts` starts empty for the test fleet).
8. Model continues. It composes a confirmation: *"Got it — Villa Jamaica's front door has a hurricane-door mechanism that needs a horizontal pull. I want to save this so I share it with future guests when they ask about check-in. Confirm?"*
9. Mid-stream, the model emits an `artifact` event with `kind: 'property_knowledge_confirmation'` carrying the proposed fact (entity scope, attribute, value, source). The frontend resolves the artifact via the registry and renders inline in the chat as an interactive block with **Save** and **Edit** affordances.
10. Server completes the model stream, emits a final `done` event with the conversation turn's metadata (token counts, tools called, audit references).
11. Host clicks **Save** in the artifact. Frontend posts to `POST /api/agent/artifact-action` with the artifact id and the action `confirm`.
12. The action substrate (`requestAction`) classifies the action as `memory.write` with stakes class `low` (reversible) but with `requires_confirmation_at_v1: true` (host is teaching the system what to remember; explicit consent is the v1 floor). Since the host has already confirmed by clicking Save, the substrate returns `silent` for *this specific call* and the write proceeds.
13. The fact is persisted to `memory_facts`: `{ host_id, property_id, sub_entity_type: 'door', sub_entity_handle: 'front_door', attribute: 'unlock_mechanism', value: 'pull horizontally — hurricane door, sticks if pulled straight', source: 'host_taught', confidence: 1.0, learned_from: { conversation_turn_id, source_message_id }, created_at }`.
14. The action substrate writes one row to the unified audit feed: `{ actor_id: <host-uuid>, action_type: 'memory.write', payload: { fact_id }, autonomy_level: 'host_confirmed', outcome: 'success', source: 'agent_chat', confidence: 1.0 }`.
15. Frontend updates the artifact's interaction state to `confirmed`. The artifact remains in the chat history but its affordances change to "saved" with a link to inspect the fact in the memory inspector (greenfield UI not in this slice; the link is a stub at v1).
16. Conversation turn complete. The `agent_conversations` and `agent_turns` rows have all the metadata required for replay, audit, and future continuation.

**Persisted state at end of trace**:
- 1 row in `agent_conversations` (or updated if continuing).
- 2 rows in `agent_turns` (host turn + assistant turn).
- 1 row in `memory_facts`.
- 1 row in `agent_audit_log` (the unified audit feed's first instance).
- 0 rows in any Channex audit log (the slice doesn't touch Channex — the platform-boundary preservation is the *pattern* established for later, not exercised here).

### 1.2 What's explicitly NOT in scope for this slice

The Method-in-Code Phase 1 commitments touched by this slice are listed in §10. Things deliberately deferred to later vertical slices:

- **Multiple tools.** Just `read_memory`. The dispatcher contract is general from day one (per §4) but only one tool is registered.
- **Multiple artifact types.** Just `property_knowledge_confirmation`. The registry is general from day one (per §5) but only one artifact is implemented.
- **Voice mode switch in agent prompts.** v1 uses neutral mode (Mode 2) sourced from the consolidated voice doctrine. The `voice_mode` setting is read but `learned` mode falls back to neutral until voice extraction ships in a later slice. (Per Belief 7 §7c cold-start handling.)
- **Per-host calibration.** The action substrate exposes the contract (`requestAction(host, action_type, payload)`) and consults a `host_action_patterns` table that exists but contains no learned policies yet. Calibration logic at v1 is "stakes class + always require confirmation for memory writes."
- **Worker integration.** Workers don't go through the agent in v1. The audit feed is unified at the schema level but workers continue to write to existing logs (`channex_outbound_log`, `sms_log`, etc.); the unified feed reads from those plus its own writes.
- **The other 39 agent tools** from Belief 6 §2. Phase 2 work.
- **Mobile-specific UX refinement.** The chat slot is responsive but the experiential bar (motion, polish on streaming text reveal, gesture handling) is Phase 1 closeout work, not the first slice.
- **Memory write tool exposed directly to the model.** v1's pattern is: agent reads memory, then proposes a write through an *artifact*, then the host confirms in the artifact. This makes the human-in-the-loop explicit. A future slice can add a `write_memory` tool with gradient-gated autonomy — but the v1 pattern is "agent shows what it would do; host confirms in the artifact; server writes."
- **Stripe integration.** Not in any slice. Phase 4 work.
- **The Phase 1 calibration debt fixes** (mocked pulse sparkline, point-estimate dollar amounts, etc. per Method-in-Code §"pre-launch calibration debt") ship in their own work streams, not in this slice. They block launch, not the slice.
- **Long-conversation summarization / context window management.** v1 holds the full turn history per conversation; truncation strategies come later.
- **`actor_id` propagation backfill** for existing messages. The hygiene fix (per §8) ships *with* the slice's schema migrations but back-population of existing rows is a separate small migration, not slice work.

### 1.3 Why this specific slice was chosen

This slice is the smallest end-to-end path that forces every Phase 1 architectural decision:

| Phase 1 commitment | How this slice forces it |
|---|---|
| Streaming-first infrastructure | Slice ships streaming because the response includes mid-stream tool call + artifact emission. Adding streaming later means rebuilding. |
| Agent layer as peer to API layer | Slice introduces `POST /api/agent/turn` and `POST /api/agent/artifact-action` as dedicated routes with their own state model. |
| Artifact registry as structured contract | Slice has one artifact type with a typed payload, a registry mapping `kind → component`, and an interaction state lifecycle. |
| Chat surface as layout slot | Slice requires the chat slot to be present on at least one route (and ideally all of them) so the host can engage. |
| Tool use structured from day one | Slice has one registered tool with Zod input/output schemas, a dispatcher, and the tool-result-flows-back pattern. |
| Memory hooks in the agent loop | Slice has both a read hook (the `read_memory` tool) and a write hook (the artifact-confirmation path that writes to `memory_facts`). |
| One action substrate | Slice's write goes through `requestAction()`, even though the gating is trivial at v1. |
| Provenance in memory | The fact written has `source='host_taught'`, `learned_from.source_message_id`, full Tier 1 metadata. |
| Output schema enforcement | Every LLM tool input/output, every artifact payload, every API request/response is validated by Zod. |
| Voice doctrine referenced | The system prompt for the agent loop pulls from the consolidated voice doc (the doc itself is shipped at v1 — see Method-in-Code §"the voice doctrine document"). |
| Defensive Channex preserved | The slice doesn't touch Channex but the dispatcher pattern is built such that any Channex-bound tool added later goes through the existing safe-restrictions / env-gate / `channex_outbound_log` path. |
| Foundational hygiene fixes | Slice includes the `actor_id` column on `messages` plus the Koast-template exclusion flag (per §8). |

A simpler slice ("agent receives a message, replies with text, no tools, no artifact") would force only ~half of these. A more ambitious slice ("agent does everything") would unbound the work and risk shipping nothing. This slice is the minimum that proves the architecture.

---

## 2. The agent loop request flow

### 2.1 Endpoint surface

**DECISION**: two new routes under `/api/agent/`:

```
POST /api/agent/turn               — host sends a chat message; server streams the response
POST /api/agent/artifact-action    — host interacts with an artifact (confirm/edit/dismiss)
GET  /api/agent/conversations/:id  — fetch a conversation's turn history (read; no streaming)
```

Plus one route for stream resumption / replay (post-v1, but the request-id token surfaces in the v1 response so resumption is possible later).

The agent layer lives at `src/app/api/agent/` parallel to existing routes (`/api/pricing`, `/api/messages`, etc.). Per Method-in-Code §"the agent loop": *"The agent layer is a peer to the existing API layer, not buried inside it. The agent gets its own dedicated routes with its own state model, calling into the existing data and operational layers rather than being scattered across them."*

**Request shape for `POST /api/agent/turn`** (validated by Zod):

```typescript
const TurnRequestSchema = z.object({
  conversation_id: z.string().uuid().nullable(), // null to start a new conversation
  message: z.string().min(1).max(8000),
  // The frontend can hint context (e.g. "host is currently looking at /properties/[id]")
  // so the agent can pre-resolve property references; not required but improves UX.
  ui_context: z.object({
    active_route: z.string().optional(),
    active_property_id: z.string().uuid().optional(),
  }).optional(),
});
```

**Response shape**: not JSON. Server-Sent Events (SSE) stream — see §3.

**Request shape for `POST /api/agent/artifact-action`**:

```typescript
const ArtifactActionRequestSchema = z.object({
  artifact_id: z.string().uuid(),
  action: z.enum(['confirm', 'edit', 'dismiss']),
  // For 'edit', the payload carries the modified fact. Schema depends on artifact kind.
  payload: z.record(z.unknown()).optional(),
});
```

**Response**: standard JSON. The artifact-action route is *not* streamed because it's a discrete commit, not a model turn.

### 2.2 Anthropic SDK integration

**DECISION**: model `claude-sonnet-4-5-20250929` at v1, migrate to Sonnet 4.6 when promoted (already in `@anthropic-ai/sdk@0.80.0` dep range). Reasoning: matches what the existing `messaging.ts:generateDraft()` and `reviews/generator.ts` use today (`claude-sonnet-4-20250514`); upgrade in lockstep. Opus is overkill for v1 (the slice's reasoning is shallow); Haiku is too small for tool use with multi-turn stable behavior.

**DECISION**: features enabled:

| Feature | Enabled? | Reasoning |
|---|---|---|
| `stream: true` | Yes — non-negotiable | Method-in-Code §"streaming-first infrastructure" |
| `tools: [...]` | Yes | Method-in-Code §"tool use is structured from day one" |
| `tool_choice: { type: 'auto' }` | Yes | Let the model decide whether to use the tool; force-tool-use is anti-pattern |
| Prompt caching (`cache_control: { type: 'ephemeral' }` on the system prompt block + tools array block) | Yes | Per `claude-api` skill: every Claude API project should include prompt caching. The system prompt + tools schema + voice doctrine combine to a stable prefix that's identical across turns; caching saves real money once the agent runs at host scale. The conversation history (variable) sits after the cached prefix. |
| Extended thinking | No, at v1 | Adds latency and cost without value at this slice depth. Revisit when the agent reasons across more tools per turn. |
| Batch API | No | Each turn is interactive. |

**Cache structure for the prompt**:

```
System prompt (cached):
  [voice doctrine] +
  [available tools manifest, human-readable] +
  [stakes / honesty rules] +
  ["You are Koast..." identity prefix]

Tools array (cached):
  [read_memory tool definition]

Messages (not cached, varies per turn):
  [conversation history] +
  [latest host message]
```

The cache breakpoints are placed such that the system prompt + tools are always cache hits after the first turn of each agent worker process; only the messages array varies.

### 2.3 Conversational state

**DECISION**: state lives in Postgres. New tables:

```sql
-- migration NEW: agent_conversations + agent_turns
CREATE TABLE agent_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mode is set per-host but can be overridden per-conversation later (v2);
  -- at v1 it's always read from the host's setting.
  voice_mode  text NOT NULL DEFAULT 'neutral'
    CHECK (voice_mode IN ('neutral', 'learned')),
  status      text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  title       text,                          -- nullable; agent may auto-title later
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_conversations_user_recent
  ON agent_conversations(user_id, updated_at DESC);

CREATE TABLE agent_turns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES agent_conversations(id) ON DELETE CASCADE,
  -- 'user' | 'assistant' | 'tool_result' (tool_result is internal — flattened
  -- into the same conversation_id but the model sees them as part of the
  -- assistant turn's message block).
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool_result')),
  -- Full structured content. For 'user': { type: 'text', text: '...' }.
  -- For 'assistant': array of content blocks (text, tool_use, artifact-emit).
  -- For 'tool_result': { tool_use_id, content }.
  content         jsonb NOT NULL,
  -- Per-turn metadata: token counts, model, tools called, artifact ids emitted,
  -- audit log row ids. Used for cost tracking, replay, and inspection.
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_turns_conversation_created
  ON agent_turns(conversation_id, created_at);

ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own conversations"
  ON agent_conversations FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users access turns of own conversations"
  ON agent_turns FOR ALL
  USING (conversation_id IN (
    SELECT id FROM agent_conversations WHERE user_id = auth.uid()
  ));
```

Scoping: per-host (`user_id` on the conversation). v1 doesn't have multi-user; when it does (Phase 3), turns will need an `actor_id` column the same way `messages` does (per §8).

**No Redis at v1, no in-memory state.** Reasoning: every turn fully reconstructs the model's context from `agent_turns` rows. Postgres latency for "fetch last N turns of conversation X" is well under 50ms with the index. Adding Redis adds infra without solving a problem the slice has. The Method-in-Code §"How we work" principle "diagnose before you build" applies — we're not optimizing pre-bottleneck.

**ALTERNATIVES — discuss before commit**:
- *Streaming the assistant turn's incremental content into `agent_turns` as the stream progresses* (so resumed clients can read partial state) vs *storing only the final assistant turn after the stream completes*. v1 recommendation: the latter. Partial-stream persistence is a Phase 2+ concern when stream resumption matters. The downside: if the server crashes mid-stream, the conversation has the user's turn but no assistant reply, and the host has to retry. Acceptable at v1 given the slice's scope.

### 2.4 Tool dispatch within a single turn

The slice runs the **agent loop synchronously within a single HTTP request**. No async job queue at v1. The flow inside one `POST /api/agent/turn`:

```
1. Persist the user turn (insert row in agent_turns, role='user').
2. Build the model context: system prompt (cached) + tools (cached) +
   messages (the conversation's existing turns + the new user turn).
3. Open Anthropic stream. Start emitting SSE events to the client.
4. Read model events:
   a. content_block_delta with text → emit SSE event 'token' with the delta.
   b. content_block_start with type='tool_use' → buffer the tool call;
      emit SSE event 'tool_call_started' with the tool name + a tool_use_id.
   c. content_block_stop on a tool_use block → execute the tool handler
      synchronously (with timeout), emit SSE event 'tool_call_completed'
      with the result summary, append a 'tool_result' message to the
      conversation context.
   d. message_stop → if any tool_use blocks fired, the model isn't done
      yet — open a new stream with the tool_result(s) appended. Loop
      back to step 4. If no tool_use blocks fired (or all tool results
      processed and the model's final message is plain text + artifact
      blocks), proceed to step 5.
5. Persist the assistant turn (full content blocks, including any artifact
   emissions, into agent_turns role='assistant').
6. Persist any artifact emissions into agent_artifacts (see §5).
7. Emit SSE event 'done' with the assistant turn id, artifact ids, audit
   references. Close the stream.
```

**Tool execution is synchronous** within the turn. A tool handler that takes longer than ~5s should set its timeout and either return a partial result or fail; v1's `read_memory` is a pure DB read and finishes in <50ms.

**Multi-turn tool loop limit**: v1 caps at 5 tool-use rounds within a single turn to prevent runaway loops. If the model exceeds this, the loop breaks and the response includes a refusal block (see §2.5).

### 2.5 Error handling

**Three error classes**:

1. **Anthropic API errors** (rate limit, server error, model overloaded). The stream emits an `error` SSE event with the structured error metadata; the client surfaces a generic "Koast hit a hiccup — try again" message with a retry button. The user turn IS persisted; the assistant turn is NOT (so retry doesn't double-charge the conversation). Metadata is logged to `agent_audit_log` so the team can see error rates.
2. **Tool errors** (handler throws, validation fails, tool times out). The error is captured as a structured `tool_result` with `is_error: true` and a textual error message. The model sees this and decides what to do — usually it surfaces the failure to the host and asks how to proceed. This implements Method-in-Code §"refusal fallbacks at every LLM call" — the model has an honest fallback rather than fabricating.
3. **Network failures mid-stream** (client disconnects). Server detects via `request.signal.aborted`. Any in-flight tool calls are allowed to complete (so DB state isn't corrupted) but no further model output is consumed. The user turn is persisted; the assistant turn is persisted up to the last completed content block plus a metadata flag `interrupted: true`. The client can request the conversation later and see what completed.

**The refusal-fallback pattern from Belief 5** is explicit in the system prompt (per §2.2):

> *If you cannot ground a response in retrieved memory or tool output, respond honestly with what you don't yet know and what you'd need to find out. Don't fabricate. Use the structured `refusal` content type in your response (the registered tool/output schema documents the shape) when you genuinely can't answer.*

This isn't a separate tool — it's a discipline imposed via the system prompt + the output schema enforcement. If the model's text content fails grounding (per Belief 5 §7d's "grounding check before surface"), the server rejects the assistant turn and re-invokes with a clarifying instruction. Grounding check at v1 is narrow: any *named fact* the model claims about a property/guest/booking must be traceable to a tool result or a memory read in the current turn. v1 implements this as a post-hoc string-match check (model says "Villa Jamaica's WiFi is X" → check that "X" appears in a `read_memory` tool result this turn). Stricter grounding (semantic verification) is Phase 2+.

---

## 3. The streaming contract

### 3.1 Transport — SSE vs websockets vs Supabase realtime

**DECISION**: Server-Sent Events (SSE) over a streaming HTTP response.

**Reasoning**:

- *Simplicity*. SSE is one-way (server → client) which fits the agent loop (client → server is one HTTP request; server → client is the streaming response). Websockets are bidirectional and carry connection-lifecycle complexity Koast doesn't need. SSE's lifecycle is the HTTP request lifecycle.
- *Next.js compatibility*. Next.js 14 App Router supports streaming responses natively via `Response` objects backed by `ReadableStream`. The serverless edge runtime supports them. No new infra.
- *Browser native*. The browser ships `EventSource`, but for our case `fetch()` with streaming response (`response.body.getReader()`) is preferred because it lets the client send POST bodies (EventSource is GET-only). The client codes against `fetch` + a chunked-text reader.
- *Anthropic SDK fit*. The SDK's streaming response is event-stream-shaped already; SSE forwards model events to the client with minimal transformation.
- *Supabase realtime is the wrong shape*. Realtime is broadcast / DB-change-notification, designed for many-clients-watching-one-thing. The agent loop is one-client-watching-one-stream, started by an HTTP request. Forcing realtime here would mean publishing model deltas to a per-conversation channel that only one client reads — overhead with no benefit. Reserve Supabase realtime for actual broadcast use cases (a future "share calendar with co-host" feature).
- *Reverse proxy / serverless considerations*. Vercel's serverless platform supports streaming responses up to a maximum duration. Long agent turns may need the Edge runtime (longer streaming windows) or eventually a self-hosted streaming proxy. v1 starts on Vercel default; if turns regularly exceed limits, migrate the agent route to Edge.

**ALTERNATIVES — flagged**:
- *Anthropic Agent SDK / Vercel AI SDK*. These wrap the streaming concerns. Not chosen at v1 because they impose abstractions that make integrating with the bespoke action substrate, audit feed, and artifact registry harder. Roll our own thin SSE; reuse the Anthropic SDK for the model call. If implementation reveals real value in either SDK, revisit.

### 3.2 The event shape

**DECISION**: every SSE event has the same envelope: `{ type, ...payload }` serialized as JSON.

```typescript
// Discriminated union, validated by Zod at both server (emit) and client (consume).
type AgentStreamEvent =
  | { type: 'turn_started'; turn_id: string; conversation_id: string }
  | { type: 'token'; delta: string }
  | { type: 'tool_call_started'; tool_use_id: string; tool_name: string; input_summary: string }
  | { type: 'tool_call_completed'; tool_use_id: string; success: boolean; result_summary: string }
  | { type: 'artifact'; artifact_id: string; kind: ArtifactKind; payload: unknown }
  | { type: 'done'; turn_id: string; artifact_ids: string[]; audit_ids: string[] }
  | { type: 'error'; code: string; message: string; recoverable: boolean }
  | { type: 'refusal'; reason: string; suggested_next_step: string | null }
;
```

Each event is wire-formatted as:

```
data: {"type":"token","delta":"Got "}
data: {"type":"token","delta":"it"}
data: {"type":"artifact","artifact_id":"abc","kind":"property_knowledge_confirmation","payload":{...}}
data: {"type":"done",...}
```

Per the SSE protocol, each event is `data: <json>\n\n`. No event-id or retry directives at v1; the client treats stream interruption as "open a new turn manually."

**Payload notes per event type**:

- `token.delta`: a string fragment to append to the in-progress assistant message bubble.
- `tool_call_started.input_summary`: a host-readable one-liner like *"Looking up what I know about Villa Jamaica's front door..."* — derived server-side from the tool name + input. Surfaced in the chat as a transient indicator. Not the raw tool input (which may be uninteresting or noisy).
- `tool_call_completed.result_summary`: a similar one-liner — *"Found 0 facts on record."* — produced by the tool handler. The full result feeds the model; only a summary feeds the UI.
- `artifact.payload`: the typed payload for the artifact kind (see §5). Validated at emit and consume.
- `refusal`: emitted instead of (or alongside) text when the model can't ground. Distinct from `error`.

### 3.3 Frontend consumption

The chat component opens the stream with:

```typescript
const response = await fetch('/api/agent/turn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id, message, ui_context }),
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() ?? ''; // last fragment may be partial
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = AgentStreamEventSchema.parse(JSON.parse(line.slice(6)));
    handleEvent(event);
  }
}
```

State management: the chat component holds the in-progress assistant turn as local React state. On `token`, append to the bubble's text. On `artifact`, mount the artifact component inline using the registry (see §5). On `done`, mark the turn complete and clear in-progress state.

Tool calls render as transient indicator chips in the bubble: *"Looking up Villa Jamaica's front door..."* → resolves to *"No prior knowledge found."* The chips fade after the tool completes, leaving a subtle "Koast checked: 0 facts" annotation.

Mid-stream tool calls don't pause the text rendering visually — the chip appears in the bubble while the next tokens continue arriving (because the server has already synthesized the next model context). This matches the experiential bar from Method-in-Code §"experiential bar applied to every new surface."

**Backpressure and cancellation**:
- *Cancel button*: while the stream is in flight, the chat's send button transforms into a stop button. Pressing it calls `controller.abort()` on the fetch request. Server detects `request.signal.aborted` (per §2.5) and persists the partial turn with `interrupted: true`.
- *In-flight tool calls* on cancel: handled per §2.5 — allowed to complete to avoid corrupted DB state. v1's only tool is `read_memory` (idempotent, fast); future write-tools must declare cancellation behavior in their tool spec (see §4).
- *Backpressure*: SSE has no protocol-level backpressure; the client reads as fast as it can. If the model produces tokens faster than the client can render, React's batching handles it. If the client tab is backgrounded, browsers throttle JavaScript; the stream buffers in network layer queues up to the system's TCP buffer. Acceptable at v1.

**ALTERNATIVES — flagged**:
- *Resumption tokens*. Clients reconnecting mid-stream get the rest of the response. Not in v1; if the host's connection dies they retry. Phase 2 work.

---

## 4. The tool dispatch contract

### 4.1 Tool registration shape

**DECISION**: tools are registered in a dedicated module `src/lib/agent/tools/index.ts` that exports a `toolRegistry` array. Each tool definition has the shape:

```typescript
import { z } from "zod";

export interface ToolDefinition<I = unknown, O = unknown> {
  // Stable identifier shown to the model. snake_case.
  name: string;
  // One-paragraph description shown to the model. The model decides whether
  // to call this tool based on the description; write it carefully.
  description: string;
  // Zod schema for the tool's input. The Anthropic tool definition's
  // input_schema is derived from this via zod-to-json-schema.
  input_schema: z.ZodType<I>;
  // Zod schema for the tool's output. Used to validate the handler's
  // return value before passing back to the model.
  output_schema: z.ZodType<O>;
  // The handler. Receives validated input + an execution context that
  // carries the host_id, conversation_id, supabase client, etc.
  handler: (input: I, ctx: ToolContext) => Promise<O>;
  // Action substrate integration: what stakes class does this tool fall
  // into? Most read tools are 'read'. Write tools name their action_type
  // for the requestAction() module to look up.
  action: ReadAction | WriteAction;
  // Cancellation behavior. 'idempotent' = safe to abandon mid-flight.
  // 'requires_completion' = handler must finish to avoid corrupted state.
  cancellation: 'idempotent' | 'requires_completion';
  // Per-tool data sufficiency / refusal hooks (Belief 5 §7e). When the
  // tool can't produce a confident output, it returns a structured
  // 'insufficient_data' result rather than fabricating.
  data_sufficiency_check?: (input: I, ctx: ToolContext) => Promise<{
    sufficient: boolean;
    reason?: string;
  }>;
}

interface ReadAction { kind: 'read'; }
interface WriteAction {
  kind: 'write';
  action_type: string;     // The key in the stakes registry (e.g., 'memory.write', 'pricing.apply')
}

interface ToolContext {
  host_id: string;
  conversation_id: string;
  turn_id: string;
  supabase: SupabaseServiceClient;
  // For audit: the actor_id is always the host at v1 (no agent-as-actor yet).
  actor_id: string;
}
```

The Anthropic tool array is built at server start by mapping each `ToolDefinition` to:

```typescript
{
  name: def.name,
  description: def.description,
  input_schema: zodToJsonSchema(def.input_schema),
}
```

Per turn, the tools array is included in the cached prefix (see §2.2 caching). When the model emits a `tool_use` block, the dispatcher:

1. Looks up `toolRegistry.find(t => t.name === toolUseBlock.name)`.
2. Validates `toolUseBlock.input` against `def.input_schema` (Zod parse). On parse failure, sends a `tool_result` with `is_error: true` and a structured "your input didn't match the expected shape" message; the model will re-attempt or surface to the host.
3. Calls `def.handler(input, ctx)`.
4. Validates the handler's return value against `def.output_schema`. Same error pattern on parse failure.
5. Wraps the result as a `tool_result` content block and feeds the next stream iteration.

**ALTERNATIVES — flagged**:
- *Tool definitions in JSON files* vs *TypeScript modules*. TS chosen because Zod schemas live in TS and `zod-to-json-schema` produces the model-facing JSON. JSON-file authoring would split the schema definition from the handler and create drift.

### 4.2 The first tool: `read_memory`

**Tool definition** (in `src/lib/agent/tools/read_memory.ts`):

```typescript
const ReadMemoryInputSchema = z.object({
  // Entity scope. v1 supports property only; guests/host/vendor scopes
  // ship in later slices.
  entity_type: z.enum(['property']),
  // The agent passes the property's UUID (resolved from a prior tool
  // call or from ui_context). v1 does NOT support property name lookup
  // here — that's a separate tool (resolve_property_reference) added later.
  entity_id: z.string().uuid(),
  // Sub-entity narrows the search (e.g., 'front_door', 'wifi_router',
  // 'parking'). NULL means all facts about this property.
  sub_entity_handle: z.string().nullable().optional(),
  // Attribute narrows further (e.g., 'unlock_mechanism' for the front
  // door). NULL means all attributes for the sub-entity.
  attribute: z.string().nullable().optional(),
});

const FactSchema = z.object({
  fact_id: z.string().uuid(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  sub_entity_handle: z.string().nullable(),
  attribute: z.string(),
  value: z.unknown(),                   // typically text; jsonb at the DB level
  source: z.enum(['host_taught', 'inferred', 'observed']),
  confidence: z.number().min(0).max(1),
  learned_at: z.string(),               // ISO timestamp
  last_used_at: z.string().nullable(),
});

const ReadMemoryOutputSchema = z.object({
  facts: z.array(FactSchema),
  data_sufficiency: z.object({
    sufficient: z.boolean(),
    fact_count: z.number(),
    reason_if_insufficient: z.string().nullable(),
  }),
});

export const readMemoryTool: ToolDefinition<
  z.infer<typeof ReadMemoryInputSchema>,
  z.infer<typeof ReadMemoryOutputSchema>
> = {
  name: 'read_memory',
  description: `Retrieve structured facts from accumulated memory about a property.
Use this when you need to know what the host has previously taught Koast — property
quirks, hardware idiosyncrasies, neighborhood notes, vendor mix, or seasonal
behavior. Each fact carries provenance (source: host_taught / inferred / observed)
and a confidence score. Filter by sub_entity_handle (like 'front_door' or 'wifi_router')
or attribute (like 'unlock_mechanism' or 'password') to narrow results.`,
  input_schema: ReadMemoryInputSchema,
  output_schema: ReadMemoryOutputSchema,
  action: { kind: 'read' },
  cancellation: 'idempotent',
  handler: async (input, ctx) => {
    let q = ctx.supabase.from('memory_facts')
      .select('id, entity_type, entity_id, sub_entity_handle, attribute, value, source, confidence, learned_at, last_used_at, status')
      .eq('entity_type', input.entity_type)
      .eq('entity_id', input.entity_id)
      .eq('status', 'active');           // exclude superseded facts
    if (input.sub_entity_handle) q = q.eq('sub_entity_handle', input.sub_entity_handle);
    if (input.attribute) q = q.eq('attribute', input.attribute);
    const { data, error } = await q.order('learned_at', { ascending: false }).limit(50);
    if (error) throw new Error(`memory_facts query failed: ${error.message}`);
    const facts = (data ?? []).map(row => ({
      fact_id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      sub_entity_handle: row.sub_entity_handle,
      attribute: row.attribute,
      value: row.value,
      source: row.source as 'host_taught' | 'inferred' | 'observed',
      confidence: Number(row.confidence),
      learned_at: row.learned_at,
      last_used_at: row.last_used_at,
    }));
    // Update last_used_at on retrieved facts so memory tracks usage patterns.
    if (facts.length > 0) {
      await ctx.supabase.from('memory_facts')
        .update({ last_used_at: new Date().toISOString() })
        .in('id', facts.map(f => f.fact_id));
    }
    return {
      facts,
      data_sufficiency: {
        sufficient: facts.length > 0,
        fact_count: facts.length,
        reason_if_insufficient: facts.length === 0
          ? 'No facts on record for this scope yet.'
          : null,
      },
    };
  },
};
```

The data_sufficiency block is the Belief 5 §7e pattern made explicit on every tool. The model reads this and decides how to proceed (refuse vs gracefully proceed with a tighter claim).

### 4.3 Tool errors flow back into the conversation

When a tool handler throws or returns an output that fails schema validation, the dispatcher sends back a `tool_result` content block with `is_error: true`:

```json
{
  "type": "tool_result",
  "tool_use_id": "<id>",
  "content": "memory_facts query failed: <error message>",
  "is_error": true
}
```

The model sees this and decides what to do. For `read_memory` errors specifically — likely a transient DB issue — the model will typically apologize and ask the host to try again, or proceed without the memory and note that it couldn't check.

The dispatcher also writes the error to `agent_audit_log` with `outcome: 'tool_error'` so error rates are measurable.

**ALTERNATIVES — flagged**:
- *Auto-retry on transient errors* (network blips, Supabase connection resets) before giving up to the model. v1: no auto-retry — the model handles it. Phase 2: add a retry policy per tool.

---

## 5. The artifact registry's first contract

### 5.1 How the agent declares an artifact

**DECISION**: artifacts are emitted as a **special content block in the model's response**, not as a tool call. The model uses a typed text-tag pattern:

```
<artifact kind="property_knowledge_confirmation">
{
  "property_id": "bfb0750e-9ae9-4ef4-a7de-988062f6a0ad",
  "sub_entity_type": "door",
  "sub_entity_handle": "front_door",
  "attribute": "unlock_mechanism",
  "value": "pull horizontally — hurricane door, sticks if pulled straight",
  "source": "host_taught",
  "rationale": "Host explicitly taught this in the current message."
}
</artifact>
```

The server's stream parser detects the `<artifact ...>...</artifact>` envelope, extracts and validates the JSON payload against the registered artifact schema for that `kind`, persists an `agent_artifacts` row, and emits an SSE `artifact` event to the client. The text tags themselves are NOT passed through to the client's text rendering — the parser swallows them.

**Reasoning for this approach over a tool-call-emits-artifact pattern**:

- Artifacts are *part of the response message*, not tool calls. The host is being shown something, not the agent invoking a side effect.
- The model already produces inline structured content (text + tool_use + tool_result blocks). An artifact is a fourth block kind; using a text-tag wrapper inside a regular text block keeps the model's content-block model intact while signaling "this is structured."
- Tool-call-emits-artifact would mean every artifact emission is a separate model round trip (tool_use → tool_result → continue), which doubles latency and complicates the stream.

The system prompt teaches the model the artifact pattern explicitly, with the available kinds and their schemas. v1 has one kind.

**ALTERNATIVES — flagged**:
- *Use Anthropic's structured output (JSON schema response format) for the entire response*. Not chosen because the response is a hybrid of free text + structured artifacts; forcing the entire turn to be JSON loses the natural text streaming.
- *Server-side post-processing*: the model produces text only; the server runs a second LLM pass to extract artifact-worthy structures. Not chosen because it's brittle, doubles the cost, and the model can be taught to emit structure inline cleanly.

### 5.2 The first artifact: `property_knowledge_confirmation`

**Schema** (in `src/lib/agent/artifacts/property_knowledge_confirmation.ts`):

```typescript
export const PropertyKnowledgeConfirmationPayloadSchema = z.object({
  // Where the proposed fact will scope.
  property_id: z.string().uuid(),
  // Sub-entity type — controlled vocabulary mirroring the
  // `memory_facts.sub_entity_type` CHECK constraint. NULL means the
  // fact scopes to the property as a whole (no sub-entity narrowing).
  // Vocabulary intentionally narrow at v1; expand via migration when
  // new types prove out. See §13 for the rationale.
  sub_entity_type: z.enum([
    'front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances',
  ]).nullable(),
  // Free-text disambiguator (e.g., 'primary_router' when
  // sub_entity_type='wifi'). Optional. NULL when not needed.
  sub_entity_id: z.string().min(1).max(50).nullable(),
  attribute: z.string().min(1).max(50),
  value: z.string().min(1).max(2000),
  source: z.literal('host_taught'),    // v1: only host_taught artifacts
  // Why the agent thinks this is worth saving — for the host's review.
  rationale: z.string().min(1).max(500),
});

export type PropertyKnowledgeConfirmationPayload =
  z.infer<typeof PropertyKnowledgeConfirmationPayloadSchema>;
```

**Storage** (new table):

```sql
CREATE TABLE agent_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES agent_conversations(id) ON DELETE CASCADE,
  turn_id         uuid NOT NULL
    REFERENCES agent_turns(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  payload         jsonb NOT NULL,
  -- Lifecycle: 'pending' (just emitted, host hasn't acted), 'confirmed'
  -- (host clicked save), 'edited' (host modified before saving), 'dismissed'
  -- (host rejected), 'expired' (kind-specific timeout, none at v1).
  state           text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'confirmed', 'edited', 'dismissed', 'expired')),
  -- For 'confirmed' and 'edited': what was actually committed (may differ
  -- from payload if the host edited).
  resolved_payload jsonb,
  -- For 'edited' / 'confirmed': the entity id of what was created
  -- (e.g., the memory_facts.id when a property_knowledge_confirmation is saved).
  resolved_entity_id text,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_artifacts_turn ON agent_artifacts(turn_id);
CREATE INDEX idx_agent_artifacts_state ON agent_artifacts(state) WHERE state = 'pending';

ALTER TABLE agent_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access artifacts of own conversations"
  ON agent_artifacts FOR ALL
  USING (conversation_id IN (
    SELECT id FROM agent_conversations WHERE user_id = auth.uid()
  ));
```

### 5.3 Frontend resolution

**Registry** (in `src/components/agent/artifacts/registry.ts`):

```typescript
import { z } from "zod";
import PropertyKnowledgeConfirmation from "./PropertyKnowledgeConfirmation";

export const artifactRegistry = {
  property_knowledge_confirmation: {
    schema: PropertyKnowledgeConfirmationPayloadSchema,
    Component: PropertyKnowledgeConfirmation,
  },
} as const;

export type ArtifactKind = keyof typeof artifactRegistry;

export function resolveArtifact(kind: string, payload: unknown) {
  const entry = artifactRegistry[kind as ArtifactKind];
  if (!entry) {
    return { Component: UnknownArtifactFallback, payload, error: 'unknown_kind' };
  }
  const parsed = entry.schema.safeParse(payload);
  if (!parsed.success) {
    return { Component: UnknownArtifactFallback, payload, error: 'invalid_payload' };
  }
  return { Component: entry.Component, payload: parsed.data, error: null };
}
```

**Fallback** for unknown kinds: a small inline notice in the chat — *"Koast tried to render something I don't know how to display yet."* This is a soft failure; the conversation continues. The metadata is captured in `agent_audit_log` so the team can see when artifact mismatches happen (likely during deploys when frontend and backend skew).

### 5.4 Interaction flow

`PropertyKnowledgeConfirmation` component (sketch):

```typescript
function PropertyKnowledgeConfirmation({ artifact_id, payload, state, onAction }: Props) {
  return (
    <KoastCard variant="elevated" padding={16}>
      <SectionLabel>Save this to memory?</SectionLabel>
      <FactPreview
        property={payload.property_id}
        scope={`${payload.sub_entity_type} · ${payload.sub_entity_handle}`}
        attribute={payload.attribute}
        value={payload.value}
      />
      <Rationale>{payload.rationale}</Rationale>
      {state === 'pending' && (
        <ButtonRow>
          <KoastButton variant="primary" onClick={() => onAction('confirm')}>
            Save
          </KoastButton>
          <KoastButton variant="ghost" onClick={() => setEditing(true)}>
            Edit before saving
          </KoastButton>
          <KoastButton variant="ghost" onClick={() => onAction('dismiss')}>
            Don't save
          </KoastButton>
        </ButtonRow>
      )}
      {state === 'confirmed' && <SavedIndicator factId={resolved_entity_id} />}
      {state === 'dismissed' && <DismissedIndicator />}
    </KoastCard>
  );
}
```

The `onAction` prop calls `POST /api/agent/artifact-action` with the action and (for `edit`) the modified payload. The endpoint validates against the same schema, runs the action through `requestAction()` (see §7), commits the underlying write, and updates the artifact's state.

The artifact state lives in `agent_artifacts.state` and is mirrored into the React Query cache on the client. On state transition (pending → confirmed/edited/dismissed), the component re-renders with the new affordances.

When the host comes back to a past conversation, the artifacts in the turn history render in their final state — confirmed artifacts show the saved indicator + a deep link to the memory inspector entry; dismissed artifacts show a faded "Not saved" annotation. Past conversations are immutable visually but the data is exactly what was committed at the time.

**Interaction state lifecycle**:

```
pending ─→ confirmed (host clicked save; resolved_payload = original payload)
        ─→ edited    (host modified; resolved_payload = modified payload, action commits)
        ─→ dismissed (host rejected)
        ─→ expired   (kind-specific; not applicable to property_knowledge_confirmation)
```

`pending` is the only state from which transitions are allowed; once resolved, the artifact is immutable. If the host wants to "un-save" a fact, that's a separate flow (memory inspector → delete fact); it doesn't reopen the artifact.

---

## 6. The memory hook points

### 6.1 Read points in the agent loop

**v1 pattern**: memory is read **on demand via the `read_memory` tool**, not pre-fetched at the beginning of the turn.

**Reasoning**:

- Pre-fetching forces the agent loop to guess what's relevant. A turn that's about pricing doesn't need property quirks. The "fetch all memory for this conversation context" pattern bloats the prompt and ages poorly as memory grows.
- Tool-based fetching makes the retrieval explicit, debuggable, and source-attributed. The model's reasoning becomes "I should know what's already on file before proposing a save → call read_memory → respond informed by results."
- This matches Belief 3 §4d's "the agent's tool layer is the right scope for memory retrieval."

The model is taught (via system prompt) to call `read_memory` whenever it's about to:
- Propose a save (so duplicates are detected).
- Answer a host question that depends on property/guest/host facts.
- Reason about something that could plausibly already be on file.

**Pre-fetching at conversation level** (not turn level): the conversation context **does include** the host's `voice_mode` setting, the active route hint from `ui_context`, and the set of properties the host owns (resolved IDs by name → uuid). These are pre-fetched and inlined in the system prompt because they're cheap, small, and almost always relevant. That's not memory; it's session context. The boundary between session context and memory is: *if the data is per-host stable for the duration of the conversation, inline it; if the data is per-entity and changes over time, fetch via tool*.

### 6.2 Write points in the agent loop

**v1 pattern**: memory writes **never happen as a side effect of the model**. Every write goes through:

1. Agent emits an `artifact` (e.g., `property_knowledge_confirmation`) with the proposed write.
2. Host confirms (or edits) via the artifact UI.
3. Frontend calls `POST /api/agent/artifact-action`.
4. Server runs the action through `requestAction()` (§7).
5. Server commits the write.
6. Server updates the artifact's state.

This makes the human-in-the-loop explicit at the slice's experience tier. A future slice can add a `write_memory` tool with gradient-gated autonomy ("for low-stakes reversible facts, the agent can write directly without artifact confirmation, after host has approved N similar writes via artifact"). v1 doesn't expose that path — every memory write is host-confirmed.

**Inferred facts** (from the agent observing the conversation rather than the host explicitly teaching) are out of v1 scope but the schema supports them: `source = 'inferred'`. When the agent infers a fact, the same artifact-confirmation flow runs but the artifact framing is different ("I noticed something — should I remember it?").

### 6.3 The retrieval abstraction

**v1's contract is the `read_memory` tool's input/output schema** (§4.2). The shape is:

- **Input**: `{ entity_type, entity_id, sub_entity_handle?, attribute? }` — entity scope with progressive narrowing.
- **Output**: `{ facts: Fact[], data_sufficiency: { sufficient, fact_count, reason_if_insufficient } }` — facts with provenance + the data-sufficiency signal per Belief 5.

This is the *first instance* of the memory retrieval contract. The contract is intentionally narrow at v1 (one entity_type: property; single-attribute filter; no full-text search; no semantic similarity). Phase 2+ extends it:

- More entity types (`guest`, `host`, `vendor`, `booking`).
- Compound queries (`{ entity_types: [...], attributes: [...] }`).
- Freshness filters (`only facts learned in the last N days`).
- Cross-entity inference queries.

Until then, the contract is what's documented in §4.2. Other code paths (existing routes, future agent tools) call the same handler function as the tool, not via the model — they share the implementation, just not the dispatcher.

### 6.4 The `memory_facts` schema for v1

```sql
-- migration NEW: memory_facts (Tier 1 from Method-in-Code §"the memory architecture")
CREATE TABLE memory_facts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scoping. host_id is always set; entity_type + entity_id name what
  -- the fact is about; sub_entity_* narrows further.
  host_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type         text NOT NULL CHECK (entity_type IN ('host', 'property', 'guest', 'vendor', 'booking')),
  entity_id           uuid NOT NULL,        -- references vary by type; not FK at v1
  sub_entity_type     text,                  -- e.g., 'door', 'lock', 'wifi'
  sub_entity_handle   text,                  -- e.g., 'front_door', 'back_door'
  -- Optional guest narrowing for property facts ("Sarah noted the front
  -- door issue"). NULL when the fact isn't guest-specific.
  guest_id            uuid,
  -- The fact itself. attribute names what kind of thing this is;
  -- value is jsonb so values can be text, numeric, structured.
  attribute           text NOT NULL,        -- e.g., 'unlock_mechanism', 'wifi_password'
  value               jsonb NOT NULL,
  -- Provenance.
  source              text NOT NULL CHECK (source IN ('host_taught', 'inferred', 'observed')),
  confidence          numeric(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence BETWEEN 0 AND 1),
  -- learned_from JSONB carries the audit trail: which conversation turn
  -- taught this, which messages were sampled, which derivation produced
  -- the inferred value, etc. Mirrors pricing_rules.inferred_from.
  learned_from        jsonb NOT NULL DEFAULT '{}',
  -- Lifecycle.
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by       uuid REFERENCES memory_facts(id) ON DELETE SET NULL,
  learned_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_facts_entity
  ON memory_facts(entity_type, entity_id, status) WHERE status = 'active';
CREATE INDEX idx_memory_facts_sub_entity
  ON memory_facts(entity_type, entity_id, sub_entity_handle, attribute) WHERE status = 'active';
CREATE INDEX idx_memory_facts_host_recent
  ON memory_facts(host_id, learned_at DESC);

ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own memory" ON memory_facts FOR ALL
  USING (host_id = auth.uid());
```

Notes:
- The schema follows existing Supabase conventions exactly (snake_case, RLS, JSONB for flex shapes, timestamptz, Drizzle declaration mirrors the migration). Per Method-in-Code §"memory architecture": *"Memory schema follows existing Supabase conventions, does not introduce a new paradigm."*
- `entity_id` is `uuid` but not a FK — the type discriminates the target table. v1's only entity_type is `property`, but the schema is type-stable for future extension.
- `learned_from` JSONB starts simple at v1: `{ conversation_turn_id, source_message_text }` for `host_taught` facts. The shape extends as more sources land (`{ inferred_from: { algorithm, sample_size, ... } }` for inferred facts).
- The `guests` table from Method-in-Code §"the memory architecture" ships in this slice's migration set as a pre-allocated structure, even though no v1 capability writes to it. Reasoning: the foreign-key reference `memory_facts.guest_id` needs a target. Empty-but-shipped tables are common in the codebase (see `notifications` per Belief 3 §6a).

```sql
-- migration NEW: guests (back-population from bookings is a separate small migration)
CREATE TABLE guests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Resolution keys; at v1 we don't enforce uniqueness — the resolver
  -- worker (Phase 2) does that.
  email_normalized    text,
  phone_normalized    text,
  name_normalized     text,
  -- Source of record; updated as bookings/messages link in.
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guests_host ON guests(host_id);
CREATE INDEX idx_guests_resolution ON guests(host_id, email_normalized, phone_normalized);

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own guests" ON guests FOR ALL USING (host_id = auth.uid());
```

The `voice_patterns` table from Method-in-Code is *not* in this slice. Voice learning is a later slice; the table ships when its first writer ships.

---

## 7. The action substrate integration

### 7.1 The `requestAction` module

**Location**: `src/lib/action-substrate/request-action.ts`.

**v1 interface**:

```typescript
type ActionMode = 'silent' | 'requires_confirmation' | 'blocked';

interface RequestActionInput {
  host_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  // Where the action was initiated. Used for audit and for surfacing
  // the right confirmation UI affordance.
  source: 'agent_chat' | 'agent_artifact' | 'api_route' | 'worker';
  // The actor performing the action. v1: always the host. Phase 3+:
  // co-host / VA / agent-with-delegated-authority.
  actor_id: string;
  // For agent_artifact: the artifact id. The substrate uses this to
  // detect "host already confirmed via artifact" and treat as silent.
  context?: {
    artifact_id?: string;
    conversation_id?: string;
    turn_id?: string;
  };
}

interface RequestActionResult {
  mode: ActionMode;
  reason: string;                       // Human-readable; goes into audit + UI
  // For 'blocked': the structural reason (e.g., 'high_stakes_floor', 'env_gate_off').
  block_code?: string;
  // For 'requires_confirmation': the kind of confirmation needed.
  confirmation_kind?: 'artifact' | 'modal' | 'two_step';
  // What gets logged to the audit feed regardless of mode.
  audit: {
    autonomy_level: 'host_initiated' | 'host_confirmed' | 'agent_autonomous';
    stakes_class: 'low' | 'medium' | 'high';
    confidence: number;                  // [0..1]
  };
}

export async function requestAction(
  input: RequestActionInput
): Promise<RequestActionResult>;
```

The implementation consults:

1. The **stakes registry** (§7.2).
2. The **per-host calibration store** (`host_action_patterns`).
3. Any **action-specific gates** (e.g., env gates for Channex actions).

For v1's `memory.write` action: stakes class is `low` (reversible), but the registry declares `requires_confirmation_at_v1: true` so the substrate returns `requires_confirmation` with `confirmation_kind: 'artifact'` *unless* the call comes from `source: 'agent_artifact'` with a matching `context.artifact_id` whose state is being transitioned from `pending → confirmed/edited` (which means the host is right now confirming). In that case, the substrate returns `mode: 'silent'` because the host's current click *is* the confirmation.

This sounds clever; it's actually the only way the action substrate can model "the artifact-confirmation flow is the gate" without bypassing the substrate. Every gated path goes through `requestAction`, including the artifact-confirmation handler — but the handler signals "this call IS the gate" via `source` + `context`.

### 7.2 The stakes registry

**Location**: `src/lib/action-substrate/stakes-registry.ts`.

```typescript
export const stakesRegistry = {
  'memory.write': {
    stakes_class: 'low',
    reversibility: 'reversible_immediately',  // host can delete
    high_stakes_floor: false,
    requires_confirmation_at_v1: true,        // explicit teach-the-system step
    description: 'Persist a fact to the host\'s accumulated memory.',
  },
  // Future action types declared here. Examples for reference:
  // 'memory.delete':        { stakes_class: 'low', reversibility: 'soft', ... }
  // 'memory.supersede':     { stakes_class: 'low', reversibility: 'reversible_immediately', ... }
  // 'pricing.apply':        { stakes_class: 'medium', high_stakes_floor: false, env_gates: ['KOAST_ALLOW_BDC_CALENDAR_PUSH'], ... }
  // 'message.send':         { stakes_class: 'medium', reversibility: 'irreversible', ... }
  // 'booking.cancel':       { stakes_class: 'high', high_stakes_floor: true, ... }
  // 'property.delete':      { stakes_class: 'high', high_stakes_floor: true, ... }
} as const;

export type ActionType = keyof typeof stakesRegistry;
```

v1 has one entry. Phase 2 adds the ~40 wrappable agent tools' action types.

### 7.3 The `host_action_patterns` table

```sql
CREATE TABLE host_action_patterns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type     text NOT NULL,
  -- Outcome of the request_action call. 'confirmed' = host clicked save;
  -- 'modified' = host edited then saved; 'dismissed' = host rejected;
  -- 'silent' = autonomous (Phase 2+).
  outcome         text NOT NULL CHECK (outcome IN ('confirmed', 'modified', 'dismissed', 'silent')),
  -- Light fingerprint of payload for pattern matching. Not the full
  -- payload (which lives in agent_audit_log).
  payload_summary jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_host_action_patterns_lookup
  ON host_action_patterns(host_id, action_type, created_at DESC);
```

v1 writes to it but doesn't read calibration logic from it. The substrate's calibration logic at v1 is "stakes class + always require confirmation for memory writes." Phase 2 adds the calibration model (e.g., "host has confirmed 10 in a row → graduate to silent"). The substrate's contract doesn't change between v1 and v2 — only the implementation behind it.

### 7.4 The unified audit feed

**Location**: a new table `agent_audit_log` (named to suggest it's the agent's surface but designed to hold the unified feed; Phase 2 generalizes the name to `action_audit_log` if needed).

```sql
CREATE TABLE agent_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL,                -- v1: same as host_id
  action_type     text NOT NULL,
  payload         jsonb NOT NULL,
  source          text NOT NULL CHECK (source IN ('agent_chat', 'agent_artifact', 'api_route', 'worker')),
  -- Lifecycle
  autonomy_level  text NOT NULL CHECK (autonomy_level IN ('host_initiated', 'host_confirmed', 'agent_autonomous')),
  stakes_class    text NOT NULL CHECK (stakes_class IN ('low', 'medium', 'high')),
  outcome         text NOT NULL CHECK (outcome IN ('success', 'tool_error', 'gate_blocked', 'host_dismissed', 'cancelled')),
  confidence      numeric(3, 2),                -- nullable for non-LLM-driven actions
  -- For agent-emitted actions: the conversation/turn that produced it.
  conversation_id uuid REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id         uuid REFERENCES agent_turns(id) ON DELETE SET NULL,
  artifact_id     uuid REFERENCES agent_artifacts(id) ON DELETE SET NULL,
  -- For other action sources: free-form context.
  context         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_audit_host_recent
  ON agent_audit_log(host_id, created_at DESC);
CREATE INDEX idx_agent_audit_action_type
  ON agent_audit_log(action_type, created_at DESC);

ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own audit log" ON agent_audit_log FOR SELECT
  USING (host_id = auth.uid());
```

Every `requestAction` call writes one row. Frontend API routes that already have audit (e.g., `channex_outbound_log`) keep writing to those for their tooling-specific needs but ALSO write to `agent_audit_log` so the host-facing "what did Koast do" feed has one source. Per Method-in-Code §"the unified action audit feed": *"the current fragmentation gets unified into one feed that the host introspection UI reads from."*

The host introspection UI (`/koast/recent-activity`) is **not in this slice** — that's a Phase 1 closeout deliverable. The slice ships the audit substrate; the surface that reads from it is a separate work stream.

---

## 8. The foundational hygiene fixes

These ship with this slice's migrations, not in a separate work stream. Per Method-in-Code §"the pre-launch calibration debt": *"these are not architectural commitments. They are debts. They ship fixed before launch."* The slice forces them to ship now because deferring breaks voice learning later.

### 8.1 `actor_id` on `messages`

**Migration**:

```sql
-- migration NEW: messages.actor_id
ALTER TABLE messages
  ADD COLUMN actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN actor_kind text CHECK (actor_kind IN ('host', 'cohost', 'va', 'agent', 'channex_system'));

-- Index for voice-extraction filtering (later slice will use this).
CREATE INDEX idx_messages_actor ON messages(actor_kind, actor_id);

-- Back-population: existing rows. Reason: the test fleet is single-host
-- (Cesar) so all outbound rows where sender='property' are attributed
-- to that user. Inbound rows get actor_kind='channex_system' since the
-- "actor" is the OTA's relay, not the guest (the guest is the subject).
UPDATE messages SET
  actor_id = (SELECT user_id FROM properties WHERE id = messages.property_id LIMIT 1),
  actor_kind = CASE
    WHEN sender = 'property' THEN 'host'
    WHEN sender = 'guest' THEN 'channex_system'
    WHEN sender = 'system' THEN 'channex_system'
    ELSE 'host'
  END
WHERE actor_id IS NULL;
```

**Send-path wiring**: every route that inserts into `messages` gets `actor_id = host.id` (v1: always the host because no multi-user) and `actor_kind = 'host'`. When messaging_executor inserts a draft, `actor_kind = 'agent'` so voice extraction excludes it from the host's voice corpus. Routes touched:
- `src/app/api/messages/send/route.ts`
- `src/app/api/messages/threads/[id]/send/route.ts`
- `koast-workers/messaging_executor.py` (Python side)
- `src/lib/messages/sync.ts` and `src/lib/webhooks/messaging.ts` for inbound rows

### 8.2 Koast-template / agent-generated draft exclusion flag

The `actor_kind = 'agent'` value above doubles as the exclusion flag. Future voice-extraction worker filters with `WHERE actor_kind = 'host' AND sender = 'property'`. This filter doesn't exist yet (no extraction pipeline at v1) but the column is populated correctly so the filter works on day one when the pipeline ships.

Per Method-in-Code §"foundational hygiene fixes": *"actor_id added to messages: schema change, send-route wiring, back-population strategy for existing rows. Koast-generated draft exclusion: filter applied at any future extraction pipeline (not yet built, but the column or flag that makes it possible). These ship with the agent loop, not after."*

### 8.3 What's not fixed in this slice

Per the "What's NOT in scope" §1.2: the mocked pulse sparkline, point-estimate hero dollar amounts, and send-route `original_draft` capture are tracked separately and ship before launch but not in this slice. They're called out in Method-in-Code §"the pre-launch calibration debt" and have their own work-stream owners.

---

## 9. Defensive infrastructure preservation

The slice doesn't touch Channex. But the pattern this slice establishes is the pattern every later Channex-bound agent tool follows.

**The pattern**:

1. The agent tool's `action` field declares `kind: 'write'` and an `action_type` registered in the stakes registry.
2. The handler invokes existing operational code paths — never duplicates them. For Channex writes, the handler calls into `src/lib/channex/client.ts` which already inserts `channex_outbound_log` rows on every non-GET call (per Belief 4 §6).
3. The handler's call passes through `buildSafeBdcRestrictions` for any BDC-bound write, per the existing safe-restrictions discipline.
4. The handler respects `KOAST_ALLOW_BDC_CALENDAR_PUSH` env gate. If the gate is off, the handler returns a structured `tool_result` with `is_error: true` and a message explaining the gate is off — the agent surfaces this to the host as "Koast's BDC writes are still in protected mode; flip the env flag in Vercel when ready."
5. The audit row goes to BOTH `channex_outbound_log` (existing infrastructure for incident reconstruction) AND `agent_audit_log` (unified feed for host visibility). No double-write architectural problem because they serve different consumers.

**Why this matters at slice time even though Channex isn't exercised**:

- The dispatcher contract (§4.1) declares a tool's `action` field upfront. If a Channex tool is added in slice 2 without thinking through the action substrate integration, it would bypass safeguards.
- The `agent_audit_log` schema includes `source: 'agent_artifact' | 'api_route' | 'worker'` so existing API-route writes can be cross-logged without rearchitecting.
- The `requestAction` interface accepts arbitrary `action_type`. The first Channex tool added in slice 2 just declares `action_type: 'pricing.apply'` and the substrate's gate logic + audit logging Just Work.

The Method-in-Code commitment from §"the defensive Channex infrastructure" is honored:

> *"The BDC-clobber-incident response, the env-gate model, buildSafeBdcRestrictions pre-check, atomic Channex operation patterns, channex_outbound_log audit shape. Carries forward unchanged. Every agent action that touches Channex flows through these. The agent layer extends the patterns with agent-specific audit metadata."*

The "agent-specific audit metadata" extension is the `agent_audit_log` row's `conversation_id`, `turn_id`, `artifact_id` columns. Existing `channex_outbound_log` rows don't have those; the unified feed bridges them.

---

## 10. What this slice proves

For each Phase 1 architectural commitment, the slice forces it to be designed concretely:

| Phase 1 commitment | What this slice forces |
|---|---|
| **Streaming-first infrastructure** ✓ | SSE event format defined (§3.2). Frontend stream consumption pattern established (§3.3). Cancellation/backpressure decisions made. Adding non-streaming endpoints later is a step backwards from this baseline; the agent's request flow is streaming from day one. |
| **Agent layer as peer to API layer** ✓ | `/api/agent/turn`, `/api/agent/artifact-action`, `/api/agent/conversations/:id` — dedicated routes (§2.1). New tables (`agent_conversations`, `agent_turns`, `agent_artifacts`, `agent_audit_log`, `host_action_patterns`) live in the agent's namespace. The agent calls into existing operational layers via tools (§4); existing operational layers don't know about the agent. |
| **Artifact registry as structured contract** ✓ | One artifact kind defined with Zod schema (§5.2). Registry pattern established with frontend resolution + unknown-kind fallback (§5.3). Interaction state lifecycle defined (§5.4). Adding artifact kinds 2-5 is a one-file change per kind. |
| **Chat surface as layout slot** ✓ | The slice requires the chat slot to be present. The frontend work to add it spans the app shell (per Belief 2 §8) and is Phase 1 closeout work that this slice anchors. The slot isn't optional; the slice can't function without it. |
| **Tool use structured from day one** ✓ | `ToolDefinition<I, O>` interface with Zod schemas (§4.1). Dispatcher pattern (§2.4). One tool registered (`read_memory`, §4.2). The next 39 tools from Belief 6 §2 implement the same interface. |
| **Memory hooks in agent loop** ✓ | One read hook (the `read_memory` tool, §6.1). One write hook (the artifact-confirmation flow, §6.2). The retrieval abstraction's first contract documented (§6.3). The `memory_facts` schema with full Tier 1 metadata shipped (§6.4). |
| **One action substrate** ✓ | `requestAction()` module exposes the contract (§7.1). v1's write goes through it. Stakes registry initialized with one entry (§7.2). `host_action_patterns` table shipped (§7.3). The artifact-confirmation flow signals "this call IS the gate" via `source` + `context`, preserving the substrate's authority. |
| **Provenance in memory** ✓ | The fact written has `source='host_taught'`, `confidence=1.0`, `learned_from = { conversation_turn_id, source_message_text }`. Schema enforces non-null `source` and `confidence`; `learned_from` is a JSONB audit shape mirroring `pricing_rules.inferred_from`. The Method-in-Code §"provenance-enum convention extends across all memory writes" is honored from the first write. |
| **Output schema enforcement** ✓ | Zod everywhere: tool input, tool output, artifact payload, API request, API response, SSE event envelope. The `messaging.ts` / `reviews/generator.ts` "plain text returned and written raw" pattern from today is replaced with structured everything for the agent layer. |
| **Voice doctrine referenced** ✓ | The system prompt for the agent loop is built from a consolidated voice document (`docs/voice.md` — separate work stream, ships at v1 per Method-in-Code §"the voice doctrine document"). v1's agent uses Mode 2 (neutral) sourced from `DEFAULT_ONBOARDING_TEMPLATES`. The system prompt reads from the host's `voice_mode` setting on the conversation row. |
| **Defensive infrastructure preserved** ✓ | The dispatcher pattern is built such that any Channex-bound tool added later goes through existing safeguards (§9). The `agent_audit_log` schema is designed to coexist with `channex_outbound_log`, not replace it. Agent-specific audit metadata (conversation/turn/artifact ids) is additive. |
| **Foundational hygiene fixes shipped** ✓ | `actor_id` + `actor_kind` on messages (§8.1) ships with the slice's migrations. Voice-extraction exclusion flag (§8.2) populated correctly for both legacy and new rows. Future voice extraction works without re-migrations. |

---

## 11. What's deliberately out of scope

Restated for clarity (referenced in §1.2 with full reasoning):

- Multiple tools (just `read_memory`)
- Multiple artifact types (just `property_knowledge_confirmation`)
- Voice mode switch (uses the neutral default; learned mode falls back to neutral)
- Per-host calibration logic (substrate exists, calibration model is "stakes class + always confirm memory writes")
- Worker integration (workers don't go through the agent yet)
- The other ~39 agent tools from Belief 6 §2 (Phase 2 work)
- Mobile-specific UX refinement (responsive but not polished)
- Streaming UI motion and craft (works but not yet at the experiential bar)
- Stream resumption tokens (Phase 2+)
- Auto-retry on transient tool errors (Phase 2+)
- Long-conversation summarization / context truncation (Phase 2+)
- Memory write tool exposed directly to model (every memory write is artifact-confirmed at v1)
- Inferred facts (`source='inferred'`) — schema supports them; pipeline doesn't ship in this slice
- Agent-to-agent or agent-to-worker delegation (single agent loop only)
- Voice extraction / voice_patterns table (later slice)
- Memory inspector UI (`/memory` route) — separate Phase 1 closeout deliverable
- Recent activity UI (`/koast/recent-activity`) — separate Phase 1 closeout deliverable
- The mocked-pulse-sparkline / point-estimate-hero-dollar / `original_draft` capture calibration debts — separate Phase 1 closeout deliverables that block launch but not this slice

---

## 12. Implementation sequencing

The slice's work breaks into roughly nine pieces. Some are parallel; some have hard dependencies. A team of 1-2 engineers can probably ship this in 2-3 focused weeks; a larger team can parallelize.

### 12.1 Hard dependency graph

```
[1. Schema migrations]
        │
        ├──→ [2. Memory retrieval handler]
        │           │
        │           └──→ [4. Tool dispatcher + read_memory tool]
        │                       │
        ├──→ [3. Action substrate + audit feed schema]
        │           │
        │           └──→ [4. (continued)]
        │                       │
        │                       └──→ [5. Agent loop request handler (server)]
        │                                   │
        │                                   └──→ [6. SSE streaming protocol]
        │                                               │
        │                                               └──→ [7. Frontend chat shell + stream consumer]
        │                                                           │
        │                                                           └──→ [8. Artifact registry + first artifact component]
        │                                                                       │
        │                                                                       └──→ [9. Artifact-action route + memory write commit]

[Parallel work stream — independent of agent slice but blocks launch]:
        [voice doctrine doc consolidation] (referenced by §5 system prompt)
```

### 12.2 Milestone-by-milestone, what's testable

**Milestone 1 — Schema migrations land** (1 day-ish for an engineer who's done these before).
- New tables: `agent_conversations`, `agent_turns`, `agent_artifacts`, `agent_audit_log`, `host_action_patterns`, `memory_facts`, `guests`.
- Schema changes: `messages.actor_id`, `messages.actor_kind` + back-population query.
- Drizzle declarations matching migrations.
- *Testable*: migrations run cleanly forward; back-population of `messages.actor_id` produces non-null on all 90 existing rows; RLS policies block cross-user reads in a Supabase SQL session.

**Milestone 2 — Memory retrieval handler + memory write helper land** (1-2 days).
- `src/lib/memory/read.ts`: the implementation function (called by both the agent tool and any future API caller).
- `src/lib/memory/write.ts`: the commit function (called by the artifact-action route).
- Unit tests: insert facts, retrieve with various scopes, supersede a fact.
- *Testable*: `vitest`-style unit tests pass against a test Supabase database.

**Milestone 3 — Action substrate + stakes registry + audit log writer land** (1-2 days, parallelizable with Milestone 2).
- `src/lib/action-substrate/request-action.ts` with the v1 logic.
- `src/lib/action-substrate/stakes-registry.ts` with the `memory.write` entry.
- `src/lib/action-substrate/audit-writer.ts`.
- *Testable*: unit tests confirm `requestAction({ action_type: 'memory.write', source: 'agent_artifact', context: { artifact_id: 'pending-uuid' } })` returns `mode: 'silent'`, that `source: 'agent_chat'` returns `mode: 'requires_confirmation'`, that all calls write one audit row.

**Milestone 4 — Tool dispatcher + `read_memory` tool registered** (2-3 days).
- `src/lib/agent/tools/index.ts` with the dispatcher + registry pattern.
- `src/lib/agent/tools/read_memory.ts`.
- Unit tests for input/output schema validation, handler execution, error path.
- *Testable*: dispatcher invokes the handler given a synthetic Anthropic tool_use block; output schema validates; errors produce structured tool_result rows.

**Milestone 5 — Agent loop request handler (server)** (3-5 days).
- `src/app/api/agent/turn/route.ts` — POST handler with the agent loop pattern from §2.4.
- `src/app/api/agent/conversations/[id]/route.ts` — GET handler for conversation history.
- Anthropic SDK integration with streaming, tool use, prompt caching.
- *Testable*: integration tests that mock the Anthropic SDK and verify the loop executes correctly for a synthetic message that triggers the read_memory tool. Real-Anthropic smoke tests confirm a turn streams correctly end-to-end for a hand-typed message.

**Milestone 6 — SSE streaming protocol wired through the route** (1-2 days; concurrent with Milestone 5).
- `src/lib/agent/stream.ts` — the SSE event encoder + Zod schemas.
- The `/api/agent/turn` route returns a streaming `Response`.
- *Testable*: smoke test with `curl` and a hand-typed prompt produces a sequence of SSE events ending in `done`.

**Milestone 7 — Frontend chat shell + stream consumer** (5-7 days; the largest piece because of layout work).
- The persistent chat slot in the layout (Belief 2 layout work).
- `src/components/agent/ChatPanel.tsx` — the in-progress turn renderer.
- `src/lib/agent/client/stream-reader.ts` — fetch-streaming reader with Zod-validated event handler.
- The basic "send message → see streaming response" UX without polish.
- *Testable*: end-to-end manual test in the dev browser. A host can type a question, see streaming text appear, see a tool-call indicator, see the response complete.

**Milestone 8 — Artifact registry + `PropertyKnowledgeConfirmation` component** (3-5 days; concurrent with Milestone 7).
- `src/components/agent/artifacts/registry.ts`.
- `src/components/agent/artifacts/PropertyKnowledgeConfirmation.tsx` using the existing polish primitives (`KoastCard`, `KoastButton`, etc.).
- The chat-bubble inline embed pattern (uses `createPortal` or the existing inline component pattern).
- The `<artifact ...>` text-tag parser in the SSE event extraction layer.
- *Testable*: a hand-crafted SSE stream containing an artifact event renders the artifact correctly in the chat. Schema mismatches show the fallback.

**Milestone 9 — Artifact-action route + end-to-end memory write commit** (1-2 days).
- `src/app/api/agent/artifact-action/route.ts` — POST handler that runs `requestAction`, commits the memory fact, updates the artifact's state.
- The `PropertyKnowledgeConfirmation` component's onAction handler wired through.
- *Testable*: end-to-end manual test. Host types the hurricane-door message, sees the streaming response, sees the artifact, clicks Save, sees the saved indicator. Verifying:
  - 1 row in `agent_conversations`.
  - 2 rows in `agent_turns`.
  - 1 row in `agent_artifacts` with state `confirmed`.
  - 1 row in `memory_facts` with the right scoping and provenance.
  - 1 row in `agent_audit_log` linking the conversation_id, turn_id, artifact_id, action_type='memory.write', autonomy_level='host_confirmed', outcome='success'.

### 12.3 Parallel work streams

- **Voice doctrine doc consolidation** (Method-in-Code §"the voice doctrine document"): the slice references a `docs/voice.md` that doesn't exist yet. The doc consolidates DESIGN_SYSTEM.md §15, the `generateGuestReviewFromIncoming` bias rules, the empty-state register, and Belief 5's three-modes register. Independent work; can ship in parallel from day one.
- **Polish primitive review** (Belief 2 §3): the artifact component uses existing polish primitives. Confirming `KoastCard` etc. have the right shape for inline-in-chat embedding is a small audit that can happen during Milestone 7-8. May surface 1-2 small primitive extensions.
- **System prompt iteration**: getting the system prompt right (voice doctrine reference, tools manifest framing, refusal-fallback discipline, artifact emission pattern teaching) is iterative. Start during Milestone 5; refine through Milestone 9 and beyond.
- **Test fixtures**: a small set of canned conversation scenarios (the hurricane door, a wifi password question, a reservation extension request) used as integration test corpora. Builds during the slice; pays back forever.

### 12.4 Out-of-band work that closes Phase 1 but isn't in this slice

After the slice ships and works:
- The `/koast/recent-activity` surface reading from `agent_audit_log`.
- The `/memory` inspector reading from `memory_facts`.
- The artifact-deep-link from saved artifacts to the memory inspector.
- Mobile UX polish on the chat slot.
- Streaming text-reveal motion polish.
- The Phase 1 calibration debt fixes (mocked sparkline, point-estimate dollars, `original_draft` capture).
- Legacy config table dispositions (deprecate the 4 empty config tables; transform `property_details` to memory facts via a one-time migration).
- The remaining ~39 agent tools.

These are Phase 1 closeout work, parallelizable, no longer slice-shaped.

---

## Closing notes

This design honors the Method-in-Code map's commitment that *"the architectural commitments at v1, even if visible features are thin"* are what matters. The first vertical slice is one host turn, one tool, one artifact type — but every Phase 1 architectural commitment is forced through it. The work the team does after this slice is breadth: more tools, more artifact types, more capabilities, more polish. The foundations don't get rebuilt.

Where ALTERNATIVES are flagged, the team should weigh in before commit:
- Stream resumption (deferred to Phase 2 in this design; if early UX testing shows reconnection is common, revisit).
- Memory write tool exposed to the model directly (deferred behind artifact confirmation in this design; revisit when calibration substrate has signal).
- Anthropic Agent SDK / Vercel AI SDK adoption (deferred in favor of thin SSE in this design; revisit if rolling our own becomes load-bearing).
- Tool definitions in JSON files vs TypeScript modules (TypeScript chosen; revisit if non-engineers want to author tools).
- Auto-retry on transient tool errors (deferred to Phase 2 in this design; revisit when error rates are measurable).

Everything else in this document is a design DECISION that becomes implementation reference for the build work. The slice is the smallest end-to-end path that proves the architecture; once it works, the rest of Phase 1 is scope, not invention.

---

## 13. Decisions made during implementation

This section captures decisions that were made or revised during implementation that the design left ambiguous or that the team revised after review. Decisions are listed in the order they were made; each names the original design state, the revised choice, and the reason.

### 13.1 Milestone 1 (schema migrations) — initial decisions

The schema migrations (`supabase/migrations/20260501010000` through `20260501040000`) made these choices where the design was silent:

- **Drizzle file location.** The codebase has all declarations in a single `src/lib/db/schema.ts` (~685 lines). Followed that convention. A directory split (`src/lib/db/schema/*.ts`) was considered but rejected: mid-feature reorgs that touch unrelated tables produce noise. If the team wants a split, it should be a separate cleanup PR covering all tables.
- **`memory_facts.sub_entity_id` type.** Kept as `text` at v1. No sub-entity tables exist yet ('door', 'wifi', 'hvac' are handles, not entities); using `uuid` would force fake UUIDs. A future migration converts to `uuid + FK` when sub-entity tables ship.
- **`memory_facts` RLS scope.** Used the simple `host_id = auth.uid()` pattern. Defense-in-depth checking entity ownership per `entity_type` would require a CASE expression — at v1 the agent layer's pre-write ownership check (per §7.1 `requestAction` flow) is the primary gate.
- **ON DELETE policies.** CASCADE downwards from owners (`agent_conversations → turns → artifacts`; users → guests, memory_facts, etc.); SET NULL for cross-entity references (`memory_facts.guest_id`, `memory_facts.superseded_by`, `messages.actor_id`, `guests.first_seen_booking_id`).
- **`updated_at` triggers.** Shipped from day one for `memory_facts`, `guests`, `agent_conversations`, `agent_artifacts`. The codebase has a known issue (CLAUDE.md "Known Data Quality Issues") that `properties.updated_at` isn't auto-bumped — new tables don't inherit this gap. `agent_turns` and `agent_audit_log` are append-only by design (no `updated_at` column, no trigger).
- **Partial indexes.** Used where the hot path is narrow: `WHERE status = 'active'` on memory_facts retrieval, `WHERE state = 'emitted'` on artifacts pending action, `WHERE outcome = 'failed'` on audit log ops monitoring.
- **`agent_turns(conversation_id, turn_index)` UNIQUE.** Added beyond the design's single index — ensures stable ordering and surfaces concurrent-write collisions early.

### 13.2 Milestone 1 (post-review revision) — `messages.actor_kind` excludes 'guest'

**Original**: the design's §8.1 schema had `actor_kind` as a NOT-NULL `text` column with default `'host'` and an enum including `'channex_system'` for inbound rows. Milestone 1's first cut included `'guest'` in the enum and set `actor_kind = 'guest'` for `sender = 'guest'` rows during back-population.

**Revised**: `actor_kind` names INTERNAL-side actors only — those who act on Koast's behalf (`'host'`, `'agent'`, `'cleaner'`, `'cohost'`, `'system'`). Guest is the external party Koast communicates WITH, not an internal actor. The existing `sender` column already distinguishes property-side from guest-side; adding `'guest'` to `actor_kind` conflated two conceptual spaces.

Concrete changes:
- CHECK constraint: `IN ('host', 'agent', 'cleaner', 'cohost', 'system')`. `'guest'` and `'channex_system'` removed.
- Column is nullable; no DEFAULT. Callers must explicitly attribute new rows.
- Back-population: `sender = 'guest'` rows have `actor_kind = NULL` (no UPDATE step touches them). `sender = 'property'` rows get `'host'` or `'agent'` as before. `sender = 'system'` rows get `'system'`.
- Voice-extraction-filter index becomes partial: `WHERE actor_kind IS NOT NULL`. Inbound and unattributed rows are excluded naturally.
- Drizzle schema declares the column nullable with no default; exports `MessagesActorKind` typed union for application-layer callers.

The design's §8 description is updated implicitly by this section; future revisions of §8 should reflect the corrected enum and nullable column.

### 13.3 Milestone 1 (post-review revision) — `memory_facts.sub_entity_type` controlled vocabulary

**Original**: the design's §6.4 had `sub_entity_type` as free-text `text` with no CHECK constraint. The reasoning was "v1 sub_entity_id is a free-text handle, not a uuid" — but that conflated `sub_entity_type` (the kind of sub-entity) with `sub_entity_id` (the specific instance disambiguator).

**Revised**: `sub_entity_type` is now CHECK-constrained to a controlled vocabulary so different parts of the system can't write `'front_door'` / `'frontdoor'` / `'main_door'` / `'entrance'` for the same conceptual entity. `sub_entity_id` remains free-text — it's the disambiguator within a typed scope (e.g., `sub_entity_type = 'wifi'` with `sub_entity_id = 'primary_router'` vs `'guest_network'`).

V1 vocabulary: `('front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances')`. NULL is also valid (the fact scopes to the entity as a whole). Future migrations expand the vocabulary as new sub-entity types prove out; the agent extraction pipeline canonicalizes input to this controlled set.

Concrete changes:
- `memory_facts.sub_entity_type` CHECK: `IN ('front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances')`, NULL allowed.
- Drizzle schema exports `MemoryFactSubEntityType` typed union mirroring the CHECK constraint.
- `PropertyKnowledgeConfirmationPayloadSchema` (§5.2) updated: `sub_entity_type` is now the controlled enum, `sub_entity_id` replaces the previous `sub_entity_handle` field name.
- Migration `20260501010000` enforces the CHECK at the DB level; rejection is verified by the test plan §B9.

### 13.4 Milestone 1 — additional indexes added beyond the design

The design listed minimum indexes per the access patterns it described. Milestone 1 added a few more where the access pattern was implied but not listed:

- `idx_memory_facts_guest` (partial: `WHERE guest_id IS NOT NULL`) — guest-specific facts retrieval.
- `idx_memory_facts_superseded_by` (partial: `WHERE superseded_by IS NOT NULL`) — supersession history walk.
- `idx_agent_conversations_host_status` (partial: `WHERE status = 'active'`) — active-conversation lookup.
- `idx_agent_audit_log_failures` (partial: `WHERE outcome = 'failed'`) — ops monitoring.
- `idx_agent_audit_log_source` — debugging which audit-source is producing rows.
- `idx_guests_first_seen_booking` (partial) — back-population worker support.

These are inexpensive (partial indexes on hot conditions) and the design didn't explicitly forbid them.
