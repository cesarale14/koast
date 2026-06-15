import { bootstrapNewProperty } from "../bootstrap";

/**
 * bootstrapNewProperty is the single shared post-creation step. These pin the
 * invariant + idempotency at the data layer (the seam the suite can reach
 * without a live DB): tz never null, set only when missing; details ensured;
 * rates seeded only when a base rate is known, never clobbering.
 */

type Upsert = { table: string; rows: unknown; opts: unknown };

function makeSvc(existingTz: string | null) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const upserts: Upsert[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc: any = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: { timezone: existingTz }, error: null }),
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
        upsert(rows: unknown, opts: unknown) {
          upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { svc, updates, upserts };
}

describe("bootstrapNewProperty", () => {
  it("sets a resolved tz when the property has none, and ensures a details row", async () => {
    const { svc, updates, upserts } = makeSvc(null);
    const r = await bootstrapNewProperty(svc, {
      propertyId: "p1",
      latitude: 27.9506,
      longitude: -82.4572,
    });

    expect(r.timezone).toBe("America/New_York");
    expect(r.timezoneWasSet).toBe(true);
    // the only properties UPDATE was the timezone, and it is non-null
    const tzUpdate = updates.find((u) => u.table === "properties");
    expect(tzUpdate?.payload.timezone).toBe("America/New_York");
    expect(tzUpdate?.payload.timezone).toBeTruthy();
    // a property_details row is ensured (insert-if-missing, never overwrite)
    const detailsUpsert = upserts.find((u) => u.table === "property_details");
    expect(detailsUpsert).toBeTruthy();
    expect(detailsUpsert?.opts).toMatchObject({ ignoreDuplicates: true });
  });

  it("NEVER leaves tz null even with no coords (last-resort fallback)", async () => {
    const { svc, updates } = makeSvc(null);
    const r = await bootstrapNewProperty(svc, { propertyId: "p1" });
    expect(r.timezone).toBeTruthy();
    expect(updates.find((u) => u.table === "properties")?.payload.timezone).toBe(
      "America/New_York",
    );
  });

  it("does NOT clobber an existing host-set timezone", async () => {
    const { svc, updates } = makeSvc("America/Chicago");
    const r = await bootstrapNewProperty(svc, {
      propertyId: "p1",
      latitude: 27.9506,
      longitude: -82.4572,
    });
    expect(r.timezone).toBe("America/Chicago");
    expect(r.timezoneWasSet).toBe(false);
    // no properties UPDATE when tz already valid
    expect(updates.find((u) => u.table === "properties")).toBeUndefined();
  });

  it("seeds the calendar_rates base layer when a base rate is supplied", async () => {
    const { svc, upserts } = makeSvc(null);
    const r = await bootstrapNewProperty(svc, {
      propertyId: "p1",
      latitude: 27.9506,
      longitude: -82.4572,
      baseRate: 180,
      minStay: 2,
      seedDays: 30,
    });

    expect(r.ratesSeeded).toBe(30);
    const rateUpserts = upserts.filter((u) => u.table === "calendar_rates");
    expect(rateUpserts.length).toBeGreaterThan(0);
    // idempotent: ON CONFLICT DO NOTHING against the base-layer unique index
    expect(rateUpserts[0].opts).toMatchObject({
      onConflict: "property_id,date,channel_code",
      ignoreDuplicates: true,
    });
    const rows = rateUpserts[0].rows as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      property_id: "p1",
      channel_code: null, // base layer, not a per-channel override
      base_rate: 180,
      applied_rate: 180,
      min_stay: 2,
      is_available: true,
    });
  });

  it("does NOT seed rates when no base rate is known (imports)", async () => {
    const { svc, upserts } = makeSvc(null);
    const r = await bootstrapNewProperty(svc, { propertyId: "p1", latitude: 27.95, longitude: -82.45 });
    expect(r.ratesSeeded).toBe(0);
    expect(upserts.find((u) => u.table === "calendar_rates")).toBeUndefined();
  });
});
