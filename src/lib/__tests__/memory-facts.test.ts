/**
 * Pure-helper unit tests for F1 (M8 Phase C). Integration tests
 * deferred per Round-2 #8.
 */

import {
  buildSupersessionHistory,
  humanizeEntityTypeLabel,
  humanizeFactLabel,
  humanizeFactValue,
  humanizeSupersessionReason,
} from "../memory-facts";

describe("humanizeEntityTypeLabel", () => {
  test("known entity types map to locked Golden uppercase headers", () => {
    expect(humanizeEntityTypeLabel("property")).toBe("PROPERTIES");
    expect(humanizeEntityTypeLabel("guest")).toBe("GUESTS");
    expect(humanizeEntityTypeLabel("host")).toBe("ABOUT YOU");
    expect(humanizeEntityTypeLabel("vendor")).toBe("VENDORS");
    expect(humanizeEntityTypeLabel("booking")).toBe("BOOKINGS");
  });

  test("unknown entity type uppercases with underscores → spaces", () => {
    expect(humanizeEntityTypeLabel("delivery_zone")).toBe("DELIVERY ZONE");
  });
});

describe("humanizeSupersessionReason", () => {
  test("'outdated' → '(was no longer true)'", () => {
    expect(humanizeSupersessionReason("outdated")).toBe(
      "(was no longer true)",
    );
  });

  test("'incorrect' → '(was wrong)'", () => {
    expect(humanizeSupersessionReason("incorrect")).toBe("(was wrong)");
  });

  test("null → '(reason not recorded)' for M6-era pre-D7 rows", () => {
    expect(humanizeSupersessionReason(null)).toBe("(reason not recorded)");
  });

  test("undefined and other strings fall through to not-recorded", () => {
    expect(humanizeSupersessionReason(undefined)).toBe(
      "(reason not recorded)",
    );
    expect(humanizeSupersessionReason("legacy_other")).toBe(
      "(reason not recorded)",
    );
  });
});

describe("humanizeFactLabel", () => {
  test("(wifi, password) → 'Wifi password'", () => {
    expect(humanizeFactLabel("wifi", "password")).toBe("Wifi password");
  });

  test("(front_door, code) → 'Front door code'", () => {
    expect(humanizeFactLabel("front_door", "code")).toBe("Front door code");
  });

  test("(parking, instructions) → 'Parking instructions'", () => {
    expect(humanizeFactLabel("parking", "instructions")).toBe(
      "Parking instructions",
    );
  });

  test("null sub_entity falls back to attribute alone", () => {
    expect(humanizeFactLabel(null, "primary_contact")).toBe(
      "Primary contact",
    );
  });

  test("multi-word sub_entity normalizes underscores", () => {
    expect(humanizeFactLabel("kitchen_appliances", "notes")).toBe(
      "Kitchen appliances notes",
    );
  });
});

describe("humanizeFactValue", () => {
  test("string value renders unquoted", () => {
    expect(humanizeFactValue("ZORRO1123")).toBe("ZORRO1123");
  });

  test("numeric value stringifies", () => {
    expect(humanizeFactValue(4828)).toBe("4828");
  });

  test("boolean value stringifies", () => {
    expect(humanizeFactValue(true)).toBe("true");
  });

  test("null / undefined render as empty string", () => {
    expect(humanizeFactValue(null)).toBe("");
    expect(humanizeFactValue(undefined)).toBe("");
  });

  test("object value JSON-stringifies", () => {
    expect(humanizeFactValue({ ssid: "Koast", password: "abc" })).toBe(
      '{"ssid":"Koast","password":"abc"}',
    );
  });
});

describe("buildSupersessionHistory", () => {
  // Type matches the helper's internal RawFactRow shape (snake_case).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = any;

  const ACTIVE: Row = {
    id: "active-1",
    host_id: "h",
    entity_type: "property",
    entity_id: "p1",
    sub_entity_type: "front_door",
    sub_entity_id: null,
    attribute: "code",
    value: 4828,
    status: "active",
    superseded_by: null,
    supersession_reason: null,
    learned_at: "2026-05-08T12:00:00Z",
  };

  const PRIOR_1: Row = {
    ...ACTIVE,
    id: "prior-1",
    value: 4827,
    status: "superseded",
    superseded_by: "active-1",
    supersession_reason: "outdated",
    learned_at: "2026-05-01T12:00:00Z",
  };

  const PRIOR_2: Row = {
    ...ACTIVE,
    id: "prior-2",
    value: 4826,
    status: "superseded",
    superseded_by: "prior-1",
    supersession_reason: "incorrect",
    learned_at: "2026-04-15T12:00:00Z",
  };

  test("active fact with no history returns empty array", () => {
    expect(buildSupersessionHistory("active-1", [ACTIVE])).toEqual([]);
  });

  test("walks single-step chain (active → prior_1)", () => {
    const hist = buildSupersessionHistory("active-1", [ACTIVE, PRIOR_1]);
    expect(hist).toHaveLength(1);
    expect(hist[0].id).toBe("prior-1");
    expect(hist[0].display_value).toBe("4827");
    expect(hist[0].reason).toBe("outdated");
    expect(hist[0].reason_label).toBe("(was no longer true)");
  });

  test("walks two-step chain (active → prior_1 → prior_2), most-recent-first", () => {
    const hist = buildSupersessionHistory("active-1", [
      ACTIVE,
      PRIOR_1,
      PRIOR_2,
    ]);
    expect(hist.map((h) => h.id)).toEqual(["prior-1", "prior-2"]);
    expect(hist[0].reason).toBe("outdated");
    expect(hist[1].reason).toBe("incorrect");
  });

  test("NULL supersession_reason renders as not-recorded", () => {
    const legacyPrior: Row = { ...PRIOR_1, supersession_reason: null };
    const hist = buildSupersessionHistory("active-1", [ACTIVE, legacyPrior]);
    expect(hist[0].reason).toBeNull();
    expect(hist[0].reason_label).toBe("(reason not recorded)");
  });

  test("depth-cap prevents pathological cycles", () => {
    // Construct a 1-row cycle: prior points to itself. Should bail
    // after hitting the bound, not loop forever.
    const cyclic: Row = {
      ...PRIOR_1,
      id: "cyclic",
      superseded_by: "cyclic",
    };
    const hist = buildSupersessionHistory("cyclic", [cyclic]);
    expect(hist.length).toBeLessThanOrEqual(100);
  });
});
