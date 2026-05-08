/**
 * Unit tests for resolveChannexPropertyId — the pure helper extracted
 * from logOutbound() during M8 Phase C HARD GATE fix.
 *
 * The DB lookup that follows resolution is trivial; the body-shape +
 * URL-regex extraction is the part with logic. Test the pure helper.
 */

import { resolveChannexPropertyId } from "../client";

const PROP_A = "4d52bb8c-5bee-479a-81ae-2d0a9cb02785"; // Villa Jamaica
const PROP_B = "6928213d-7a2f-449c-90bc-115b1007be45"; // Cozy Loft

describe("resolveChannexPropertyId", () => {
  test("rate-push values[] payload (updateRestrictions)", () => {
    const parsed = {
      values: [
        { property_id: PROP_A, rate_plan_id: "rp1", date_from: "2026-06-01", date_to: "2026-06-01", rate: 17500 },
        { property_id: PROP_A, rate_plan_id: "rp1", date_from: "2026-06-02", date_to: "2026-06-02", rate: 18000 },
      ],
    };
    expect(resolveChannexPropertyId("/restrictions", parsed)).toBe(PROP_A);
  });

  test("availability values[] payload (updateAvailability)", () => {
    const parsed = {
      values: [
        { property_id: PROP_B, room_type_id: "rt1", date_from: "2026-06-01", date_to: "2026-06-30", availability: 1 },
      ],
    };
    expect(resolveChannexPropertyId("/availability", parsed)).toBe(PROP_B);
  });

  test("createBooking payload — booking.property_id", () => {
    const parsed = {
      booking: {
        status: "new",
        property_id: PROP_A,
        rooms: [],
      },
    };
    expect(resolveChannexPropertyId("/bookings", parsed)).toBe(PROP_A);
  });

  test("createChannel payload — channel.properties[0]", () => {
    const parsed = {
      channel: {
        channel: "BookingCom",
        title: "BDC — Villa Jamaica",
        properties: [PROP_A],
      },
    };
    expect(resolveChannexPropertyId("/channels", parsed)).toBe(PROP_A);
  });

  test("createWebhook payload — webhook.property_id", () => {
    const parsed = {
      webhook: {
        property_id: PROP_B,
        callback_url: "https://app.koasthq.com/api/channex/webhook",
        event_mask: "booking_new",
      },
    };
    expect(resolveChannexPropertyId("/webhooks", parsed)).toBe(PROP_B);
  });

  test("one-time-token / generic top-level property_id", () => {
    const parsed = { property_id: PROP_A };
    expect(resolveChannexPropertyId("/auth/one_time_token", parsed)).toBe(PROP_A);
  });

  test("URL fallback — /properties/{uuid} DELETE", () => {
    expect(resolveChannexPropertyId(`/properties/${PROP_B}`, null)).toBe(PROP_B);
  });

  test("URL fallback — /properties/{uuid} with trailing path segments", () => {
    expect(
      resolveChannexPropertyId(`/properties/${PROP_A}/something-else`, null),
    ).toBe(PROP_A);
  });

  test("returns null for /channels/{id} URL-only — γ.1 deferred", () => {
    expect(
      resolveChannexPropertyId(
        "/channels/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/activate",
        null,
      ),
    ).toBeNull();
  });

  test("returns null for /rate_plans/{id} URL-only — γ.1 deferred", () => {
    expect(
      resolveChannexPropertyId(
        "/rate_plans/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        null,
      ),
    ).toBeNull();
  });

  test("returns null for unparseable body + endpoint", () => {
    expect(resolveChannexPropertyId("/unknown", null)).toBeNull();
    expect(resolveChannexPropertyId("/unknown", {})).toBeNull();
  });

  test("body wins over URL when both present", () => {
    // Defensive: rate-push to /restrictions never carries a property
    // UUID in the URL today, but if a future endpoint does, body shape
    // is the source of truth — URL regex only fires for /properties/.
    const parsed = { values: [{ property_id: PROP_A }] };
    expect(resolveChannexPropertyId("/restrictions", parsed)).toBe(PROP_A);
  });

  test("empty values[] falls through to other extractors", () => {
    const parsed = { values: [], property_id: PROP_B };
    expect(resolveChannexPropertyId("/something", parsed)).toBe(PROP_B);
  });
});
