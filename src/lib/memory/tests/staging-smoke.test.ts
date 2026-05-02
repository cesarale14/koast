/**
 * Staging smoke test for the Milestone 2 memory handlers.
 *
 * Skipped by default. Runs only when `RUN_STAGING_SMOKE=1` is set in
 * the environment AND the staging Supabase env vars are sourced
 * (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY pointing at
 * staging, NOT production).
 *
 * Pre-conditions: a wrapper script must create the test user/property
 * before invoking this test. The smoke test itself only exercises the
 * memory handlers; user/property management is out of scope.
 *
 * Verifies end-to-end roundtrip: writeMemoryFact creates a fact with
 * full provenance, readMemory finds it, the audit_log row is at
 * outcome='succeeded'. Cleans up the fact + audit row in afterAll;
 * leaves the test user/property in place for repeatability.
 */

import { writeMemoryFact } from "../write";
import { readMemory } from "../read";
import { createServiceClient } from "@/lib/supabase/service";

const SHOULD_RUN = process.env.RUN_STAGING_SMOKE === "1";
const HOST_ID = process.env.SMOKE_HOST_ID ?? "00000000-0000-0000-0000-0000000aa001";
const PROP_ID = process.env.SMOKE_PROP_ID ?? "11111111-1111-1111-1111-1111111aa001";
const SMOKE_ATTRIBUTE = `smoke_test_${Date.now()}`;

(SHOULD_RUN ? describe : describe.skip)("staging smoke", () => {
  let createdFactId: string | null = null;
  let auditLogId: string | null = null;

  afterAll(async () => {
    const supabase = createServiceClient();
    if (createdFactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("memory_facts") as any).delete().eq("id", createdFactId);
    }
    if (auditLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("agent_audit_log") as any).delete().eq("id", auditLogId);
    }
  });

  test("end-to-end: write → read → audit row at 'succeeded'", async () => {
    // ----- WRITE -----
    const writeResult = await writeMemoryFact({
      host: { id: HOST_ID },
      fact: {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
        attribute: SMOKE_ATTRIBUTE,
        value: "smoke-value",
        source: "host_taught",
        confidence: 0.95,
      },
      conversation_context: {
        conversation_id: "00000000-0000-0000-0000-0000000bb001",
        turn_id: "00000000-0000-0000-0000-0000000bb002",
        artifact_id: "00000000-0000-0000-0000-0000000bb003",
        source_message_text: "smoke test payload",
      },
    });

    expect(writeResult.mode).toBe("committed");
    expect(writeResult.fact_id).toBeTruthy();
    createdFactId = writeResult.fact_id;
    auditLogId = writeResult.audit_metadata.audit_log_id;

    expect(writeResult.audit_metadata.autonomy_level).toBe("confirmed");
    expect(writeResult.audit_metadata.actor_kind).toBe("agent");
    expect(writeResult.audit_metadata.stakes_class).toBe("low");

    // ----- READ -----
    const readResult = await readMemory({
      host: { id: HOST_ID },
      scope: {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
      },
      query: { attribute: SMOKE_ATTRIBUTE },
    });

    expect(readResult.facts).toHaveLength(1);
    const fact = readResult.facts[0];
    expect(fact.id).toBe(createdFactId);
    expect(fact.attribute).toBe(SMOKE_ATTRIBUTE);
    expect(fact.value).toBe("smoke-value");
    expect(fact.source).toBe("host_taught");
    expect(fact.confidence).toBeCloseTo(0.95);
    expect(fact.status).toBe("active");

    const learnedFrom = fact.learned_from as Record<string, unknown>;
    expect(learnedFrom.conversation_id).toBe("00000000-0000-0000-0000-0000000bb001");
    expect(learnedFrom.turn_id).toBe("00000000-0000-0000-0000-0000000bb002");
    expect(learnedFrom.artifact_id).toBe("00000000-0000-0000-0000-0000000bb003");
    expect(learnedFrom.source_message_text).toBe("smoke test payload");
    expect(typeof learnedFrom.learned_at_iso).toBe("string");

    expect(readResult.data_sufficiency.fact_count).toBe(1);
    expect(readResult.data_sufficiency.sufficiency_signal).toBe("sparse");
    expect(readResult.data_sufficiency.has_recent_learning).toBe(true);

    // ----- AUDIT VERIFICATION -----
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: auditRow, error: auditErr } = await (supabase.from("agent_audit_log") as any)
      .select("outcome, action_type, autonomy_level, source, actor_kind, latency_ms, context")
      .eq("id", auditLogId)
      .single();

    expect(auditErr).toBeNull();
    expect(auditRow.outcome).toBe("succeeded");
    expect(auditRow.action_type).toBe("memory_fact_write");
    expect(auditRow.autonomy_level).toBe("confirmed");
    expect(auditRow.source).toBe("agent_artifact");
    expect(auditRow.actor_kind).toBe("agent");
    expect(typeof auditRow.latency_ms).toBe("number");
    expect(auditRow.context.stakes_class).toBe("low");
  }, 30_000);
});
