import { writeMemoryFact } from "../write";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/action-substrate/request-action");
jest.mock("@/lib/action-substrate/audit-writer");

import { createServiceClient } from "@/lib/supabase/service";
import { requestAction } from "@/lib/action-substrate/request-action";
import { updateAuditOutcome } from "@/lib/action-substrate/audit-writer";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROP_ID = "11111111-1111-1111-1111-111111111aaa";
const FAKE_LOG_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_FACT_ID = "ff000000-0000-0000-0000-000000000001";
const FAKE_CREATED_AT = "2026-05-02T06:30:00+00:00";

function audit_metadata(overrides: Partial<{ autonomy_level: "silent" | "confirmed" | "blocked" }> = {}) {
  return {
    audit_log_id: FAKE_LOG_ID,
    autonomy_level: overrides.autonomy_level ?? ("confirmed" as const),
    actor_kind: "agent" as const,
    stakes_class: "medium" as const,
    created_at: FAKE_CREATED_AT,
  };
}

const baseInput = {
  host: { id: HOST_ID },
  fact: {
    entity_type: "property" as const,
    entity_id: PROP_ID,
    sub_entity_type: "wifi" as const,
    attribute: "wifi_password",
    value: "MyP@ssword123",
    source: "host_taught" as const,
    confidence: 1.0,
  },
  conversation_context: {
    conversation_id: "conv-1",
    turn_id: "turn-1",
    artifact_id: "art-1",
    source_message_text: "the wifi password is MyP@ssword123",
  },
};

function makeSupabaseMock(opts: { insertResult: { data?: unknown; error?: { message: string } | null } }) {
  const single = jest.fn().mockResolvedValue(opts.insertResult);
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  const supabase = { from: jest.fn().mockReturnValue({ insert }) };
  return { supabase, insert, single };
}

describe("writeMemoryFact — happy path (committed)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("calls requestAction → INSERT → updateAuditOutcome('succeeded')", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "allow",
      reason: "host confirmed via artifact",
      audit_metadata: audit_metadata(),
    });

    const { supabase, insert } = makeSupabaseMock({
      insertResult: { data: { id: FAKE_FACT_ID }, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);
    (updateAuditOutcome as jest.Mock).mockResolvedValue(undefined);

    const result = await writeMemoryFact(baseInput);

    expect(result.mode).toBe("committed");
    expect(result.fact_id).toBe(FAKE_FACT_ID);

    // Substrate consulted with the right shape
    expect(requestAction).toHaveBeenCalledTimes(1);
    const reqArg = (requestAction as jest.Mock).mock.calls[0][0];
    expect(reqArg.action_type).toBe("write_memory_fact");
    expect(reqArg.source).toBe("agent_artifact");
    expect(reqArg.context).toEqual({ artifact_id: "art-1" });
    expect(reqArg.host_id).toBe(HOST_ID);

    // INSERT included the right Tier 1 metadata
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0][0];
    expect(inserted.host_id).toBe(HOST_ID);
    expect(inserted.entity_type).toBe("property");
    expect(inserted.entity_id).toBe(PROP_ID);
    expect(inserted.sub_entity_type).toBe("wifi");
    expect(inserted.attribute).toBe("wifi_password");
    expect(inserted.source).toBe("host_taught");
    expect(inserted.confidence).toBe(1.0);

    // Provenance JSONB shape
    expect(inserted.learned_from.conversation_id).toBe("conv-1");
    expect(inserted.learned_from.turn_id).toBe("turn-1");
    expect(inserted.learned_from.artifact_id).toBe("art-1");
    expect(inserted.learned_from.source_message_text).toBe("the wifi password is MyP@ssword123");
    expect(typeof inserted.learned_from.learned_at_iso).toBe("string");

    // Audit resolved to succeeded with latency_ms
    expect(updateAuditOutcome).toHaveBeenCalledTimes(1);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "succeeded",
      expect.objectContaining({ latency_ms: expect.any(Number) }),
    );
  });

  test("optional fields default to null in the row", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "allow",
      reason: "ok",
      audit_metadata: audit_metadata(),
    });
    const { supabase, insert } = makeSupabaseMock({
      insertResult: { data: { id: FAKE_FACT_ID }, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await writeMemoryFact({
      ...baseInput,
      fact: {
        entity_type: "property",
        entity_id: PROP_ID,
        attribute: "general_note",
        value: "something",
        source: "host_taught",
        confidence: 0.9,
      },
      conversation_context: {
        conversation_id: "conv-1",
        turn_id: "turn-1",
        artifact_id: "art-1",
      },
    });

    const inserted = insert.mock.calls[0][0];
    expect(inserted.sub_entity_type).toBeNull();
    expect(inserted.sub_entity_id).toBeNull();
    expect(inserted.guest_id).toBeNull();
    expect(inserted.learned_from.source_message_text).toBeUndefined();
  });
});

describe("writeMemoryFact — blocked path", () => {
  beforeEach(() => jest.clearAllMocks());

  test("when substrate returns mode='require_confirmation', returns mode='blocked' and resolves audit to 'failed' with gate_blocked reason", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "require_confirmation",
      reason: "Action 'write_memory_fact' is medium-stakes; ...",
      audit_metadata: audit_metadata({ autonomy_level: "blocked" }),
    });
    (updateAuditOutcome as jest.Mock).mockResolvedValue(undefined);

    const result = await writeMemoryFact(baseInput);

    expect(result.mode).toBe("blocked");
    expect(result.fact_id).toBeNull();
    expect(result.reason).toMatch(/medium-stakes/);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({ error_message: expect.stringMatching(/^gate_blocked/) }),
    );
    // No DB INSERT happened
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});

describe("writeMemoryFact — failed insert path", () => {
  beforeEach(() => jest.clearAllMocks());

  test("when INSERT fails, returns mode='failed' and resolves audit to 'failed' with insert_failed reason", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "allow",
      reason: "ok",
      audit_metadata: audit_metadata(),
    });

    const { supabase } = makeSupabaseMock({
      insertResult: { data: null, error: { message: "FK violation on guest_id" } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);
    (updateAuditOutcome as jest.Mock).mockResolvedValue(undefined);

    const result = await writeMemoryFact({
      ...baseInput,
      fact: { ...baseInput.fact, guest_id: "ghost" },
    });

    expect(result.mode).toBe("failed");
    expect(result.fact_id).toBeNull();
    expect(result.reason).toMatch(/FK violation/);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({ error_message: expect.stringMatching(/^insert_failed/) }),
    );
  });
});
