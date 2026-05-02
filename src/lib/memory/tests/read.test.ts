import { readMemory } from "../read";

jest.mock("@/lib/supabase/service");

import { createServiceClient } from "@/lib/supabase/service";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROP_ID = "11111111-1111-1111-1111-111111111aaa";

interface QueryRecorder {
  filters: Array<[string, string, unknown] | [string, unknown[]]>;
  ordered: { column: string; ascending: boolean } | null;
}

interface MockOpts {
  rows: unknown[];
  selectError?: { message: string } | null;
}

function makeMock(opts: MockOpts): { supabase: { from: jest.Mock }; recorder: QueryRecorder; updateBuilder: { update: jest.Mock; in: jest.Mock } } {
  const recorder: QueryRecorder = { filters: [], ordered: null };

  const updateBuilder = {
    update: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ error: null }),
  };

  const queryBuilder: Record<string, unknown> = {};

  const eq = jest.fn().mockImplementation((column: string, value: unknown) => {
    recorder.filters.push([column, "eq", value]);
    return queryBuilder;
  });
  const inFn = jest.fn().mockImplementation((column: string, values: unknown[]) => {
    recorder.filters.push([column, values]);
    return queryBuilder;
  });
  const gte = jest.fn().mockImplementation((column: string, value: unknown) => {
    recorder.filters.push([column, "gte", value]);
    return queryBuilder;
  });
  const order = jest.fn().mockImplementation((column: string, options: { ascending: boolean }) => {
    recorder.ordered = { column, ascending: options.ascending };
    return Promise.resolve({
      data: opts.rows,
      error: opts.selectError ?? null,
    });
  });
  const select = jest.fn().mockReturnValue(queryBuilder);

  Object.assign(queryBuilder, { eq, in: inFn, gte, order, select });

  // Each from() call may be either the query (select) or the
  // last_used_at update. The first call returns the queryBuilder
  // (with select), the second call returns the updateBuilder (which
  // exposes update().in()).
  let fromCall = 0;
  const fromBuilder: { select: jest.Mock; update: jest.Mock } = {
    select,
    update: updateBuilder.update,
  };
  const supabase = {
    from: jest.fn().mockImplementation(() => {
      fromCall += 1;
      return fromCall === 1 ? fromBuilder : updateBuilder;
    }),
  };

  return { supabase, recorder, updateBuilder };
}

const baseRow = {
  id: "fact-1",
  attribute: "wifi_password",
  value: "MyP@ssword123",
  source: "host_taught",
  confidence: 1.0,
  learned_from: { conversation_id: "conv-1" },
  learned_at: new Date().toISOString(),
  last_used_at: null,
  status: "active",
};

describe("readMemory — empty result", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns empty facts and sufficiency_signal='empty'", async () => {
    const { supabase } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(result.facts).toEqual([]);
    expect(result.data_sufficiency.fact_count).toBe(0);
    expect(result.data_sufficiency.sufficiency_signal).toBe("empty");
    expect(result.data_sufficiency.confidence_aggregate).toBeNull();
    expect(result.data_sufficiency.has_recent_learning).toBe(false);
    expect(result.data_sufficiency.note).toMatch(/No facts yet/);
  });
});

describe("readMemory — sparse vs rich signal", () => {
  beforeEach(() => jest.clearAllMocks());

  test("1 fact → sparse", async () => {
    const { supabase } = makeMock({ rows: [baseRow] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(result.facts).toHaveLength(1);
    expect(result.data_sufficiency.sufficiency_signal).toBe("sparse");
    expect(result.data_sufficiency.fact_count).toBe(1);
    expect(result.data_sufficiency.confidence_aggregate).toBeCloseTo(1.0);
  });

  test("2 facts → sparse", async () => {
    const rows = [
      { ...baseRow, id: "fact-1", confidence: 1.0 },
      { ...baseRow, id: "fact-2", confidence: 0.8 },
    ];
    const { supabase } = makeMock({ rows });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(result.data_sufficiency.sufficiency_signal).toBe("sparse");
    expect(result.data_sufficiency.confidence_aggregate).toBeCloseTo(0.9);
  });

  test("3 facts → rich", async () => {
    const rows = [
      { ...baseRow, id: "fact-1", confidence: 1.0 },
      { ...baseRow, id: "fact-2", confidence: 0.8 },
      { ...baseRow, id: "fact-3", confidence: 0.6 },
    ];
    const { supabase } = makeMock({ rows });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(result.data_sufficiency.sufficiency_signal).toBe("rich");
    expect(result.data_sufficiency.confidence_aggregate).toBeCloseTo(0.8);
  });
});

describe("readMemory — has_recent_learning", () => {
  beforeEach(() => jest.clearAllMocks());

  test("recent fact (<7 days) → has_recent_learning true", async () => {
    const recentRow = { ...baseRow, learned_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() };
    const { supabase } = makeMock({ rows: [recentRow] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(result.data_sufficiency.has_recent_learning).toBe(true);
    expect(result.data_sufficiency.note).toMatch(/most recent learned within the last week/);
  });

  test("old fact (>7 days) → has_recent_learning false", async () => {
    const oldRow = { ...baseRow, learned_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() };
    const { supabase } = makeMock({ rows: [oldRow] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(result.data_sufficiency.has_recent_learning).toBe(false);
    expect(result.data_sufficiency.note).not.toMatch(/most recent/);
  });
});

describe("readMemory — query filters", () => {
  beforeEach(() => jest.clearAllMocks());

  test("scope filters: entity_type + entity_id always applied; sub_entity_type optional", async () => {
    const { supabase, recorder } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: {
        entity_type: "property",
        entity_id: PROP_ID,
        sub_entity_type: "wifi",
      },
      query: {},
    });

    const eqFilters = recorder.filters
      .filter((f): f is [string, string, unknown] => f.length === 3 && f[1] === "eq")
      .map((f) => f[0]);

    expect(eqFilters).toContain("host_id");
    expect(eqFilters).toContain("entity_type");
    expect(eqFilters).toContain("entity_id");
    expect(eqFilters).toContain("sub_entity_type");
  });

  test("attribute filter is applied when provided", async () => {
    const { supabase, recorder } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: { attribute: "unlock_mechanism" },
    });

    const attributeFilter = recorder.filters.find(
      (f) => f.length === 3 && f[0] === "attribute",
    );
    expect(attributeFilter).toBeDefined();
    expect(attributeFilter?.[2]).toBe("unlock_mechanism");
  });

  test("default status filter is 'active'", async () => {
    const { supabase, recorder } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    const statusFilter = recorder.filters.find(
      (f) => f.length === 3 && f[0] === "status",
    );
    expect(statusFilter?.[2]).toBe("active");
  });

  test("include_superseded=true uses 'in' filter for status", async () => {
    const { supabase, recorder } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: { include_superseded: true },
    });

    const statusInFilter = recorder.filters.find(
      (f) => f.length === 2 && f[0] === "status",
    );
    expect(statusInFilter).toBeDefined();
    expect(statusInFilter?.[1]).toEqual(["active", "superseded"]);
  });

  test("freshness_threshold_days applies a learned_at gte filter", async () => {
    const { supabase, recorder } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: { freshness_threshold_days: 14 },
    });

    const gteFilter = recorder.filters.find(
      (f) => f.length === 3 && f[1] === "gte" && f[0] === "learned_at",
    );
    expect(gteFilter).toBeDefined();
  });
});

describe("readMemory — last_used_at update on access", () => {
  beforeEach(() => jest.clearAllMocks());

  test("updates last_used_at for returned active facts", async () => {
    const { supabase, updateBuilder } = makeMock({ rows: [baseRow] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(updateBuilder.update).toHaveBeenCalledTimes(1);
    const updatePayload = updateBuilder.update.mock.calls[0][0];
    expect(updatePayload.last_used_at).toBeDefined();
    expect(updateBuilder.in).toHaveBeenCalledWith("id", [baseRow.id]);
  });

  test("does NOT update last_used_at when zero facts returned", async () => {
    const { supabase, updateBuilder } = makeMock({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await readMemory({
      host: { id: HOST_ID },
      scope: { entity_type: "property", entity_id: PROP_ID },
      query: {},
    });

    expect(updateBuilder.update).not.toHaveBeenCalled();
  });
});

describe("readMemory — error path", () => {
  beforeEach(() => jest.clearAllMocks());

  test("throws when the SELECT query returns an error", async () => {
    const { supabase } = makeMock({ rows: [], selectError: { message: "permission denied" } });
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await expect(
      readMemory({
        host: { id: HOST_ID },
        scope: { entity_type: "property", entity_id: PROP_ID },
        query: {},
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
