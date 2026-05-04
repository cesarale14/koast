import {
  getStakesClass,
  getRegisteredStakesEntries,
  registerStakesEntry,
  _resetStakesRegistryForTests,
} from "../stakes-registry";

describe("stakesRegistry — seed state", () => {
  beforeEach(() => _resetStakesRegistryForTests());

  test("seed: contains exactly write_memory_fact → 'medium' (M6 D35 raise)", () => {
    const entries = getRegisteredStakesEntries();
    expect(Array.from(entries.keys())).toEqual(["write_memory_fact"]);
    expect(entries.get("write_memory_fact")).toBe("medium");
  });

  test("getStakesClass returns 'medium' for write_memory_fact", () => {
    expect(getStakesClass("write_memory_fact")).toBe("medium");
  });

  test("getStakesClass throws for unknown action_type", () => {
    expect(() => getStakesClass("not_a_real_action")).toThrow(/Unknown action_type/);
  });
});

describe("registerStakesEntry — duplicate detection", () => {
  beforeEach(() => _resetStakesRegistryForTests());

  test("registers a new action_type", () => {
    registerStakesEntry("read_memory", "low");
    expect(getStakesClass("read_memory")).toBe("low");
  });

  test("re-registration with the same stakes_class is a no-op", () => {
    registerStakesEntry("read_memory", "low");
    expect(() => registerStakesEntry("read_memory", "low")).not.toThrow();
    expect(getStakesClass("read_memory")).toBe("low");
  });

  test("re-registration with a DIFFERENT stakes_class throws", () => {
    registerStakesEntry("read_memory", "low");
    expect(() => registerStakesEntry("read_memory", "medium")).toThrow(
      /Conflicting registration for action_type='read_memory'/,
    );
  });

  test("registry survives multiple distinct registrations", () => {
    registerStakesEntry("read_memory", "low");
    registerStakesEntry("future_high_stakes_action", "high");
    const entries = getRegisteredStakesEntries();
    expect(entries.size).toBe(3);  // write_memory_fact seed + 2 new
    expect(entries.get("read_memory")).toBe("low");
    expect(entries.get("future_high_stakes_action")).toBe("high");
  });
});

describe("_resetStakesRegistryForTests — isolation between tests", () => {
  beforeEach(() => _resetStakesRegistryForTests());

  test("reset returns the registry to the seed state", () => {
    registerStakesEntry("transient_entry", "high");
    expect(getRegisteredStakesEntries().size).toBe(2);
    _resetStakesRegistryForTests();
    expect(Array.from(getRegisteredStakesEntries().keys())).toEqual(["write_memory_fact"]);
  });
});
