/**
 * Conversation state primitives for the agent loop server.
 *
 * Provides:
 *   - getOrCreateConversation: returns an existing conversation or
 *     creates a new one for the given host.
 *   - persistTurn: inserts a row into agent_turns with full metadata
 *     (role, content_text, tool_calls JSONB, artifacts, refusal,
 *     token counts, model_id). Allocates the next turn_index
 *     atomically per conversation.
 *   - reconstructHistory: SELECTs all turns ordered by turn_index
 *     and produces the SDK's `MessageParam[]` shape, synthesizing
 *     tool_result-as-user-message blocks from the assistant turn's
 *     `tool_calls` JSONB (since the migration's role enum doesn't
 *     include 'tool_result').
 *
 * Caller contract: caller authenticates the host and passes
 * `host.id` explicitly. This module trusts its inputs and uses
 * service-role for DB access — same pattern as M2's memory
 * handlers and M3's dispatcher (matches dominant codebase
 * convention).
 *
 * The `tool_calls` JSONB shape is documented in the M4 conventions
 * inventory §C and reflected in the `ToolCallRecord` type below.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import type { AgentTurnRole, AgentConversationStatus } from "@/lib/db/schema";

export interface AgentHost {
  id: string;
}

/**
 * The shape stored in agent_turns.tool_calls JSONB for assistant
 * turns that invoked tools. Reconstructed at read time into the
 * SDK's tool_use + tool_result content blocks.
 */
export interface ToolCallRecord {
  tool_use_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  result: {
    content: string;        // serialized; what the model received
    is_error: boolean;
  };
  audit_log_id: string;
}

export interface PersistTurnInput {
  conversation_id: string;
  role: AgentTurnRole;
  content_text?: string | null;
  tool_calls?: ToolCallRecord[] | null;
  refusal?: Record<string, unknown> | null;
  model_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  /** M6 M6.3: per-turn property scope (closes M5 CF D-F2). Resolved at the loop layer from ui_context.active_property_id; null when the user hasn't selected a property. */
  active_property_id?: string | null;
}

export interface PersistedTurn {
  id: string;
  turn_index: number;
  created_at: string;
}

export interface AgentConversationRow {
  id: string;
  host_id: string;
  status: AgentConversationStatus;
  started_at: string;
  last_turn_at: string;
}

/**
 * Returns an existing conversation if `conversationId` is provided
 * and is owned by the host; otherwise creates a new conversation
 * for the host. Defensive: if the supplied conversationId belongs
 * to a different host, throw — callers shouldn't be passing IDs
 * across hosts.
 */
export async function getOrCreateConversation(
  host: AgentHost,
  conversationId: string | null,
): Promise<AgentConversationRow> {
  const supabase = createServiceClient();

  if (conversationId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromBuilder = supabase.from("agent_conversations") as any;
    const { data, error } = await fromBuilder
      .select("id, host_id, status, started_at, last_turn_at")
      .eq("id", conversationId)
      .single();

    if (error || !data) {
      throw new Error(
        `[conversation] Cannot fetch conversation ${conversationId}: ${error?.message ?? "no row"}`,
      );
    }
    if (data.host_id !== host.id) {
      throw new Error(
        `[conversation] Conversation ${conversationId} does not belong to host ${host.id}.`,
      );
    }
    return data as AgentConversationRow;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertBuilder = supabase.from("agent_conversations") as any;
  const { data, error } = await insertBuilder
    .insert({ host_id: host.id, status: "active" })
    .select("id, host_id, status, started_at, last_turn_at")
    .single();

  if (error || !data) {
    throw new Error(
      `[conversation] Cannot create conversation for host ${host.id}: ${error?.message ?? "no row"}`,
    );
  }
  return data as AgentConversationRow;
}

/**
 * Persist a turn. Computes the next turn_index by counting existing
 * rows on the conversation. Two writers racing on the same
 * conversation could in principle collide on the unique
 * (conversation_id, turn_index) index — at v1 that's not a real
 * scenario (one host, one streaming request), but the unique
 * constraint will catch it loudly if it ever happens.
 */
/**
 * M6 turn_id-ordering fix: insertTurn writes a stub row at the start
 * of a turn (before SDK call + tool dispatches), returning a real
 * UUID the dispatcher can pass through to writeArtifact's
 * agent_artifacts.turn_id NOT NULL FK. Race-protected via the
 * pre-existing unique index on (conversation_id, turn_index): two
 * concurrent inserts at the same index — one wins, one gets a
 * Postgres '23505' unique_violation. Caller catches and retries
 * with the next index. (At v1 single-host scale this is rare; the
 * retry guarantees correctness if it ever happens.)
 *
 * After the SDK + dispatch resolve, the loop calls finalizeTurn to
 * UPDATE the stub with content_text / tool_calls / refusal / token
 * counts. SDK errors leave the stub alive (per A1 — discoverable
 * via "content/tool_calls/refusal all NULL"; loadTurnsForConversation
 * filters them out of the chat shell).
 */
export interface InsertTurnInput {
  conversation_id: string;
  role: AgentTurnRole;
  active_property_id?: string | null;
  /** model_id stamped at insert time (M6+); finalize doesn't change it. */
  model_id?: string | null;
}

export interface FinalizeTurnInput {
  turn_id: string;
  content_text?: string | null;
  tool_calls?: ToolCallRecord[] | null;
  refusal?: Record<string, unknown> | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
}

const TURN_INSERT_RACE_RETRIES = 5;

async function computeNextTurnIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conversationId: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromBuilder = supabase.from("agent_turns") as any;
  const { count, error } = await fromBuilder
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (error) {
    throw new Error(`[conversation] Failed to compute next turn_index: ${error.message}`);
  }
  return (count ?? 0) as number;
}

/**
 * Insert a stub agent_turns row. Returns the new row's id + index +
 * created_at. Retries on the unique-constraint race.
 */
export async function insertTurn(input: InsertTurnInput): Promise<PersistedTurn> {
  const supabase = createServiceClient();

  for (let attempt = 0; attempt < TURN_INSERT_RACE_RETRIES; attempt++) {
    const nextIndex = await computeNextTurnIndex(supabase, input.conversation_id);

    const row: Record<string, unknown> = {
      conversation_id: input.conversation_id,
      turn_index: nextIndex,
      role: input.role,
      // Content fields stay NULL until finalizeTurn lands.
      content_text: null,
      tool_calls: null,
      refusal: null,
      model_id: input.model_id ?? null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      active_property_id: input.active_property_id ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertBuilder = supabase.from("agent_turns") as any;
    const { data, error } = await insertBuilder
      .insert(row)
      .select("id, turn_index, created_at")
      .single();

    if (!error && data) {
      // Bump conversation's last_turn_at so list views can sort recency.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const convBuilder = supabase.from("agent_conversations") as any;
      await convBuilder
        .update({ last_turn_at: new Date().toISOString() })
        .eq("id", input.conversation_id);

      return {
        id: data.id as string,
        turn_index: data.turn_index as number,
        created_at: data.created_at as string,
      };
    }

    // Detect Postgres unique_violation (23505) on the
    // (conversation_id, turn_index) constraint and retry.
    const code =
      typeof (error as { code?: unknown })?.code === "string"
        ? ((error as { code?: string }).code as string)
        : "";
    if (code === "23505") {
      // Race lost — recompute next index and retry.
      continue;
    }

    throw new Error(
      `[conversation] insertTurn failed for conversation ${input.conversation_id}: ${error?.message ?? "no row"}`,
    );
  }

  throw new Error(
    `[conversation] insertTurn exhausted ${TURN_INSERT_RACE_RETRIES} retries on the (conversation_id, turn_index) race for conversation ${input.conversation_id}.`,
  );
}

/**
 * Finalize a stub turn with the loop's outputs. UPDATE-only; the row
 * already exists from insertTurn. Idempotent in shape: re-running with
 * the same payload writes the same values.
 */
export async function finalizeTurn(input: FinalizeTurnInput): Promise<void> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = {};
  if (input.content_text !== undefined) update.content_text = input.content_text;
  if (input.tool_calls !== undefined) update.tool_calls = input.tool_calls;
  if (input.refusal !== undefined) update.refusal = input.refusal;
  if (input.input_tokens !== undefined) update.input_tokens = input.input_tokens;
  if (input.output_tokens !== undefined) update.output_tokens = input.output_tokens;
  if (input.cache_read_tokens !== undefined) update.cache_read_tokens = input.cache_read_tokens;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateBuilder = supabase.from("agent_turns") as any;
  const { error } = await updateBuilder
    .update(update)
    .eq("id", input.turn_id);

  if (error) {
    throw new Error(
      `[conversation] finalizeTurn failed for turn ${input.turn_id}: ${error.message}`,
    );
  }
}

/**
 * Single-shot turn write: INSERT with all fields filled in. Used for
 * turn writes where content is fully known at write time (user
 * messages; carry-over from M3-M5). Assistant turns now use
 * insertTurn + finalizeTurn (M6 turn_id-ordering fix).
 */
export async function persistTurn(input: PersistTurnInput): Promise<PersistedTurn> {
  const supabase = createServiceClient();

  for (let attempt = 0; attempt < TURN_INSERT_RACE_RETRIES; attempt++) {
    const nextIndex = await computeNextTurnIndex(supabase, input.conversation_id);

    const row: Record<string, unknown> = {
      conversation_id: input.conversation_id,
      turn_index: nextIndex,
      role: input.role,
      content_text: input.content_text ?? null,
      tool_calls: input.tool_calls ?? null,
      refusal: input.refusal ?? null,
      model_id: input.model_id ?? null,
      input_tokens: input.input_tokens ?? null,
      output_tokens: input.output_tokens ?? null,
      cache_read_tokens: input.cache_read_tokens ?? null,
      active_property_id: input.active_property_id ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertBuilder = supabase.from("agent_turns") as any;
    const { data, error } = await insertBuilder
      .insert(row)
      .select("id, turn_index, created_at")
      .single();

    if (!error && data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const convBuilder = supabase.from("agent_conversations") as any;
      await convBuilder
        .update({ last_turn_at: new Date().toISOString() })
        .eq("id", input.conversation_id);

      return {
        id: data.id as string,
        turn_index: data.turn_index as number,
        created_at: data.created_at as string,
      };
    }

    const code =
      typeof (error as { code?: unknown })?.code === "string"
        ? ((error as { code?: string }).code as string)
        : "";
    if (code === "23505") continue;

    throw new Error(
      `[conversation] Failed to persist turn for conversation ${input.conversation_id}: ${error?.message ?? "no row"}`,
    );
  }

  throw new Error(
    `[conversation] persistTurn exhausted ${TURN_INSERT_RACE_RETRIES} retries on the (conversation_id, turn_index) race for conversation ${input.conversation_id}.`,
  );
}

interface AgentTurnRow {
  id: string;
  turn_index: number;
  role: AgentTurnRole;
  content_text: string | null;
  tool_calls: ToolCallRecord[] | null;
  refusal: Record<string, unknown> | null;
}

/**
 * Reconstruct the SDK's MessageParam[] history for a conversation.
 *
 * Migration's `agent_turns.role` is 'user' | 'assistant' (no
 * 'tool_result'). Tool results are stored on the assistant turn's
 * `tool_calls` JSONB; we synthesize a user-message-of-tool_result
 * blocks after each assistant turn that invoked tools, so the SDK
 * sees the standard 3-message-per-tool-call shape:
 *
 *   user: "what's the wifi password?"
 *   assistant: [text, tool_use(read_memory)]
 *   user: [tool_result for that tool_use]      ← synthetic
 *   assistant: "the wifi password is X."
 */
export async function reconstructHistory(
  conversationId: string,
): Promise<Anthropic.MessageParam[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromBuilder = supabase.from("agent_turns") as any;
  const { data, error } = await fromBuilder
    .select("id, turn_index, role, content_text, tool_calls, refusal")
    .eq("conversation_id", conversationId)
    .order("turn_index", { ascending: true });

  if (error) {
    throw new Error(`[conversation] Failed to reconstruct history: ${error.message}`);
  }

  const turns = (data ?? []) as AgentTurnRow[];
  const messages: Anthropic.MessageParam[] = [];

  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({
        role: "user",
        content: turn.content_text ?? "",
      });
      continue;
    }

    // assistant turn
    const content: Anthropic.ContentBlockParam[] = [];
    if (turn.content_text) {
      content.push({ type: "text", text: turn.content_text });
    }

    const toolCalls = (turn.tool_calls ?? []) as ToolCallRecord[];
    for (const tc of toolCalls) {
      content.push({
        type: "tool_use",
        id: tc.tool_use_id,
        name: tc.tool_name,
        input: tc.input,
      });
    }

    if (content.length === 0) {
      // Defensive: don't push an empty assistant message (SDK rejects).
      continue;
    }

    messages.push({ role: "assistant", content });

    // Synthesize a user message of tool_result blocks before the next
    // assistant turn. The SDK requires this to feed tool_use blocks
    // back into the conversation.
    if (toolCalls.length > 0) {
      const toolResults: Anthropic.ContentBlockParam[] = toolCalls.map((tc) => ({
        type: "tool_result",
        tool_use_id: tc.tool_use_id,
        content: tc.result.content,
        is_error: tc.result.is_error,
      }));
      messages.push({ role: "user", content: toolResults });
    }
  }

  return messages;
}

/* ============================================================
   M5 — UI-side reads (D-Q8 + D-F2)
   ============================================================
   These two functions back the chat shell's server components. They
   live alongside the existing server-side conversation primitives so
   the read path is one module, not split between server and route.

   Both are server-only (touch service-role Supabase) and require the
   caller to pass the authenticated host's id explicitly.
*/

/**
 * Property summary shape for the chat shell's property dropdown (D18).
 * The chat shell uses the selection to populate `ui_context.active_property_id`
 * on submit, which the agent loop forwards to read_memory and other tools.
 *
 * v1: surfaces id + name + a short meta line (city · bedrooms) for the
 * dropdown trigger pill. The full property record stays server-side.
 */
export interface ChatPropertyOption {
  id: string;
  name: string;
  /** "Tampa · 2 br" — short meta line. Empty when no city/bedrooms persisted. */
  meta: string;
}

function formatPropertyMeta(
  city: string | null | undefined,
  bedrooms: number | null | undefined,
): string {
  const parts: string[] = [];
  if (city) parts.push(city);
  if (typeof bedrooms === "number" && bedrooms > 0) parts.push(`${bedrooms} br`);
  return parts.join(" · ");
}

/**
 * List the host's properties for the chat shell dropdown (D18).
 *
 * Reads `properties` filtered by `user_id = hostId` (the column is named
 * `user_id` even though the agent loop calls the principal "host" — same
 * person, different vocabulary across modules). Ordered alphabetically by
 * name so the dropdown is stable across sessions.
 */
export async function listProperties(
  hostId: string,
): Promise<ChatPropertyOption[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromBuilder = supabase.from("properties") as any;
  const { data, error } = await fromBuilder
    .select("id, name, city, bedrooms")
    .eq("user_id", hostId)
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`[conversation] listProperties failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    city: string | null;
    bedrooms: number | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    meta: formatPropertyMeta(r.city, r.bedrooms),
  }));
}

/**
 * Item shape for the conversation rail. Field semantics per D-F2:
 *   - preview     — derived from the first user turn's content_text,
 *                   truncated to PREVIEW_MAX_CHARS (≈50). Empty when
 *                   the conversation has no user turns yet.
 *   - propertyName — resolved from the first user turn's
 *                   `ui_context.active_property_id`. Today the agent
 *                   loop does NOT persist ui_context on agent_turns
 *                   (only the request body carries it), so the
 *                   fallback "All properties" is the universal path
 *                   until the M6 schema migration adds the column.
 *                   Listed in the CF§10 carry-forwards.
 *   - timeLabel    — raw ISO timestamp from agent_conversations.
 *                   last_turn_at; the rail formats per locale.
 */
export interface ConversationListItem {
  id: string;
  status: AgentConversationStatus;
  started_at: string;
  last_turn_at: string;
  preview: string;
  propertyName: string;
  timeLabel: string;
}

/** D-F2 preview truncation budget. */
const PREVIEW_MAX_CHARS = 50;
/** D-F2 fallback when no property can be resolved. */
const PROPERTY_FALLBACK = "All properties";

function truncatePreview(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= PREVIEW_MAX_CHARS) return trimmed;
  return trimmed.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd() + "…";
}

/**
 * List conversations for a host, ordered most-recent-first. Returns
 * UI-ready items with the D-F2 derived fields filled in.
 *
 * One round-trip for the conversation list, one for the
 * first-user-turn preview lookup. Property resolution would be a
 * third when ui_context persistence lands; today it always falls
 * back to "All properties" so we skip the join.
 */
export async function listConversations(
  hostId: string,
): Promise<ConversationListItem[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convBuilder = supabase.from("agent_conversations") as any;
  const { data: convRows, error: convError } = await convBuilder
    .select("id, status, started_at, last_turn_at")
    .eq("host_id", hostId)
    .order("last_turn_at", { ascending: false });

  if (convError) {
    throw new Error(`[conversation] listConversations failed: ${convError.message}`);
  }

  const conversations = (convRows ?? []) as Array<{
    id: string;
    status: AgentConversationStatus;
    started_at: string;
    last_turn_at: string;
  }>;
  if (conversations.length === 0) return [];

  // Fetch the first (turn_index=0) user turn per conversation in one shot.
  const ids = conversations.map((c) => c.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const turnBuilder = supabase.from("agent_turns") as any;
  const { data: turnRows, error: turnError } = await turnBuilder
    .select("conversation_id, content_text")
    .in("conversation_id", ids)
    .eq("turn_index", 0)
    .eq("role", "user");

  if (turnError) {
    throw new Error(
      `[conversation] listConversations preview lookup failed: ${turnError.message}`,
    );
  }

  const previewByConv = new Map<string, string>();
  for (const row of (turnRows ?? []) as Array<{
    conversation_id: string;
    content_text: string | null;
  }>) {
    previewByConv.set(row.conversation_id, truncatePreview(row.content_text));
  }

  return conversations.map((c) => ({
    id: c.id,
    status: c.status,
    started_at: c.started_at,
    last_turn_at: c.last_turn_at,
    preview: previewByConv.get(c.id) ?? "",
    propertyName: PROPERTY_FALLBACK,
    timeLabel: c.last_turn_at,
  }));
}

/**
 * UI-ready turn shape. Mirrors HistoryTurn in
 * src/lib/agent-client/types.ts — kept as a separate server-side
 * declaration on purpose so this module doesn't import from the
 * client-side types module (avoids accidental coupling and respects
 * the §4 server/client boundary).
 */
export interface UITurn {
  id: string;
  role: "user" | "koast";
  created_at: string;
  text: string | null;
  tool_calls: Array<{
    tool_use_id: string;
    tool_name: string;
    input_summary: string;
    success: boolean;
    result_summary: string;
  }>;
  refusal: { reason: string; suggested_next_step: string | null } | null;
  /**
   * M6 D23 + M7 D45 — artifacts attached to this turn. Loads
   * agent_artifacts rows for the conversation in lifecycle states
   * that are visible in history scrollback:
   *   - 'emitted'    — host hasn't acted yet (Save/Discard actionable;
   *                    M7: Approve/Edit/Discard for guest_message,
   *                    Try-again/Discard if commit_metadata.last_error
   *                    indicates a Channex failure per §6 amendment)
   *   - 'edited'     — M7 D45: host edited a guest_message draft;
   *                    Approve/Discard still actionable
   *   - 'superseded' — correction-chain history per D25; renders dim
   *   - 'confirmed'  — post-approval saved/sent; renders the
   *                    saved/sent variant
   *
   * 'dismissed' is intentionally excluded; the host's discard is the
   * explicit signal to stop showing it.
   *
   * Despite the name, this array carries non-pending lifecycle states
   * too — preserved for backwards compat with M6 step 13 callers.
   */
  pendingArtifacts: PendingArtifact[];
}

/**
 * Artifact attached to a UITurn (M6 D23 + D21). Sourced from
 * agent_artifacts; the audit_log_id paired ref is the FK added in
 * M6.2 migration. The chat shell renders these inline on conversation
 * reload — same visual as the live action_proposed event for
 * state='emitted', dimmed for state='superseded', saved-variant for
 * state='confirmed'.
 */
export interface PendingArtifact {
  artifact_id: string;
  audit_log_id: string;
  kind: string;
  /** Shape varies by kind; M6's first kind is property_knowledge_confirmation. */
  payload: Record<string, unknown>;
  created_at: string;
  /** Prior artifact_id this proposal corrects (if any). */
  supersedes: string | null;
  /**
   * Lifecycle state from agent_artifacts.state. Values surfaced to the
   * chat shell: 'emitted' | 'edited' | 'confirmed' | 'superseded'.
   * 'dismissed' is filtered out at the query level (host's discard is
   * the explicit signal to stop showing the artifact). M7 D45 added
   * 'edited' for host-edited guest_message drafts awaiting approval.
   *
   * §11 amendment: 'failed' is NOT a state — substrate keeps state=
   * 'emitted' on Channex failure, and the chat shell derives the
   * 'failed' visual from commit_metadata.last_error presence. Read
   * the metadata, don't expect a separate state value.
   */
  state: "emitted" | "edited" | "confirmed" | "superseded";
  /** When state='confirmed' or 'superseded', resolved metadata from agent_artifacts.commit_metadata. */
  commit_metadata: Record<string, unknown> | null;
  /**
   * M7 — derived canonical channel label ('airbnb' | 'booking_com' |
   * 'vrbo' | 'direct') for guest_message_proposal artifacts, resolved
   * via either commit_metadata.channel (post-approval handler writes it
   * at confirm time) or a second-query lookup on message_threads keyed
   * by payload.booking_id (covers emitted/edited states where the
   * handler hasn't run). undefined for memory artifacts and for guest
   * message artifacts whose booking has no thread on file (rare —
   * a fresh booking before the guest writes in).
   */
  derived_channel?: string;
}

/**
 * D-F2 input-summary derivation. Tools persist their full input as
 * JSONB; the rail/transcript surfaces summarize as "key=value · key=value".
 * Booleans/numbers stringified directly; strings used verbatim; objects
 * compacted to JSON for visibility (rare path).
 */
function summarizeToolInput(input: Record<string, unknown> | null | undefined): string {
  if (!input || Object.keys(input).length === 0) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}=${String(v)}`);
    } else {
      parts.push(`${k}=${JSON.stringify(v)}`);
    }
  }
  return parts.join(" · ");
}

/**
 * Truncated tool-result preview — full result is server-only.
 * v1 budget mirrors the design's "result_summary" blurb (~120 chars).
 */
const RESULT_SUMMARY_MAX_CHARS = 120;

function summarizeToolResult(content: string, isError: boolean): string {
  const flat = content.replace(/\s+/g, " ").trim();
  const head = flat.length <= RESULT_SUMMARY_MAX_CHARS
    ? flat
    : flat.slice(0, RESULT_SUMMARY_MAX_CHARS - 1).trimEnd() + "…";
  return isError ? `error: ${head}` : head;
}

/**
 * Load all turns for a conversation, parsed into the UI shape.
 *
 * Performs a host-ownership check up front — caller passes the
 * authenticated host id, and a foreign conversation_id throws.
 *
 * `tool_calls` JSONB on assistant turns is normalized: each persisted
 * record becomes a flat row of { tool_use_id, tool_name, input_summary,
 * success, result_summary }. Inputs are summarized as "key=value" pairs;
 * results are truncated. Refusal payload is parsed into the structured
 * shape the rail/transcript expects.
 */
export async function loadTurnsForConversation(
  conversationId: string,
  hostId: string,
): Promise<UITurn[]> {
  const supabase = createServiceClient();

  // Ownership check — same shape as getOrCreateConversation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerBuilder = supabase.from("agent_conversations") as any;
  const { data: convRow, error: convError } = await ownerBuilder
    .select("id, host_id")
    .eq("id", conversationId)
    .single();
  if (convError || !convRow) {
    throw new Error(
      `[conversation] loadTurnsForConversation: cannot fetch ${conversationId}: ${convError?.message ?? "no row"}`,
    );
  }
  if ((convRow as { host_id: string }).host_id !== hostId) {
    throw new Error(
      `[conversation] loadTurnsForConversation: conversation ${conversationId} does not belong to host ${hostId}.`,
    );
  }

  // M6 D23: load turns and history-visible artifacts in parallel;
  // stitch in memory by turn_id. Each turn gets its `pendingArtifacts`
  // array (despite the name, includes confirmed + superseded too —
  // see PendingArtifact docstring). 'emitted' renders pending,
  // 'superseded' renders dim per D25's correction-chain visual,
  // 'confirmed' renders the saved variant. 'dismissed' is excluded
  // — host's discard is the explicit signal to stop showing it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const turnBuilder = supabase.from("agent_turns") as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifactBuilder = supabase.from("agent_artifacts") as any;

  const [turnsResult, artifactsResult] = await Promise.all([
    turnBuilder
      .select("id, turn_index, role, content_text, tool_calls, refusal, created_at")
      .eq("conversation_id", conversationId)
      .order("turn_index", { ascending: true }),
    artifactBuilder
      .select("id, turn_id, audit_log_id, kind, payload, supersedes, created_at, state, commit_metadata")
      .eq("conversation_id", conversationId)
      .in("state", ["emitted", "edited", "confirmed", "superseded"])
      .order("created_at", { ascending: true }),
  ]);

  if (turnsResult.error) {
    throw new Error(`[conversation] loadTurnsForConversation failed: ${turnsResult.error.message}`);
  }
  if (artifactsResult.error) {
    throw new Error(
      `[conversation] loadTurnsForConversation pending-artifacts query failed: ${artifactsResult.error.message}`,
    );
  }

  const allRows = (turnsResult.data ?? []) as Array<{
    id: string;
    turn_index: number;
    role: AgentTurnRole;
    content_text: string | null;
    tool_calls: ToolCallRecord[] | null;
    refusal: Record<string, unknown> | null;
    created_at: string;
  }>;

  // M6 stub-turn filter (per A1 cleanup-on-error decision).
  // insertTurn writes a stub row at turn_started; the loop calls
  // finalizeTurn with content/tool_calls/refusal at completion. SDK
  // errors mid-stream leave the assistant stub alive — we filter
  // those out of the chat shell here. User-role stubs would never
  // survive (the user message is finalized synchronously); guard
  // anyway. Stub turns remain queryable in DB for diagnosis.
  const rows = allRows.filter((t) => {
    if (t.role === "user") return true;
    const isStub =
      t.content_text === null &&
      (t.tool_calls === null ||
        (Array.isArray(t.tool_calls) && t.tool_calls.length === 0)) &&
      t.refusal === null;
    return !isStub;
  });

  const artifactRows = (artifactsResult.data ?? []) as Array<{
    id: string;
    turn_id: string;
    audit_log_id: string | null;
    kind: string;
    payload: Record<string, unknown>;
    supersedes: string | null;
    created_at: string;
    state: string;
    commit_metadata: Record<string, unknown> | null;
  }>;

  // M7 channel resolution: for guest_message_proposal artifacts, the
  // chat shell needs the canonical channel label ('airbnb' /
  // 'booking_com' / etc.) for the eyebrow + sent pill. For confirmed
  // sends the post-approval handler writes commit_metadata.channel; for
  // emitted/edited artifacts we derive it via a second query on
  // message_threads keyed by the booking_id in payload. Single batched
  // lookup — one query for all guest_message booking_ids on the page.
  const guestMessageBookingIds = new Set<string>();
  for (const a of artifactRows) {
    if (a.kind === "guest_message_proposal") {
      const bid = (a.payload as { booking_id?: unknown })?.booking_id;
      if (typeof bid === "string" && bid.length > 0) {
        guestMessageBookingIds.add(bid);
      }
    }
  }
  const bookingIdToChannel = new Map<string, string>();
  if (guestMessageBookingIds.size > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threadBuilder = supabase.from("message_threads") as any;
    const { data: threadRows } = await threadBuilder
      .select("booking_id, channel_code")
      .in("booking_id", Array.from(guestMessageBookingIds));
    for (const row of (threadRows ?? []) as Array<{ booking_id: string; channel_code: string | null }>) {
      // Map channel_code → canonical label inline (mirrors
      // canonicalChannel in tools/read-guest-thread + handlers/propose-
      // guest-message; duplicated to avoid cross-package import).
      const code = (row.channel_code ?? "").toLowerCase();
      const canonical =
        code === "abb" || code === "airbnb"
          ? "airbnb"
          : code === "bdc" || code === "booking" || code === "booking_com" || code === "booking.com"
            ? "booking_com"
            : code === "vrbo" || code === "hma"
              ? "vrbo"
              : code === "direct" || code === "koast" || code === ""
                ? "direct"
                : code;
      // Last-write-wins for booking_ids with multiple threads (rare;
      // multi-channel bookings — CF #43 surfaces them as a single
      // canonical channel for the chat shell at v1).
      bookingIdToChannel.set(row.booking_id, canonical);
    }
  }

  // Group artifacts by turn_id for O(1) attach during the map.
  const artifactsByTurnId = new Map<string, PendingArtifact[]>();
  for (const a of artifactRows) {
    if (!a.audit_log_id) {
      // Defensive: pre-M6 artifacts (legacy rows from the M5
      // experimental phase) don't have audit_log_id paired refs.
      // Skip them — the chat shell can't action them without an
      // audit_log_id to dispatch through /api/agent/artifact.
      continue;
    }
    // Normalize state to the visible-in-history union; defensive
    // skip on unexpected values (would only happen if a future
    // migration adds a state we forgot to handle here).
    if (
      a.state !== "emitted" &&
      a.state !== "edited" &&
      a.state !== "confirmed" &&
      a.state !== "superseded"
    ) {
      continue;
    }
    // Channel resolution precedence (M7 D43 + post-CP4 fix):
    //   1. commit_metadata.channel — canonical, written at confirm
    //      time by the post-approval handler (post-fix path)
    //   2. message_threads join via booking_id — covers emitted/
    //      edited artifacts + legacy confirmed artifacts written
    //      before the M7 commit landed
    //   3. undefined — fresh booking edge case where no thread row
    //      exists yet; component degrades to channel-less eyebrow
    let derivedChannel: string | undefined;
    if (a.kind === "guest_message_proposal") {
      const cmChannel = (a.commit_metadata as { channel?: string } | null)?.channel;
      const bid = (a.payload as { booking_id?: unknown })?.booking_id;
      const joinedChannel =
        typeof bid === "string" ? bookingIdToChannel.get(bid) : undefined;
      derivedChannel = cmChannel ?? joinedChannel;
    }

    const list = artifactsByTurnId.get(a.turn_id) ?? [];
    list.push({
      artifact_id: a.id,
      audit_log_id: a.audit_log_id,
      kind: a.kind,
      payload: a.payload,
      created_at: a.created_at,
      supersedes: a.supersedes,
      state: a.state,
      commit_metadata: a.commit_metadata,
      derived_channel: derivedChannel,
    });
    artifactsByTurnId.set(a.turn_id, list);
  }

  return rows.map((t): UITurn => {
    const role: "user" | "koast" = t.role === "user" ? "user" : "koast";
    const tool_calls = (t.tool_calls ?? []).map((tc) => ({
      tool_use_id: tc.tool_use_id,
      tool_name: tc.tool_name,
      input_summary: summarizeToolInput(tc.input),
      success: !tc.result.is_error,
      result_summary: summarizeToolResult(tc.result.content, tc.result.is_error),
    }));
    const refusal = t.refusal
      ? {
          reason: String((t.refusal as { reason?: unknown }).reason ?? ""),
          suggested_next_step:
            ((t.refusal as { next_step?: unknown }).next_step as string | undefined) ??
            ((t.refusal as { suggested_next_step?: unknown }).suggested_next_step as string | undefined) ??
            null,
        }
      : null;
    return {
      id: t.id,
      role,
      created_at: t.created_at,
      text: t.content_text,
      tool_calls,
      refusal,
      pendingArtifacts: artifactsByTurnId.get(t.id) ?? [],
    };
  });
}
