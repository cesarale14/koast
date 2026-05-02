/**
 * Staging smoke test for the M3 dispatcher + read_memory tool.
 *
 * Skipped by default. Runs only when `RUN_STAGING_SMOKE=1` is set in
 * the environment AND the staging Supabase env vars are sourced
 * (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY pointing at
 * staging, NOT production).
 *
 * Pre-conditions: a wrapper script must:
 *   1. Insert the test user + property in staging (for FK targets)
 *   2. Apply transactional GRANT/REVOKE bracket for DRIFT-3 (so the
 *      service-role client can INSERT/SELECT public schema rows)
 *
 * Verifies end-to-end:
 *   1. dispatchToolCall('read_memory', ...) routes through the
 *      dispatcher's input validation, calls the read_memory handler
 *      which delegates to M2's readMemory(), and returns ok=true.
 *   2. The audit_log row is written with action_type='read_memory',
 *      source='agent_tool', actor_kind='agent',
 *      autonomy_level='silent', outcome='succeeded'.
 *   3. Pre-seeded fact comes back through the tool call with full
 *      provenance.
 *
 * Cleans up the smoke fact + audit row in afterAll. Leaves the test
 * user/property for the wrapper script to clean up.
 */

import { writeMemoryFact } from "@/lib/memory/write";
import { dispatchToolCall } from "../dispatcher";
import { createServiceClient } from "@/lib/supabase/service";

// Importing the tools index registers the read_memory tool with the
// dispatcher. M4 will eventually do this once at server boot; for the
// smoke test, just importing here is sufficient.
import "../tools/index";

const SHOULD_RUN = process.env.RUN_STAGING_SMOKE === "1";
const HOST_ID = process.env.SMOKE_HOST_ID ?? "00000000-0000-0000-0000-0000000aa001";
const PROP_ID = process.env.SMOKE_PROP_ID ?? "11111111-1111-4111-8111-111111111aa1";
const SMOKE_ATTRIBUTE = `m3_smoke_test_${Date.now()}`;

(SHOULD_RUN ? describe : describe.skip)("M3 dispatcher staging smoke", () => {
  let createdFactId: string | null = null;
  let writeAuditId: string | null = null;
  let dispatchAuditId: string | null = null;

  afterAll(async () => {
    const supabase = createServiceClient();
    // Clean up audit rows created during the test
    if (writeAuditId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("agent_audit_log") as any).delete().eq("id", writeAuditId);
    }
    if (dispatchAuditId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("agent_audit_log") as any).delete().eq("id", dispatchAuditId);
    }
    if (createdFactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("memory_facts") as any).delete().eq("id", createdFactId);
    }
  });

  test("end-to-end: seed a fact → dispatchToolCall('read_memory') returns it with full provenance + correct audit row", async () => {
    // ----- SEED a fact via M2's writeMemoryFact -----
    const seed = await writeMemoryFact({
      host: { id: HOST_ID },
      fact: {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
        attribute: SMOKE_ATTRIBUTE,
        value: "smoke-fact-value",
        source: "host_taught",
        confidence: 0.9,
      },
      conversation_context: {
        conversation_id: "00000000-0000-4000-8000-0000000bb001",
        turn_id: "00000000-0000-4000-8000-0000000bb002",
        artifact_id: "00000000-0000-4000-8000-0000000bb003",
        source_message_text: "M3 smoke seed",
      },
    });

    expect(seed.mode).toBe("committed");
    createdFactId = seed.fact_id;
    writeAuditId = seed.audit_metadata.audit_log_id;

    // ----- DISPATCH read_memory tool -----
    const out = await dispatchToolCall(
      "read_memory",
      {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
        attribute: SMOKE_ATTRIBUTE,
      },
      {
        host: { id: HOST_ID },
        conversation_id: "00000000-0000-4000-8000-0000000cc001",
        turn_id: "00000000-0000-4000-8000-0000000cc002",
      },
    );

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("dispatch failed: " + JSON.stringify(out.error));
    dispatchAuditId = out.audit_log_id;

    // Tool's output should mirror the seeded fact through the dispatcher's
    // outputSchema validation.
    const value = out.value as {
      facts: Array<{
        id: string;
        attribute: string;
        value: unknown;
        source: string;
        confidence: number;
        learned_from: Record<string, unknown>;
        learned_at: string;
        last_used_at: string | null;
        status: string;
      }>;
      data_sufficiency: {
        fact_count: number;
        confidence_aggregate: number | null;
        has_recent_learning: boolean;
        sufficiency_signal: string;
        note: string;
      };
    };

    expect(value.facts).toHaveLength(1);
    const fact = value.facts[0];
    expect(fact.id).toBe(createdFactId);
    expect(fact.attribute).toBe(SMOKE_ATTRIBUTE);
    expect(fact.value).toBe("smoke-fact-value");
    expect(fact.source).toBe("host_taught");
    expect(fact.confidence).toBeCloseTo(0.9);
    expect(fact.status).toBe("active");

    expect(fact.learned_from.conversation_id).toBe("00000000-0000-4000-8000-0000000bb001");
    expect(fact.learned_from.artifact_id).toBe("00000000-0000-4000-8000-0000000bb003");

    expect(value.data_sufficiency.fact_count).toBe(1);
    expect(value.data_sufficiency.sufficiency_signal).toBe("sparse");
    expect(value.data_sufficiency.has_recent_learning).toBe(true);

    // ----- VERIFY the dispatcher's audit row -----
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: auditRow, error: auditErr } = await (supabase.from("agent_audit_log") as any)
      .select("action_type, source, actor_kind, autonomy_level, outcome, latency_ms, context")
      .eq("id", dispatchAuditId)
      .single();

    expect(auditErr).toBeNull();
    expect(auditRow.action_type).toBe("read_memory");
    expect(auditRow.source).toBe("agent_tool");
    expect(auditRow.actor_kind).toBe("agent");
    expect(auditRow.autonomy_level).toBe("silent");
    expect(auditRow.outcome).toBe("succeeded");
    expect(typeof auditRow.latency_ms).toBe("number");
    expect(auditRow.context.tool_name).toBe("read_memory");
    expect(auditRow.context.conversation_id).toBe("00000000-0000-4000-8000-0000000cc001");
    expect(auditRow.context.stakes_class).toBe("low");
  }, 30_000);
});
