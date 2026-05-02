import { readMemoryTool } from "../read-memory";
import type { ToolHandlerContext } from "../../types";

jest.mock("@/lib/memory/read");

import { readMemory } from "@/lib/memory/read";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROP_ID = "11111111-1111-4111-8111-111111111111";

const ctx: ToolHandlerContext = {
  host: { id: HOST_ID },
  conversation_id: "conv-1",
  turn_id: "turn-1",
};

describe("readMemoryTool — input schema validation", () => {
  test("accepts valid input with only required fields", () => {
    const parsed = readMemoryTool.inputSchema.safeParse({
      entity_type: "property",
      entity_id: PROP_ID,
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts valid input with all optional fields", () => {
    const parsed = readMemoryTool.inputSchema.safeParse({
      entity_type: "property",
      entity_id: PROP_ID,
      sub_entity_type: "wifi",
      sub_entity_id: "main_router",
      attribute: "password",
      freshness_threshold_days: 30,
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects entity_type other than 'property' (v1 scope)", () => {
    const parsed = readMemoryTool.inputSchema.safeParse({
      entity_type: "guest",
      entity_id: PROP_ID,
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects sub_entity_type outside controlled vocab", () => {
    const parsed = readMemoryTool.inputSchema.safeParse({
      entity_type: "property",
      entity_id: PROP_ID,
      sub_entity_type: "frontdoor", // typo, missing underscore
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts every canonical sub_entity_type value", () => {
    const canonical = ["front_door", "lock", "parking", "wifi", "hvac", "kitchen_appliances"] as const;
    for (const v of canonical) {
      const parsed = readMemoryTool.inputSchema.safeParse({
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: v,
      });
      expect(parsed.success).toBe(true);
    }
  });

  test("rejects non-uuid entity_id", () => {
    const parsed = readMemoryTool.inputSchema.safeParse({
      entity_type: "property",
      entity_id: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects negative freshness_threshold_days", () => {
    const parsed = readMemoryTool.inputSchema.safeParse({
      entity_type: "property",
      entity_id: PROP_ID,
      freshness_threshold_days: -7,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("readMemoryTool — handler delegates to readMemory()", () => {
  beforeEach(() => jest.clearAllMocks());

  test("forwards scope + query to the M2 readMemory handler", async () => {
    (readMemory as jest.Mock).mockResolvedValue({
      facts: [],
      data_sufficiency: {
        fact_count: 0,
        confidence_aggregate: null,
        has_recent_learning: false,
        sufficiency_signal: "empty",
        note: "No facts yet about this property — this would be new learning.",
      },
    });

    const result = await readMemoryTool.handler(
      {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
        attribute: "password",
        freshness_threshold_days: 30,
      },
      ctx,
    );

    expect(readMemory).toHaveBeenCalledWith({
      host: { id: HOST_ID },
      scope: {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
        sub_entity_id: undefined,
      },
      query: {
        attribute: "password",
        freshness_threshold_days: 30,
      },
    });
    expect(result.facts).toEqual([]);
    expect(result.data_sufficiency.sufficiency_signal).toBe("empty");
  });

  test("output shape passes the tool's outputSchema", async () => {
    (readMemory as jest.Mock).mockResolvedValue({
      facts: [
        {
          id: "fact-1",
          attribute: "wifi_password",
          value: "MyP@ssword",
          source: "host_taught",
          confidence: 1.0,
          learned_from: { conversation_id: "conv-1" },
          learned_at: new Date().toISOString(),
          last_used_at: null,
          status: "active",
        },
      ],
      data_sufficiency: {
        fact_count: 1,
        confidence_aggregate: 1.0,
        has_recent_learning: true,
        sufficiency_signal: "sparse",
        note: "Found 1 fact about this property; most recent learned within the last week.",
      },
    });

    const out = await readMemoryTool.handler(
      { entity_type: "property", entity_id: PROP_ID },
      ctx,
    );
    const parsed = readMemoryTool.outputSchema.safeParse(out);
    expect(parsed.success).toBe(true);
  });

  test("handler propagates errors from readMemory", async () => {
    (readMemory as jest.Mock).mockRejectedValue(new Error("DB unavailable"));

    await expect(
      readMemoryTool.handler({ entity_type: "property", entity_id: PROP_ID }, ctx),
    ).rejects.toThrow(/DB unavailable/);
  });
});

describe("readMemoryTool — registration metadata", () => {
  test("name is 'read_memory' and not gated", () => {
    expect(readMemoryTool.name).toBe("read_memory");
    expect(readMemoryTool.requiresGate).toBe(false);
  });

  test("description orients the model around when to call (not just what)", () => {
    expect(readMemoryTool.description).toMatch(/Call this BEFORE/);
    expect(readMemoryTool.description).toMatch(/data_sufficiency/);
    expect(readMemoryTool.description).toMatch(/'empty' or 'sparse'/);
  });
});
