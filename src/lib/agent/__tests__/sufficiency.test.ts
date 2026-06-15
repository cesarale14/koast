/**
 * sufficiency.ts — M8 C3 D11 minimal classifier tests.
 *
 * The classifier is async + does two DB reads. To keep tests
 * dependency-free, we exercise it via a tiny in-memory supabase mock
 * that responds to the specific `.from(...).select(...).eq(...).in(...)`
 * chain the helper uses. The mock is intentionally narrow — it covers
 * exactly the chain `classifySufficiency` performs, not the entire
 * Supabase JS API.
 */

import { classifySufficiency } from "../sufficiency";

interface PropertyRow {
  id: string;
  name: string | null;
  city: string | null;
  property_type: string | null;
}
interface FactRow {
  entity_id: string;
  sub_entity_type: string | null;
  attribute: string;
  value: unknown;
}
interface DetailRow {
  property_id: string;
  door_code?: string | null;
  smart_lock_instructions?: string | null;
  wifi_network?: string | null;
  wifi_password?: string | null;
  parking_instructions?: string | null;
}

function makeMock(properties: PropertyRow[], facts: FactRow[], details: DetailRow[] = []) {
  const propTable = {
    select: () => ({
      eq: () => ({
        returns: () => Promise.resolve({ data: properties, error: null }),
      }),
    }),
  };
  const factTable = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          in: () => ({
            in: () => ({
              returns: () => Promise.resolve({ data: facts, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
  // P7.5 read-bridge: classifySufficiency also reads property_details
  // (.select().in().returns()). Empty by default → the bridge is a no-op and
  // the memory_facts-only expectations below are unchanged.
  const detailsTable = {
    select: () => ({
      in: () => ({
        returns: () => Promise.resolve({ data: details, error: null }),
      }),
    }),
  };
  return {
    from: (table: string) =>
      table === "properties" ? propTable : table === "property_details" ? detailsTable : factTable,
  } as unknown as Parameters<typeof classifySufficiency>[0];
}

describe("classifySufficiency — locked test list", () => {
  test("thin: no properties → level=thin, rollup zero", async () => {
    const result = await classifySufficiency(makeMock([], []), "host-1");
    expect(result.level).toBe("thin");
    expect(result.rollup.properties).toBe(0);
    expect(result.rollup.rich_properties).toBe(0);
  });

  test("thin: 1 property at cold-start (no type, no facts) → level=thin", async () => {
    const result = await classifySufficiency(
      makeMock([{ id: "p1", name: "Villa", city: "Tampa", property_type: null }], []),
      "host-1",
    );
    expect(result.level).toBe("thin");
    expect(result.rollup.rich_properties).toBe(0);
    expect(result.per_property[0].missing_count).toBe(4); // type + door + wifi (network) + parking
  });

  test("lean: 1 property with property_type but no memory facts → level=lean", async () => {
    const result = await classifySufficiency(
      makeMock([{ id: "p1", name: "Villa", city: "Tampa", property_type: "house" }], []),
      "host-1",
    );
    expect(result.level).toBe("lean"); // type is 1 of 4 categories present
    expect(result.per_property[0].missing_count).toBe(3);
  });

  test("lean: 1 property with some facts → level=lean", async () => {
    const result = await classifySufficiency(
      makeMock(
        [{ id: "p1", name: "Villa", city: "Tampa", property_type: "house" }],
        [
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "network_name", value: "X" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "password", value: "Y" },
        ],
      ),
      "host-1",
    );
    expect(result.level).toBe("lean");
    expect(result.rollup.rich_properties).toBe(0);
  });

  test("rich: 1 property with all four capabilities → level=rich, rich_properties=1", async () => {
    const result = await classifySufficiency(
      makeMock(
        [{ id: "p1", name: "Villa", city: "Tampa", property_type: "house" }],
        [
          { entity_id: "p1", sub_entity_type: "front_door", attribute: "access_code", value: "1234" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "network_name", value: "X" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "password", value: "Y" },
          { entity_id: "p1", sub_entity_type: "parking", attribute: "instructions", value: "driveway" },
        ],
      ),
      "host-1",
    );
    expect(result.level).toBe("rich");
    expect(result.rollup.properties).toBe(1);
    expect(result.rollup.rich_properties).toBe(1);
    expect(result.per_property[0].missing_count).toBe(0);
  });

  test("rich: 2 properties, only 1 complete → still level=rich", async () => {
    const result = await classifySufficiency(
      makeMock(
        [
          { id: "p1", name: "Villa", city: "Tampa", property_type: "house" },
          { id: "p2", name: "Loft", city: "Tampa", property_type: "condo" },
        ],
        [
          { entity_id: "p1", sub_entity_type: "front_door", attribute: "access_code", value: "1234" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "network_name", value: "X" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "password", value: "Y" },
          { entity_id: "p1", sub_entity_type: "parking", attribute: "instructions", value: "driveway" },
          // p2 has nothing
        ],
      ),
      "host-1",
    );
    expect(result.level).toBe("rich");
    expect(result.rollup.properties).toBe(2);
    expect(result.rollup.rich_properties).toBe(1);
  });

  test("read-bridge: property_details ALONE (no memory facts) → level=rich", async () => {
    // P7.5: filling the host access-info form clears the "missing check-in
    // details" item even with zero memory_facts.
    const result = await classifySufficiency(
      makeMock(
        [{ id: "p1", name: "Villa", city: "Tampa", property_type: "house" }],
        [],
        [
          {
            property_id: "p1",
            door_code: "1234",
            wifi_network: "X",
            wifi_password: "Y",
            parking_instructions: "driveway",
          },
        ],
      ),
      "host-1",
    );
    expect(result.level).toBe("rich");
    expect(result.per_property[0].missing_count).toBe(0);
  });

  test("level transitions cleanly between thin → lean → rich on same property", async () => {
    // thin — no property_type yet
    const thin = await classifySufficiency(
      makeMock([{ id: "p1", name: "Villa", city: "Tampa", property_type: null }], []),
      "host-1",
    );
    expect(thin.level).toBe("thin");

    // lean
    const lean = await classifySufficiency(
      makeMock(
        [{ id: "p1", name: "Villa", city: "Tampa", property_type: "house" }],
        [{ entity_id: "p1", sub_entity_type: "wifi", attribute: "network_name", value: "X" }],
      ),
      "host-1",
    );
    expect(lean.level).toBe("lean");

    // rich
    const rich = await classifySufficiency(
      makeMock(
        [{ id: "p1", name: "Villa", city: "Tampa", property_type: "house" }],
        [
          { entity_id: "p1", sub_entity_type: "front_door", attribute: "access_code", value: "1234" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "network_name", value: "X" },
          { entity_id: "p1", sub_entity_type: "wifi", attribute: "password", value: "Y" },
          { entity_id: "p1", sub_entity_type: "parking", attribute: "instructions", value: "driveway" },
        ],
      ),
      "host-1",
    );
    expect(rich.level).toBe("rich");
  });
});
