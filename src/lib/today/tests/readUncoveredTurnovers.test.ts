import { readUncoveredTurnovers } from "../readUncoveredTurnovers";

type Row = Record<string, unknown>;

// Minimal chainable fake: returns the seeded rows for each table regardless of
// filters (the filters are declarative query params validated by tsc). Tests the
// mapping (property_id → name) + cleaner shaping + the no-properties short-circuit.
function fakeSupabase(seed: { properties: Row[]; cleaning_tasks: Row[]; cleaners: Row[] }) {
  function from(table: keyof typeof seed) {
    const result = { data: seed[table] ?? [], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => Promise.resolve(result),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  }
  return { from } as unknown as Parameters<typeof readUncoveredTurnovers>[0];
}

describe("readUncoveredTurnovers", () => {
  const HOST = "host-1";

  test("maps uncovered tasks to property names + returns active cleaners", async () => {
    const supabase = fakeSupabase({
      properties: [
        { id: "p1", name: "Villa Jamaica" },
        { id: "p2", name: "Cozy Loft - Tampa" },
      ],
      cleaning_tasks: [
        { id: "t1", property_id: "p1", scheduled_date: "2026-06-12", status: "pending", cleaner_id: null },
        { id: "t2", property_id: "p2", scheduled_date: "2026-06-13", status: "pending", cleaner_id: null },
      ],
      cleaners: [
        { id: "c1", name: "Karem Gutierrez" },
        { id: "c2", name: "Cesar Santana" },
      ],
    });

    const out = await readUncoveredTurnovers(supabase, HOST, "2026-06-10");
    expect(out.tasks).toEqual([
      { taskId: "t1", property: "Villa Jamaica", date: "2026-06-12" },
      { taskId: "t2", property: "Cozy Loft - Tampa", date: "2026-06-13" },
    ]);
    expect(out.cleaners).toEqual([
      { id: "c1", name: "Karem Gutierrez" },
      { id: "c2", name: "Cesar Santana" },
    ]);
  });

  test("returns empty (and skips task/cleaner reads) when the host has no properties", async () => {
    const supabase = fakeSupabase({ properties: [], cleaning_tasks: [], cleaners: [] });
    const out = await readUncoveredTurnovers(supabase, HOST, "2026-06-10");
    expect(out).toEqual({ tasks: [], cleaners: [] });
  });

  test("falls back to 'Property' / 'Cleaner' for null names", async () => {
    const supabase = fakeSupabase({
      properties: [{ id: "p1", name: null }],
      cleaning_tasks: [{ id: "t1", property_id: "p1", scheduled_date: "2026-06-12", status: "pending", cleaner_id: null }],
      cleaners: [{ id: "c1", name: null }],
    });
    const out = await readUncoveredTurnovers(supabase, HOST, "2026-06-10");
    expect(out.tasks[0].property).toBe("Property");
    expect(out.cleaners[0].name).toBe("Cleaner");
  });
});
