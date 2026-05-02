import { getStakesClass, stakesRegistry } from "../stakes-registry";

describe("stakesRegistry", () => {
  test("v1 has exactly one entry: memory_fact_write", () => {
    expect(Object.keys(stakesRegistry)).toEqual(["memory_fact_write"]);
  });

  test("memory_fact_write has stakes_class 'low'", () => {
    expect(stakesRegistry.memory_fact_write).toBe("low");
  });
});

describe("getStakesClass", () => {
  test("returns 'low' for memory_fact_write", () => {
    expect(getStakesClass("memory_fact_write")).toBe("low");
  });
});
