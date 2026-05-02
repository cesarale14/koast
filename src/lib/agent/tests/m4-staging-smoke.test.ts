/**
 * M4 staging smoke test — end-to-end roundtrip of the agent loop
 * server's runAgentTurn() against staging Supabase + the real
 * Anthropic API.
 *
 * Skipped by default. Runs only when RUN_STAGING_SMOKE=1 is set in
 * the environment AND the staging env file is sourced (which sets
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
 * ANTHROPIC_API_KEY).
 *
 * Pre-conditions: a wrapper script must:
 *   1. Insert the test user + property in staging
 *   2. Seed a memory_fact via writeMemoryFact (M2 path)
 *   3. Apply transactional GRANT/REVOKE bracket for DRIFT-3
 *
 * The test:
 *   - Calls runAgentTurn() with a question that should trigger
 *     read_memory ("what's the wifi password for the property?")
 *   - Consumes the AsyncGenerator, recording every event
 *   - Verifies the event sequence (turn_started, then either
 *     token+done OR token+tool_call_started+tool_call_completed+
 *     token+done depending on whether the model invoked the tool)
 *   - Verifies persistence: agent_conversations + agent_turns rows
 *   - Verifies audit log: one row per tool dispatch
 *   - Reports input/output/cache token counts (which approximate
 *     the cost: rough estimate ~$0.003 per turn at sonnet-4-5)
 *
 * Cleanup: afterAll deletes the smoke fact + conversation + turns
 * + audit rows. The wrapper handles user/property + GRANT/REVOKE.
 */

import { runAgentTurn } from "../loop";
import { writeMemoryFact } from "@/lib/memory/write";
import { createServiceClient } from "@/lib/supabase/service";
import type { AgentStreamEvent } from "../sse";
import "../tools";

const SHOULD_RUN = process.env.RUN_STAGING_SMOKE === "1";
const HOST_ID = process.env.SMOKE_HOST_ID ?? "00000000-0000-0000-0000-0000000aa001";
const PROP_ID = process.env.SMOKE_PROP_ID ?? "11111111-1111-4111-8111-111111111aa1";
const SMOKE_VALUE = `m4-smoke-password-${Date.now()}`;

(SHOULD_RUN ? describe : describe.skip)("M4 staging smoke", () => {
  let createdFactId: string | null = null;
  let createdConversationId: string | null = null;
  const allAuditIds: string[] = [];

  afterAll(async () => {
    const supabase = createServiceClient();
    // Delete all smoke audit rows for this host (catches both the
    // writeMemoryFact's audit and any tool-dispatch audits)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("agent_audit_log") as any).delete().eq("host_id", HOST_ID);
    // Delete smoke memory_facts
    if (createdFactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("memory_facts") as any).delete().eq("id", createdFactId);
    }
    // Delete conversation (cascades to turns)
    if (createdConversationId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("agent_conversations") as any).delete().eq("id", createdConversationId);
    }
  });

  test(
    "end-to-end: seed memory_fact → runAgentTurn → SDK invokes read_memory → answer references the fact",
    async () => {
      // ----- SEED -----
      const seed = await writeMemoryFact({
        host: { id: HOST_ID },
        fact: {
          entity_type: "property",
          entity_id: PROP_ID,
          sub_entity_type: "wifi",
          attribute: "password",
          value: SMOKE_VALUE,
          source: "host_taught",
          confidence: 1.0,
        },
        conversation_context: {
          conversation_id: "00000000-0000-4000-8000-0000000bb001",
          turn_id: "00000000-0000-4000-8000-0000000bb002",
          artifact_id: "00000000-0000-4000-8000-0000000bb003",
          source_message_text: "M4 smoke seed",
        },
      });
      expect(seed.mode).toBe("committed");
      createdFactId = seed.fact_id;

      // ----- RUN AGENT TURN -----
      const events: AgentStreamEvent[] = [];
      for await (const event of runAgentTurn({
        host: { id: HOST_ID },
        conversation_id: null,
        user_message_text:
          `What's the wifi password for the property with id ${PROP_ID}?`,
      })) {
        events.push(event);
        if (event.type === "turn_started") {
          createdConversationId = event.conversation_id;
        }
        if (event.type === "done") {
          for (const id of event.audit_ids) {
            allAuditIds.push(id);
          }
        }
      }

      // ----- ASSERTIONS -----
      expect(createdConversationId).toBeTruthy();
      const types = events.map((e) => e.type);

      // First event MUST be turn_started
      expect(types[0]).toBe("turn_started");

      // Last event MUST be done (success path) — refusal/error means smoke broke
      expect(types[types.length - 1]).toBe("done");

      // We expect at least one tool_call_started + tool_call_completed
      // (the model should call read_memory given the question form)
      const toolStarts = events.filter(
        (e): e is Extract<AgentStreamEvent, { type: "tool_call_started" }> =>
          e.type === "tool_call_started",
      );
      const toolCompletes = events.filter(
        (e): e is Extract<AgentStreamEvent, { type: "tool_call_completed" }> =>
          e.type === "tool_call_completed",
      );
      expect(toolStarts.length).toBeGreaterThanOrEqual(1);
      expect(toolCompletes.length).toBe(toolStarts.length);

      // Verify the tool was read_memory and it succeeded
      for (const tcs of toolStarts) {
        expect(tcs.tool_name).toBe("read_memory");
      }
      for (const tcc of toolCompletes) {
        expect(tcc.success).toBe(true);
      }

      // We expect token events (the assistant's text response)
      const tokenEvents = events.filter(
        (e): e is Extract<AgentStreamEvent, { type: "token" }> => e.type === "token",
      );
      expect(tokenEvents.length).toBeGreaterThan(0);

      // Concatenate all token deltas — should reference the seeded fact value
      const fullText = tokenEvents.map((e) => e.delta).join("");
      // The model should mention the password value somewhere in its response
      expect(fullText).toContain(SMOKE_VALUE);

      // ----- VERIFY PERSISTENCE -----
      const supabase = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: turns, error: turnsErr } = await (supabase.from("agent_turns") as any)
        .select("id, turn_index, role, content_text, tool_calls, model_id, input_tokens, output_tokens, cache_read_tokens")
        .eq("conversation_id", createdConversationId)
        .order("turn_index", { ascending: true });

      expect(turnsErr).toBeNull();
      // We expect at least 2 turns: user + assistant (the assistant
      // turn aggregates all rounds' text + tool_calls into one row)
      expect(turns).toHaveLength(2);
      expect(turns[0].role).toBe("user");
      expect(turns[1].role).toBe("assistant");
      expect(turns[1].tool_calls).toBeTruthy();
      expect(turns[1].model_id).toBe("claude-sonnet-4-5-20250929");

      // Verify audit rows for tool dispatch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: audits, error: auditsErr } = await (supabase.from("agent_audit_log") as any)
        .select("id, action_type, source, actor_kind, autonomy_level, outcome, latency_ms")
        .eq("host_id", HOST_ID)
        .eq("source", "agent_tool")
        .eq("action_type", "read_memory");
      expect(auditsErr).toBeNull();
      expect(audits.length).toBeGreaterThanOrEqual(1);
      for (const audit of audits) {
        expect(audit.outcome).toBe("succeeded");
        expect(audit.actor_kind).toBe("agent");
        expect(audit.autonomy_level).toBe("silent");
        expect(typeof audit.latency_ms).toBe("number");
      }

      // ----- LOG TOKEN USAGE FOR COST ESTIMATE -----
      console.log("[m4-smoke] event sequence:", types.join(" → "));
      console.log(
        "[m4-smoke] tokens: input=%d output=%d cache_read=%d",
        turns[1].input_tokens,
        turns[1].output_tokens,
        turns[1].cache_read_tokens,
      );
      console.log("[m4-smoke] tool dispatches:", toolStarts.length);
      console.log(
        "[m4-smoke] response excerpt:",
        fullText.length > 200 ? fullText.slice(0, 200) + "..." : fullText,
      );
    },
    60_000,  // longer timeout — real Anthropic call may take ~15-30s with tool round-trip
  );
});
