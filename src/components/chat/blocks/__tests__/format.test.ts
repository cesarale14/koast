import {
  nightsBetween,
  firstNameOf,
  initialsOf,
  relativeTime,
} from "../format";

describe("nightsBetween", () => {
  test("counts nights across a stay", () => {
    expect(nightsBetween("2026-06-12", "2026-06-14")).toBe(2);
    expect(nightsBetween("2026-06-12", "2026-06-13")).toBe(1);
  });
  test("is correct across a month boundary", () => {
    expect(nightsBetween("2026-06-29", "2026-07-02")).toBe(3);
  });
});

describe("firstNameOf", () => {
  test("returns the first token of a name", () => {
    expect(firstNameOf("Karem Gutierrez")).toBe("Karem");
    expect(firstNameOf("Jeremy")).toBe("Jeremy");
  });
  test("maps placeholder labels + null to 'Guest'", () => {
    expect(firstNameOf("Airbnb")).toBe("Guest");
    expect(firstNameOf("Guest")).toBe("Guest");
    expect(firstNameOf(null)).toBe("Guest");
    expect(firstNameOf("")).toBe("Guest");
  });
});

describe("initialsOf", () => {
  test("two-name → first + last initial", () => {
    expect(initialsOf("Karem Gutierrez")).toBe("KG");
    expect(initialsOf("Cesar Alejandro Santana")).toBe("CS");
  });
  test("single name → first two letters", () => {
    expect(initialsOf("Jeremy")).toBe("JE");
  });
  test("empty/null → '?'", () => {
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("relativeTime", () => {
  const NOW = Date.parse("2026-06-10T12:00:00Z");
  test("empty/invalid → ''", () => {
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime(undefined, NOW)).toBe("");
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
  test("buckets minutes/hours/days", () => {
    expect(relativeTime("2026-06-10T11:59:40Z", NOW)).toBe("now"); // 20s
    expect(relativeTime("2026-06-10T11:45:00Z", NOW)).toBe("15m");
    expect(relativeTime("2026-06-10T09:00:00Z", NOW)).toBe("3h");
    expect(relativeTime("2026-06-08T12:00:00Z", NOW)).toBe("2d");
  });
  test("past a week → a short date (not a relative bucket)", () => {
    const out = relativeTime("2026-05-20T12:00:00Z", NOW);
    expect(out).not.toMatch(/^\d+[mhd]$/);
    expect(out).not.toBe("now");
  });
});
