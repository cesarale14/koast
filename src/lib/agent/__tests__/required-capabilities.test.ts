/**
 * required-capabilities.ts — pure-helper tests for M8 C3 D9.
 *
 * Locked test list per C3 sign-off (Telegram message 2780):
 *   - evaluateCapabilities returns satisfied=true when all four present
 *   - each capability individually missing → exact key in missing[]
 *   - lockbox-flag carve-out for front_door
 *   - wifi: network missing reports network; network present but pwd missing reports pwd
 *   - buildMultiMissingEnvelopeText: 1-missing returns single reason
 *   - buildMultiMissingEnvelopeText: 2-missing concatenates with "and"
 *   - buildMultiMissingEnvelopeText: 3+-missing concatenates with Oxford comma
 *   - JSONB {value:"..."} wrapping tolerated for memory_fact values
 */

import {
  evaluateCapabilities,
  buildMultiMissingEnvelopeText,
  MISSING_CAPABILITY_COPY,
  isCheckinInstructionDraft,
  slotLabel,
  type RequiredCapabilityKey,
} from "../required-capabilities";

const fullProperty = {
  id: "p1",
  name: "Villa Jamaica",
  city: "Tampa",
  property_type: "house",
};

const fact = (sub_entity_type: string, attribute: string, value: unknown) => ({
  sub_entity_type,
  attribute,
  value,
});

const fullFacts = [
  fact("front_door", "access_code", "1234"),
  fact("wifi", "network_name", "ZORRO1123"),
  fact("wifi", "password", "supersecret"),
  fact("parking", "instructions", "driveway"),
];

describe("evaluateCapabilities — happy path", () => {
  test("all four capabilities present → satisfied=true, missing=[]", () => {
    const result = evaluateCapabilities(fullProperty, fullFacts);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.property_id).toBe("p1");
    expect(result.property_name).toBe("Villa Jamaica");
  });
});

describe("evaluateCapabilities — individual misses", () => {
  test("property_type missing → property_structural in missing[]", () => {
    const result = evaluateCapabilities({ ...fullProperty, property_type: null }, fullFacts);
    expect(result.satisfied).toBe(false);
    expect(result.missing.map((m) => m.key)).toEqual(["property_structural"]);
  });

  test("front_door::access_code missing → front_door_access_code in missing[]", () => {
    const facts = fullFacts.filter((f) => !(f.sub_entity_type === "front_door"));
    const result = evaluateCapabilities(fullProperty, facts);
    expect(result.missing.map((m) => m.key)).toEqual(["front_door_access_code"]);
  });

  test("lock::access_code accepted as front_door fallback", () => {
    const facts = [
      fact("lock", "access_code", "5678"),
      fact("wifi", "network_name", "X"),
      fact("wifi", "password", "Y"),
      fact("parking", "instructions", "street"),
    ];
    expect(evaluateCapabilities(fullProperty, facts).satisfied).toBe(true);
  });

  test("front_door::lockbox_flag accepted as per-arrival carve-out", () => {
    const facts = [
      fact("front_door", "lockbox_flag", "set_on_arrival"),
      fact("wifi", "network_name", "X"),
      fact("wifi", "password", "Y"),
      fact("parking", "instructions", "street"),
    ];
    expect(evaluateCapabilities(fullProperty, facts).satisfied).toBe(true);
  });

  test("wifi network missing → wifi_network_name (not wifi_password)", () => {
    const facts = [
      fact("front_door", "access_code", "1234"),
      fact("wifi", "password", "supersecret"),
      fact("parking", "instructions", "driveway"),
    ];
    const keys = evaluateCapabilities(fullProperty, facts).missing.map((m) => m.key);
    expect(keys).toContain("wifi_network_name");
    expect(keys).not.toContain("wifi_password");
  });

  test("wifi network present but password missing → wifi_password", () => {
    const facts = [
      fact("front_door", "access_code", "1234"),
      fact("wifi", "network_name", "X"),
      fact("parking", "instructions", "driveway"),
    ];
    const keys = evaluateCapabilities(fullProperty, facts).missing.map((m) => m.key);
    expect(keys).toEqual(["wifi_password"]);
  });

  test("parking missing → parking_instructions in missing[]", () => {
    const facts = fullFacts.filter((f) => f.sub_entity_type !== "parking");
    const keys = evaluateCapabilities(fullProperty, facts).missing.map((m) => m.key);
    expect(keys).toEqual(["parking_instructions"]);
  });
});

describe("evaluateCapabilities — JSONB value-wrapping tolerance", () => {
  test("{value: '...'} string wrapping treated as present", () => {
    const facts = [
      fact("front_door", "access_code", { value: "1234" }),
      fact("wifi", "network_name", "X"),
      fact("wifi", "password", "Y"),
      fact("parking", "instructions", "driveway"),
    ];
    expect(evaluateCapabilities(fullProperty, facts).satisfied).toBe(true);
  });

  test("empty string treated as missing", () => {
    const facts = [
      fact("front_door", "access_code", ""),
      fact("wifi", "network_name", "X"),
      fact("wifi", "password", "Y"),
      fact("parking", "instructions", "driveway"),
    ];
    const keys = evaluateCapabilities(fullProperty, facts).missing.map((m) => m.key);
    expect(keys).toEqual(["front_door_access_code"]);
  });
});

describe("buildMultiMissingEnvelopeText", () => {
  test("1-missing returns single reason verbatim", () => {
    const wifi = MISSING_CAPABILITY_COPY.wifi_network_name;
    const out = buildMultiMissingEnvelopeText([wifi]);
    expect(out.reason).toBe(wifi.reason);
    expect(out.missing_inputs).toEqual(["Wifi"]); // human label, not the slug
    expect(out.suggested_inputs).toEqual(wifi.suggested_inputs);
  });

  test("2-missing concatenates with ' and '", () => {
    const out = buildMultiMissingEnvelopeText([
      MISSING_CAPABILITY_COPY.wifi_network_name,
      MISSING_CAPABILITY_COPY.parking_instructions,
    ]);
    expect(out.reason).toBe(
      "I need a couple of things before drafting — wifi credentials and the parking situation. They all come up in almost every check-in.",
    );
    expect(out.missing_inputs).toEqual(["Wifi", "Parking"]); // human labels, not slugs
  });

  test("3-missing concatenates with Oxford comma", () => {
    const out = buildMultiMissingEnvelopeText([
      MISSING_CAPABILITY_COPY.front_door_access_code,
      MISSING_CAPABILITY_COPY.wifi_network_name,
      MISSING_CAPABILITY_COPY.parking_instructions,
    ]);
    expect(out.reason).toContain("the door code, wifi credentials, and the parking situation");
  });

  test("empty list throws", () => {
    expect(() => buildMultiMissingEnvelopeText([])).toThrow();
  });

  test("missing_inputs preserves order; suggested_inputs flattens", () => {
    const keys: RequiredCapabilityKey[] = ["parking_instructions", "wifi_password"];
    const out = buildMultiMissingEnvelopeText(keys.map((k) => MISSING_CAPABILITY_COPY[k]));
    expect(out.missing_inputs).toEqual(["Parking", "Wifi password"]); // labels, ordered
    expect(out.suggested_inputs.length).toBeGreaterThan(0);
  });
});

// Acceptance fix: the access-facts gate is message-class-conditional. The gate
// runs ONLY when isCheckinInstructionDraft is true.
describe("isCheckinInstructionDraft (message-class gate condition)", () => {
  // Fixture: a follow-up / review / marketing draft → NOT check-in-class → NO gate.
  test("post-checkout follow-up / return-visit marketing → false (no gate)", () => {
    expect(
      isCheckinInstructionDraft(
        "Hi Jonathan! Hope you enjoyed your stay at Villa Jamaica — we'd love to host you again next time you're in Tampa. Take care!",
      ),
    ).toBe(false);
  });
  test("review request → false (no gate)", () => {
    expect(
      isCheckinInstructionDraft("Thanks so much for staying with us! If you have a minute, we'd really appreciate a review."),
    ).toBe(false);
  });
  test("plain thank-you → false", () => {
    expect(isCheckinInstructionDraft("Thank you — it was a pleasure having you!")).toBe(false);
  });
  test("a general schedule reply with no access intent → false", () => {
    expect(isCheckinInstructionDraft("Yes, a noon checkout works fine. See you then!")).toBe(false);
  });

  // Check-in / arrival-instruction drafts → true (the gate MAY fire).
  test("check-in instructions draft → true", () => {
    expect(
      isCheckinInstructionDraft("Welcome! For check-in, the door code is on the keypad and the wifi network is Villa-Guest."),
    ).toBe(true);
  });
  test("arrival/parking draft → true", () => {
    expect(isCheckinInstructionDraft("When you arrive, parking is in the driveway and the lockbox is by the door.")).toBe(true);
  });
  test("empty / whitespace → false", () => {
    expect(isCheckinInstructionDraft("")).toBe(false);
  });
});

describe("slotLabel — human labels, never raw slugs", () => {
  test("maps each capability slot to a human label", () => {
    expect(slotLabel("front_door_access_code")).toBe("Door code");
    expect(slotLabel("wifi_network_name")).toBe("Wifi");
    expect(slotLabel("parking_instructions")).toBe("Parking");
    expect(slotLabel("property_structural")).toBe("Property type");
    expect(slotLabel("wifi_password")).toBe("Wifi password");
  });
});

describe("evaluateCapabilities — property_details read-bridge (P7.5)", () => {
  test("property_details ALONE (no memory_facts) satisfies the gate", () => {
    const result = evaluateCapabilities(fullProperty, [], {
      door_code: "1234",
      wifi_network: "ZORRO",
      wifi_password: "secret",
      parking_instructions: "driveway",
    });
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test("smart_lock_instructions satisfies the door/access capability", () => {
    const result = evaluateCapabilities(fullProperty, [], {
      smart_lock_instructions: "Code 9-9-9 then #",
      wifi_network: "ZORRO",
      wifi_password: "secret",
      parking_instructions: "street",
    });
    expect(result.satisfied).toBe(true);
  });

  test("memory_facts and property_details combine — each fills a gap", () => {
    // door from a memory_fact, wifi + parking from the form
    const result = evaluateCapabilities(
      fullProperty,
      [fact("front_door", "access_code", "1234")],
      { wifi_network: "ZORRO", wifi_password: "secret", parking_instructions: "lot B" },
    );
    expect(result.satisfied).toBe(true);
  });

  test("partial property_details still reports the genuinely-missing slots", () => {
    // only wifi network in the form, nothing in memory_facts
    const result = evaluateCapabilities(fullProperty, [], { wifi_network: "ZORRO" });
    const keys = result.missing.map((m) => m.key);
    expect(keys).toContain("front_door_access_code");
    expect(keys).toContain("wifi_password"); // network present, password missing
    expect(keys).toContain("parking_instructions");
  });

  test("blank/whitespace property_details columns do NOT satisfy", () => {
    const result = evaluateCapabilities(fullProperty, [], {
      door_code: "   ",
      wifi_network: "",
      wifi_password: null,
      parking_instructions: undefined,
    });
    expect(result.missing.map((m) => m.key)).toEqual([
      "front_door_access_code",
      "wifi_network_name",
      "parking_instructions",
    ]);
  });

  test("omitting details (undefined) preserves memory_facts-only behavior", () => {
    expect(evaluateCapabilities(fullProperty, fullFacts).satisfied).toBe(true);
    expect(evaluateCapabilities(fullProperty, []).satisfied).toBe(false);
  });
});
