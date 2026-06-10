import { readTodayTurnovers } from "../readTodayTurnovers";

type Row = Record<string, unknown>;

// Minimal chainable fake: returns the seeded rows for each table regardless of
// filters (filters are declarative query params validated by tsc). Tests the
// mapping (property_id → name, cleaner_id → name, status) + the no-properties
// short-circuit.
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
  return { from } as unknown as Parameters<typeof readTodayTurnovers>[0];
}

describe("readTodayTurnovers", () => {
  const HOST = "host-1";

  test("maps turnovers with status + cleaner name across the lifecycle", async () => {
    const supabase = fakeSupabase({
      properties: [
        { id: "p1", name: "Villa Jamaica" },
        { id: "p2", name: "Cozy Loft - Tampa" },
      ],
      cleaners: [
        { id: "c1", name: "Karem Gutierrez" },
        { id: "c2", name: "Cesar Santana" },
      ],
      cleaning_tasks: [
        { id: "t1", property_id: "p1", scheduled_date: "2026-06-12", status: "pending", cleaner_id: null },
        { id: "t2", property_id: "p1", scheduled_date: "2026-06-13", status: "assigned", cleaner_id: "c1" },
        { id: "t3", property_id: "p2", scheduled_date: "2026-06-13", status: "in_progress", cleaner_id: "c2" },
        { id: "t4", property_id: "p2", scheduled_date: "2026-06-12", status: "completed", cleaner_id: "c1" },
      ],
    });

    const out = await readTodayTurnovers(supabase, HOST, "2026-06-10");
    expect(out.turnovers).toEqual([
      { taskId: "t1", property: "Villa Jamaica", date: "2026-06-12", status: "pending", cleanerName: null },
      { taskId: "t2", property: "Villa Jamaica", date: "2026-06-13", status: "assigned", cleanerName: "Karem Gutierrez" },
      { taskId: "t3", property: "Cozy Loft - Tampa", date: "2026-06-13", status: "in_progress", cleanerName: "Cesar Santana" },
      { taskId: "t4", property: "Cozy Loft - Tampa", date: "2026-06-12", status: "completed", cleanerName: "Karem Gutierrez" },
    ]);
    expect(out.cleaners).toEqual([
      { id: "c1", name: "Karem Gutierrez" },
      { id: "c2", name: "Cesar Santana" },
    ]);
  });

  test("returns empty when the host has no properties", async () => {
    const supabase = fakeSupabase({ properties: [], cleaning_tasks: [], cleaners: [] });
    const out = await readTodayTurnovers(supabase, HOST, "2026-06-10");
    expect(out).toEqual({ turnovers: [], cleaners: [] });
  });

  test("defaults status to pending and tolerates an unknown cleaner_id", async () => {
    const supabase = fakeSupabase({
      properties: [{ id: "p1", name: "Villa Jamaica" }],
      cleaners: [{ id: "c1", name: "Karem Gutierrez" }],
      cleaning_tasks: [
        { id: "t1", property_id: "p1", scheduled_date: "2026-06-12", status: null, cleaner_id: null },
        { id: "t2", property_id: "p1", scheduled_date: "2026-06-12", status: "assigned", cleaner_id: "ghost" },
      ],
    });
    const out = await readTodayTurnovers(supabase, HOST, "2026-06-10");
    expect(out.turnovers[0].status).toBe("pending");
    expect(out.turnovers[1].cleanerName).toBeNull(); // cleaner_id not in active set
  });
});
