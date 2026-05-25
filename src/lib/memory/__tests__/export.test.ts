/**
 * Tests for exportMemoryForHost — M11 Phase D item 1 (M4; M8 C13 R-5).
 *
 * Lib-level scope: shape correctness + per-status / per-category
 * inclusion + HARD-FLOOR REGRESSION GUARD: the `.eq("host_id", hostId)`
 * filter lands on the memory_facts chain.
 *
 * The route-boundary adversarial test (ignoring client-supplied hostId)
 * lives in __tests__/route.test.ts — that's a separate failure class
 * (route wiring vs lib filter).
 */

import { exportMemoryForHost } from "../export";

jest.mock("@/lib/supabase/service");

import { createServiceClient } from "@/lib/supabase/service";

interface MockChain {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
}

function makeChain(opts: { data: unknown; error?: { message: string } | null }): MockChain {
  const chain: MockChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: opts.data,
      error: opts.error ?? null,
    }),
  };
  return chain;
}

function makeSupabase(chain: MockChain) {
  return { from: jest.fn().mockReturnValue(chain) };
}

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const OTHER_HOST = "00000000-0000-0000-0000-000000000bbb";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("exportMemoryForHost — shape correctness", () => {
  test("returns metadata + grouped memory_facts on happy path", async () => {
    const rows = [
      {
        id: "f1",
        host_id: HOST_ID,
        entity_type: "host",
        entity_id: HOST_ID,
        sub_entity_type: "voice",
        sub_entity_id: null,
        guest_id: null,
        attribute: "voice_mode",
        value: { mode: "learned" },
        source: "inferred",
        confidence: 0.8,
        learned_from: {},
        status: "active",
        superseded_by: null,
        learned_at: "2026-05-23T22:04:50Z",
        last_used_at: null,
        created_at: "2026-05-23T22:04:50Z",
        updated_at: "2026-05-23T22:04:50Z",
        supersession_reason: null,
      },
      {
        id: "f2",
        host_id: HOST_ID,
        entity_type: "property",
        entity_id: "prop-1",
        sub_entity_type: "wifi",
        sub_entity_id: null,
        guest_id: null,
        attribute: "password",
        value: "abc123",
        source: "host_taught",
        confidence: 1.0,
        learned_from: {},
        status: "active",
        superseded_by: null,
        learned_at: "2026-05-20T10:00:00Z",
        last_used_at: null,
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
        supersession_reason: null,
      },
    ];
    const chain = makeChain({ data: rows, error: null });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    const result = await exportMemoryForHost(HOST_ID);

    expect(result.host_id).toBe(HOST_ID);
    expect(result.fact_count).toBe(2);
    expect(result.koast_version).toBe("M11-Phase-D");
    expect(typeof result.exported_at).toBe("string");
    expect(result.memory_facts.host?.voice).toHaveLength(1);
    expect(result.memory_facts.property?.wifi).toHaveLength(1);
    expect(result.memory_facts.host?.voice?.[0].id).toBe("f1");
  });

  test("groups rows with sub_entity_type=null under '_unspecified'", async () => {
    const rows = [
      {
        id: "f3",
        host_id: HOST_ID,
        entity_type: "host",
        entity_id: HOST_ID,
        sub_entity_type: null,
        sub_entity_id: null,
        guest_id: null,
        attribute: "name",
        value: "Cesar",
        source: "host_taught",
        confidence: 1.0,
        learned_from: {},
        status: "active",
        superseded_by: null,
        learned_at: "2026-05-01T00:00:00Z",
        last_used_at: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        supersession_reason: null,
      },
    ];
    const chain = makeChain({ data: rows });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    const result = await exportMemoryForHost(HOST_ID);

    expect(result.memory_facts.host?._unspecified).toHaveLength(1);
    expect(result.memory_facts.host?._unspecified?.[0].attribute).toBe("name");
  });

  test("includes superseded + deprecated rows with status field intact", async () => {
    const rows = [
      {
        id: "f-active",
        host_id: HOST_ID,
        entity_type: "host",
        entity_id: HOST_ID,
        sub_entity_type: "voice",
        sub_entity_id: null,
        guest_id: null,
        attribute: "voice_mode",
        value: { mode: "learned" },
        source: "inferred",
        confidence: 0.8,
        learned_from: {},
        status: "active",
        superseded_by: null,
        learned_at: "2026-05-25T00:00:00Z",
        last_used_at: null,
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
        supersession_reason: null,
      },
      {
        id: "f-superseded",
        host_id: HOST_ID,
        entity_type: "host",
        entity_id: HOST_ID,
        sub_entity_type: "voice",
        sub_entity_id: null,
        guest_id: null,
        attribute: "voice_mode",
        value: { mode: "neutral" },
        source: "inferred",
        confidence: 0.5,
        learned_from: {},
        status: "superseded",
        superseded_by: "f-active",
        learned_at: "2026-05-23T00:00:00Z",
        last_used_at: null,
        created_at: "2026-05-23T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
        supersession_reason: "outdated",
      },
      {
        id: "f-deprecated",
        host_id: HOST_ID,
        entity_type: "host",
        entity_id: HOST_ID,
        sub_entity_type: "reviews",
        sub_entity_id: null,
        guest_id: null,
        attribute: "tone",
        value: "warm",
        source: "host_taught",
        confidence: 1.0,
        learned_from: {},
        status: "deprecated",
        superseded_by: null,
        learned_at: "2026-05-15T00:00:00Z",
        last_used_at: null,
        created_at: "2026-05-15T00:00:00Z",
        updated_at: "2026-05-20T00:00:00Z",
        supersession_reason: null,
      },
    ];
    const chain = makeChain({ data: rows });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    const result = await exportMemoryForHost(HOST_ID);

    expect(result.fact_count).toBe(3);
    const allFacts = [
      ...(result.memory_facts.host?.voice ?? []),
      ...(result.memory_facts.host?.reviews ?? []),
    ];
    expect(allFacts.find((f) => f.id === "f-superseded")?.status).toBe("superseded");
    expect(allFacts.find((f) => f.id === "f-superseded")?.supersession_reason).toBe("outdated");
    expect(allFacts.find((f) => f.id === "f-deprecated")?.status).toBe("deprecated");
  });

  test("empty case: returns metadata + empty groups when 0 facts", async () => {
    const chain = makeChain({ data: [] });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    const result = await exportMemoryForHost(HOST_ID);

    expect(result.fact_count).toBe(0);
    expect(result.memory_facts).toEqual({});
    expect(result.host_id).toBe(HOST_ID);
    expect(typeof result.exported_at).toBe("string");
  });

  test("propagates DB error from supabase query", async () => {
    const chain = makeChain({
      data: null,
      error: { message: "permission denied" },
    });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    await expect(exportMemoryForHost(HOST_ID)).rejects.toThrow(/permission denied/);
  });
});

describe("exportMemoryForHost — HARD-FLOOR regression guard (cross-host isolation)", () => {
  test("REGRESSION GUARD: .eq('host_id', hostId) is applied to the memory_facts query", async () => {
    // Direct landmine guard for cross-host data isolation. Mirrors
    // M11 Phase A item 1's extraction-worker regression guard.
    const chain = makeChain({ data: [] });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    await exportMemoryForHost(HOST_ID);

    // The supabase chain must invoke .eq with ("host_id", HOST_ID).
    // If the filter ever drops or the column name changes, this test
    // fails before the regression reaches CI/prod.
    expect(chain.eq).toHaveBeenCalledWith("host_id", HOST_ID);
  });

  test("REGRESSION GUARD: filter scopes precisely to the passed hostId (different host = different .eq arg)", async () => {
    const chain = makeChain({ data: [] });
    (createServiceClient as jest.Mock).mockReturnValue(makeSupabase(chain));

    await exportMemoryForHost(OTHER_HOST);

    expect(chain.eq).toHaveBeenCalledWith("host_id", OTHER_HOST);
    // And NOT with the previous host's id (would indicate cached/leaked filter).
    expect(chain.eq).not.toHaveBeenCalledWith("host_id", HOST_ID);
  });
});
