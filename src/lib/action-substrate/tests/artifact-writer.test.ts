import { writeArtifact, updateArtifactState } from "../artifact-writer";

jest.mock("@/lib/supabase/service");

import { createServiceClient } from "@/lib/supabase/service";

interface MockBuilder {
  insert: jest.Mock;
  update: jest.Mock;
  select: jest.Mock;
  single: jest.Mock;
  eq: jest.Mock;
}

function makeBuilder(opts: {
  insertResult?: { data?: unknown; error?: { message: string } | null };
  updateResult?: { error?: { message: string } | null };
}): MockBuilder {
  const builder: MockBuilder = {
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(),
    eq: jest.fn(),
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(opts.insertResult ?? { data: null, error: null }),
  );

  // .update(...).eq(...) — eq() resolves the chain (await on it).
  builder.eq.mockImplementation(() =>
    Promise.resolve(opts.updateResult ?? { error: null }),
  );

  return builder;
}

const CONVERSATION_ID = "00000000-0000-0000-0000-000000000aaa";
const TURN_ID = "00000000-0000-0000-0000-000000000bbb";
const AUDIT_LOG_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_ARTIFACT_ID = "22222222-2222-2222-2222-222222222222";
const FAKE_CREATED_AT = "2026-05-04T03:30:00+00:00";

describe("writeArtifact", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("inserts a row with audit_log_id paired ref and supersedes=null when omitted", async () => {
    const builder = makeBuilder({
      insertResult: { data: { id: FAKE_ARTIFACT_ID, created_at: FAKE_CREATED_AT } },
    });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await writeArtifact({
      conversation_id: CONVERSATION_ID,
      turn_id: TURN_ID,
      kind: "property_knowledge_confirmation",
      payload: { property_id: "p1", sub_entity_type: "front_door", fact_value: "4827" },
      audit_log_id: AUDIT_LOG_ID,
    });

    expect(result).toEqual({
      artifact_id: FAKE_ARTIFACT_ID,
      created_at: FAKE_CREATED_AT,
    });
    expect(supabase.from).toHaveBeenCalledWith("agent_artifacts");
    expect(builder.insert).toHaveBeenCalledTimes(1);

    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted.conversation_id).toBe(CONVERSATION_ID);
    expect(inserted.turn_id).toBe(TURN_ID);
    expect(inserted.kind).toBe("property_knowledge_confirmation");
    expect(inserted.audit_log_id).toBe(AUDIT_LOG_ID);
    expect(inserted.supersedes).toBeNull();
    // state is not included on insert; the column default of 'emitted' applies.
    expect(inserted.state).toBeUndefined();
  });

  test("when supersedes is set, inserts the new row AND cascades prior to state='superseded'", async () => {
    const builder = makeBuilder({
      insertResult: { data: { id: FAKE_ARTIFACT_ID, created_at: FAKE_CREATED_AT } },
      updateResult: { error: null },
    });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const PRIOR_ID = "33333333-3333-3333-3333-333333333333";

    await writeArtifact({
      conversation_id: CONVERSATION_ID,
      turn_id: TURN_ID,
      kind: "property_knowledge_confirmation",
      payload: { property_id: "p1", sub_entity_type: "front_door", fact_value: "4827" },
      audit_log_id: AUDIT_LOG_ID,
      supersedes: PRIOR_ID,
    });

    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted.supersedes).toBe(PRIOR_ID);
    // Cascade update fired
    expect(builder.update).toHaveBeenCalledWith({ state: "superseded" });
    expect(builder.eq).toHaveBeenCalledWith("id", PRIOR_ID);
  });

  test("cascade failure is non-fatal — new artifact still returns its id", async () => {
    const builder = makeBuilder({
      insertResult: { data: { id: FAKE_ARTIFACT_ID, created_at: FAKE_CREATED_AT } },
      updateResult: { error: { message: "prior row not found" } },
    });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const PRIOR_ID = "33333333-3333-3333-3333-333333333333";

    const result = await writeArtifact({
      conversation_id: CONVERSATION_ID,
      turn_id: TURN_ID,
      kind: "property_knowledge_confirmation",
      payload: {},
      audit_log_id: AUDIT_LOG_ID,
      supersedes: PRIOR_ID,
    });

    expect(result.artifact_id).toBe(FAKE_ARTIFACT_ID);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Cascade to mark.*superseded failed.*prior row not found/),
    );

    warnSpy.mockRestore();
  });

  test("throws when the insert returns an error", async () => {
    const builder = makeBuilder({
      insertResult: { data: null, error: { message: "permission denied" } },
    });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await expect(
      writeArtifact({
        conversation_id: CONVERSATION_ID,
        turn_id: TURN_ID,
        kind: "property_knowledge_confirmation",
        payload: {},
        audit_log_id: AUDIT_LOG_ID,
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("updateArtifactState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updates state and sets committed_at for non-emitted states", async () => {
    const builder = makeBuilder({ updateResult: { error: null } });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await updateArtifactState(FAKE_ARTIFACT_ID, "confirmed", {
      commit_metadata: { memory_fact_id: "mf1" },
    });

    const update = builder.update.mock.calls[0][0];
    expect(update.state).toBe("confirmed");
    expect(typeof update.committed_at).toBe("string");
    expect(update.commit_metadata).toEqual({ memory_fact_id: "mf1" });
    expect(builder.eq).toHaveBeenCalledWith("id", FAKE_ARTIFACT_ID);
  });

  test("does not include commit_metadata when omitted", async () => {
    const builder = makeBuilder({ updateResult: { error: null } });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await updateArtifactState(FAKE_ARTIFACT_ID, "dismissed");

    const update = builder.update.mock.calls[0][0];
    expect(update.state).toBe("dismissed");
    expect(update.commit_metadata).toBeUndefined();
  });

  test("throws when the update returns an error", async () => {
    const builder = makeBuilder({ updateResult: { error: { message: "constraint violation" } } });
    const supabase = { from: jest.fn().mockReturnValue(builder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await expect(
      updateArtifactState(FAKE_ARTIFACT_ID, "confirmed"),
    ).rejects.toThrow(/constraint violation/);
  });
});
