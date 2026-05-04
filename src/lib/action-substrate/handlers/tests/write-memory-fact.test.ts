import { writeMemoryFactHandler } from "../write-memory-fact";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/memory/write");

import { createServiceClient } from "@/lib/supabase/service";
import { writeMemoryFact } from "@/lib/memory/write";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROP_ID = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "22222222-2222-4222-8222-222222222222";
const NEW_FACT_ID = "33333333-3333-4333-8333-333333333333";
const PRIOR_FACT_ID = "44444444-4444-4444-8444-444444444444";

interface PropertyOwnershipMock {
  data?: { id: string; user_id: string } | null;
  error?: { message: string } | null;
}

interface MemoryFactsUpdateMock {
  error?: { message: string } | null;
}

function makeSupabaseMock(opts: {
  property?: PropertyOwnershipMock;
  memoryFactsUpdate?: MemoryFactsUpdateMock;
}) {
  // The handler queries properties.user_id (M1 column name).
  // Tests adapted: data.user_id is what's compared to host_id.
  const propertySingle = jest
    .fn()
    .mockResolvedValue(opts.property ?? { data: null, error: null });
  const propertyEq2 = jest.fn().mockReturnValue({ single: propertySingle });
  const propertySelect = jest.fn().mockReturnValue({ eq: propertyEq2 });

  const updateEq2 = jest
    .fn()
    .mockResolvedValue(opts.memoryFactsUpdate ?? { error: null });
  const updateEq1 = jest.fn().mockReturnValue({ eq: updateEq2 });
  const updateMock = jest.fn().mockReturnValue({ eq: updateEq1 });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === "properties") {
      return { select: propertySelect };
    }
    if (table === "memory_facts") {
      return { update: updateMock };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });

  const client = { from };
  return { client, updateMock, updateEq1, updateEq2 };
}

const baseInput = {
  host_id: HOST_ID,
  conversation_id: "conv-1",
  turn_id: "turn-1",
  artifact_id: ARTIFACT_ID,
  payload: {
    property_id: PROP_ID,
    sub_entity_type: "front_door" as const,
    attribute: "code",
    fact_value: "4827",
    source: "host_taught" as const,
  },
};

describe("writeMemoryFactHandler — happy path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("validates ownership, calls writeMemoryFact, returns memory_fact_id", async () => {
    const { client } = makeSupabaseMock({
      property: { data: { id: PROP_ID, user_id: HOST_ID } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    (writeMemoryFact as jest.Mock).mockResolvedValue({
      mode: "committed",
      fact_id: NEW_FACT_ID,
      reason: "ok",
      audit_metadata: { audit_log_id: "audit-x" },
    });

    const result = await writeMemoryFactHandler(baseInput);

    expect(result).toEqual({
      memory_fact_id: NEW_FACT_ID,
      superseded_memory_fact_id: null,
    });
    expect(writeMemoryFact).toHaveBeenCalledTimes(1);
    const call = (writeMemoryFact as jest.Mock).mock.calls[0][0];
    expect(call.host).toEqual({ id: HOST_ID });
    expect(call.fact.entity_type).toBe("property");
    expect(call.fact.entity_id).toBe(PROP_ID);
    expect(call.fact.attribute).toBe("code");
    expect(call.fact.value).toBe("4827");
    expect(call.conversation_context.artifact_id).toBe(ARTIFACT_ID);
  });
});

describe("writeMemoryFactHandler — ownership", () => {
  beforeEach(() => jest.clearAllMocks());

  test("throws when property is owned by a different host", async () => {
    const { client } = makeSupabaseMock({
      property: { data: { id: PROP_ID, user_id: "different-host" } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);

    await expect(writeMemoryFactHandler(baseInput)).rejects.toThrow(
      /does not own property/,
    );
    expect(writeMemoryFact).not.toHaveBeenCalled();
  });

  test("throws when property does not exist", async () => {
    const { client } = makeSupabaseMock({
      property: { data: null, error: { message: "no rows" } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);

    await expect(writeMemoryFactHandler(baseInput)).rejects.toThrow(
      /not found/,
    );
    expect(writeMemoryFact).not.toHaveBeenCalled();
  });
});

describe("writeMemoryFactHandler — supersession at the persisted-data layer", () => {
  beforeEach(() => jest.clearAllMocks());

  test("when supersedes_memory_fact_id is set, updates prior row status='superseded' + superseded_by=<new id>", async () => {
    const { client, updateMock, updateEq1, updateEq2 } = makeSupabaseMock({
      property: { data: { id: PROP_ID, user_id: HOST_ID } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    (writeMemoryFact as jest.Mock).mockResolvedValue({
      mode: "committed",
      fact_id: NEW_FACT_ID,
      reason: "ok",
      audit_metadata: { audit_log_id: "audit-x" },
    });

    const result = await writeMemoryFactHandler({
      ...baseInput,
      payload: {
        ...baseInput.payload,
        supersedes_memory_fact_id: PRIOR_FACT_ID,
      },
    });

    expect(result.superseded_memory_fact_id).toBe(PRIOR_FACT_ID);
    expect(updateMock).toHaveBeenCalledWith({
      status: "superseded",
      superseded_by: NEW_FACT_ID,
    });
    expect(updateEq1).toHaveBeenCalledWith("id", PRIOR_FACT_ID);
    expect(updateEq2).toHaveBeenCalledWith("host_id", HOST_ID);
  });

  test("supersession update failure is non-fatal — new fact still commits", async () => {
    const { client } = makeSupabaseMock({
      property: { data: { id: PROP_ID, user_id: HOST_ID } },
      memoryFactsUpdate: { error: { message: "no prior row" } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    (writeMemoryFact as jest.Mock).mockResolvedValue({
      mode: "committed",
      fact_id: NEW_FACT_ID,
      reason: "ok",
      audit_metadata: { audit_log_id: "audit-x" },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await writeMemoryFactHandler({
      ...baseInput,
      payload: {
        ...baseInput.payload,
        supersedes_memory_fact_id: PRIOR_FACT_ID,
      },
    });

    expect(result.memory_fact_id).toBe(NEW_FACT_ID);
    expect(result.superseded_memory_fact_id).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Supersession update failed.*non-fatal.*no prior row/),
    );
    warnSpy.mockRestore();
  });
});

describe("writeMemoryFactHandler — write failure propagates", () => {
  beforeEach(() => jest.clearAllMocks());

  test("throws when writeMemoryFact returns mode='blocked'", async () => {
    const { client } = makeSupabaseMock({
      property: { data: { id: PROP_ID, user_id: HOST_ID } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    (writeMemoryFact as jest.Mock).mockResolvedValue({
      mode: "blocked",
      fact_id: null,
      reason: "substrate_blocked",
      audit_metadata: { audit_log_id: "audit-x" },
    });

    await expect(writeMemoryFactHandler(baseInput)).rejects.toThrow(
      /Memory write failed.*blocked/,
    );
  });

  test("throws when writeMemoryFact returns mode='failed'", async () => {
    const { client } = makeSupabaseMock({
      property: { data: { id: PROP_ID, user_id: HOST_ID } },
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    (writeMemoryFact as jest.Mock).mockResolvedValue({
      mode: "failed",
      fact_id: null,
      reason: "insert_failed: db error",
      audit_metadata: { audit_log_id: "audit-x" },
    });

    await expect(writeMemoryFactHandler(baseInput)).rejects.toThrow(
      /Memory write failed.*failed/,
    );
  });
});
