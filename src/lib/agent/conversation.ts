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
export async function persistTurn(input: PersistTurnInput): Promise<PersistedTurn> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromBuilder = supabase.from("agent_turns") as any;
  const { count, error: countError } = await fromBuilder
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", input.conversation_id);

  if (countError) {
    throw new Error(`[conversation] Failed to compute next turn_index: ${countError.message}`);
  }

  const nextIndex = (count ?? 0) as number;

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
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertBuilder = supabase.from("agent_turns") as any;
  const { data, error } = await insertBuilder
    .insert(row)
    .select("id, turn_index, created_at")
    .single();

  if (error || !data) {
    throw new Error(
      `[conversation] Failed to persist turn for conversation ${input.conversation_id}: ${error?.message ?? "no row"}`,
    );
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const turnBuilder = supabase.from("agent_turns") as any;
  const { data, error } = await turnBuilder
    .select("id, turn_index, role, content_text, tool_calls, refusal, created_at")
    .eq("conversation_id", conversationId)
    .order("turn_index", { ascending: true });
  if (error) {
    throw new Error(`[conversation] loadTurnsForConversation failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    turn_index: number;
    role: AgentTurnRole;
    content_text: string | null;
    tool_calls: ToolCallRecord[] | null;
    refusal: Record<string, unknown> | null;
    created_at: string;
  }>;

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
    };
  });
}
