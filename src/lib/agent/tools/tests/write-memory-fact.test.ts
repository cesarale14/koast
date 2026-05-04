import { writeMemoryFactTool } from "../write-memory-fact";

const PROP_ID = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "22222222-2222-4222-8222-222222222222";
const AUDIT_ID = "33333333-3333-4333-8333-333333333333";

describe("writeMemoryFactTool — declaration", () => {
  test("is a gated tool with stakesClass='medium' and artifactKind='property_knowledge_confirmation' (D35)", () => {
    expect(writeMemoryFactTool.name).toBe("write_memory_fact");
    expect(writeMemoryFactTool.requiresGate).toBe(true);
    expect(writeMemoryFactTool.stakesClass).toBe("medium");
    expect(writeMemoryFactTool.artifactKind).toBe("property_knowledge_confirmation");
    expect(typeof writeMemoryFactTool.buildProposalOutput).toBe("function");
  });
});

describe("writeMemoryFactTool — input schema validation", () => {
  test("accepts valid input with only required fields", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "front_door",
      attribute: "code",
      fact_value: "4827",
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts optional supersedes field as uuid (D35 PE convention)", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "wifi",
      attribute: "password",
      fact_value: "MyP@ssword123",
      supersedes: ARTIFACT_ID,
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts optional citation block", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "parking",
      attribute: "instructions",
      fact_value: "Park in the back driveway",
      citation: {
        source_text: "host said 'we always have guests park in the back driveway'",
        reasoning: "Direct host statement",
      },
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects sub_entity_type outside the M1 controlled vocabulary", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "neighbor", // not in the canonical 6
      attribute: "name",
      fact_value: "Joe",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty attribute", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "front_door",
      attribute: "",
      fact_value: "4827",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects non-uuid property_id", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: "not-a-uuid",
      sub_entity_type: "front_door",
      attribute: "code",
      fact_value: "4827",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects non-uuid supersedes", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "front_door",
      attribute: "code",
      fact_value: "4827",
      supersedes: "art-1", // not a uuid
    });
    expect(parsed.success).toBe(false);
  });

  test("source defaults to 'host_taught' when omitted", () => {
    const parsed = writeMemoryFactTool.inputSchema.safeParse({
      property_id: PROP_ID,
      sub_entity_type: "hvac",
      attribute: "thermostat_quirk",
      fact_value: "Hold the up button for 3 seconds to set the schedule",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.source).toBe("host_taught");
    }
  });
});

describe("writeMemoryFactTool — buildProposalOutput", () => {
  test("returns artifact_id + audit_log_id from refs + outcome='pending' + a non-empty message", () => {
    const result = writeMemoryFactTool.buildProposalOutput!(
      {
        property_id: PROP_ID,
        sub_entity_type: "front_door",
        attribute: "code",
        fact_value: "4827",
        source: "host_taught",
      },
      { host: { id: "h1" }, conversation_id: "c1", turn_id: "t1" },
      { artifact_id: ARTIFACT_ID, audit_log_id: AUDIT_ID },
    );

    expect(result.artifact_id).toBe(ARTIFACT_ID);
    expect(result.audit_log_id).toBe(AUDIT_ID);
    expect(result.outcome).toBe("pending");
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("matches the tool's outputSchema", () => {
    const result = writeMemoryFactTool.buildProposalOutput!(
      {
        property_id: PROP_ID,
        sub_entity_type: "wifi",
        attribute: "password",
        fact_value: "MyP@ssword123",
        source: "host_taught",
      },
      { host: { id: "h1" }, conversation_id: "c1", turn_id: "t1" },
      { artifact_id: ARTIFACT_ID, audit_log_id: AUDIT_ID },
    );
    const parsed = writeMemoryFactTool.outputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe("writeMemoryFactTool — handler is a guard, not the proposal-time path", () => {
  test("handler throws — should not run at proposal time (D35 dispatcher fork bypasses it)", async () => {
    await expect(
      writeMemoryFactTool.handler(
        {
          property_id: PROP_ID,
          sub_entity_type: "front_door",
          attribute: "code",
          fact_value: "4827",
          source: "host_taught",
        },
        { host: { id: "h1" }, conversation_id: "c1", turn_id: "t1" },
      ),
    ).rejects.toThrow(/should not run at proposal time/);
  });
});
