import { derivePageContext } from "../pageContext";

function params(map: Record<string, string>) {
  return { get: (k: string) => (k in map ? map[k] : null) };
}

const UUID = "bfb0750e-9ae9-4ef4-a7de-988062f6a0ad";

describe("derivePageContext", () => {
  test("always carries the route", () => {
    expect(derivePageContext("/calendar", params({}))).toEqual({ active_route: "/calendar" });
  });

  test("empty pathname falls back to /", () => {
    expect(derivePageContext("", params({})).active_route).toBe("/");
  });

  test("extracts active_property_id from a /properties/{uuid} path", () => {
    const ctx = derivePageContext(`/properties/${UUID}`, params({}));
    expect(ctx.active_property_id).toBe(UUID);
  });

  test("extracts active_property_id from a /properties/{uuid}/sub path", () => {
    const ctx = derivePageContext(`/properties/${UUID}/calendar`, params({}));
    expect(ctx.active_property_id).toBe(UUID);
  });

  test("extracts active_property_id from ?property / ?propertyId / ?property_id", () => {
    expect(derivePageContext("/pricing", params({ property: UUID })).active_property_id).toBe(UUID);
    expect(derivePageContext("/pricing", params({ propertyId: UUID })).active_property_id).toBe(UUID);
    expect(derivePageContext("/pricing", params({ property_id: UUID })).active_property_id).toBe(UUID);
  });

  test("ignores a non-UUID property param (hint must be well-formed)", () => {
    expect(derivePageContext("/pricing", params({ property: "not-a-uuid" })).active_property_id).toBeUndefined();
    expect(derivePageContext("/properties/123", params({})).active_property_id).toBeUndefined();
  });

  test("extracts a valid active_date_range from ?start + ?end", () => {
    const ctx = derivePageContext("/calendar", params({ start: "2026-06-12", end: "2026-06-14" }));
    expect(ctx.active_date_range).toEqual({ start: "2026-06-12", end: "2026-06-14" });
  });

  test("drops a date range that is malformed or inverted", () => {
    expect(derivePageContext("/calendar", params({ start: "2026-06-12" })).active_date_range).toBeUndefined();
    expect(derivePageContext("/calendar", params({ start: "June 12", end: "June 14" })).active_date_range).toBeUndefined();
    expect(derivePageContext("/calendar", params({ start: "2026-06-20", end: "2026-06-14" })).active_date_range).toBeUndefined();
  });

  test("combines property + date range when both present", () => {
    const ctx = derivePageContext(`/properties/${UUID}`, params({ start: "2026-06-12", end: "2026-06-14" }));
    expect(ctx).toEqual({
      active_route: `/properties/${UUID}`,
      active_property_id: UUID,
      active_date_range: { start: "2026-06-12", end: "2026-06-14" },
    });
  });
});
