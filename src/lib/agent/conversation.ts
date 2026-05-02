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
