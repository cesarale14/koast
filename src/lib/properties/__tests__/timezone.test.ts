import { resolvePropertyTimezone, LAST_RESORT_TZ } from "../timezone";

/**
 * The onboarding invariant: resolvePropertyTimezone NEVER returns null/empty.
 * A null tz makes a property invisible to buildAgendaRollup (dead-end #2), so
 * every creation path depends on this always producing a usable IANA zone.
 */
describe("resolvePropertyTimezone", () => {
  it("resolves real coords offline (Tampa → America/New_York)", () => {
    expect(resolvePropertyTimezone({ latitude: 27.9506, longitude: -82.4572 })).toBe(
      "America/New_York",
    );
  });

  it("resolves non-US coords (London → Europe/London)", () => {
    expect(resolvePropertyTimezone({ latitude: 51.5074, longitude: -0.1278 })).toBe(
      "Europe/London",
    );
  });

  it("accepts string coords (the form passes strings)", () => {
    expect(resolvePropertyTimezone({ latitude: "27.9506", longitude: "-82.4572" })).toBe(
      "America/New_York",
    );
  });

  it("falls back to the country map when coords are missing", () => {
    expect(resolvePropertyTimezone({ latitude: null, longitude: null, country: "GB" })).toBe(
      "Europe/London",
    );
    expect(resolvePropertyTimezone({ country: "us" })).toBe("America/New_York");
  });

  it("treats (0,0) null-island as no coords and falls back", () => {
    expect(resolvePropertyTimezone({ latitude: 0, longitude: 0, country: "AU" })).toBe(
      "Australia/Sydney",
    );
  });

  it("falls back on out-of-range / unparseable coords", () => {
    expect(resolvePropertyTimezone({ latitude: 999, longitude: 999, country: "US" })).toBe(
      "America/New_York",
    );
    expect(resolvePropertyTimezone({ latitude: "abc", longitude: "def", country: "MX" })).toBe(
      "America/Mexico_City",
    );
  });

  it("NEVER returns null/empty — last resort when nothing resolves", () => {
    const tz = resolvePropertyTimezone({});
    expect(tz).toBe(LAST_RESORT_TZ);
    expect(tz).toBeTruthy();
    // sanity: the last resort is a valid IANA zone
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).not.toThrow();
  });
});
