/**
 * task-class unit tests (M13 Phase 1.A STEP 4).
 *
 * Asserts the bucketing logic. Chat-primary pathnames return null so the
 * client batcher can skip sending an inspect telemetry row. Every other
 * pathname maps to exactly one of the controlled-vocabulary values.
 */

import { taskClassForPathname } from "../task-class";

describe("taskClassForPathname", () => {
  test("returns null for chat-primary pathnames", () => {
    expect(taskClassForPathname("/")).toBeNull();
    expect(taskClassForPathname("/chat")).toBeNull();
    expect(taskClassForPathname("/chat/abc-123")).toBeNull();
  });

  test("buckets bulk-operate surfaces", () => {
    expect(taskClassForPathname("/calendar")).toBe("bulk_operate");
    expect(taskClassForPathname("/pricing")).toBe("bulk_operate");
  });

  test("buckets visual-survey surfaces", () => {
    expect(taskClassForPathname("/market-intel")).toBe("visual_survey");
    expect(taskClassForPathname("/comp-sets")).toBe("visual_survey");
    expect(taskClassForPathname("/analytics")).toBe("visual_survey");
    expect(taskClassForPathname("/nearby-listings")).toBe("visual_survey");
  });

  test("buckets scan surfaces", () => {
    expect(taskClassForPathname("/messages")).toBe("scan");
    expect(taskClassForPathname("/reviews")).toBe("scan");
    expect(taskClassForPathname("/turnovers")).toBe("scan");
    expect(taskClassForPathname("/bookings")).toBe("scan");
    expect(taskClassForPathname("/properties")).toBe("scan");
    expect(taskClassForPathname("/properties/abc-123")).toBe("scan");
    expect(taskClassForPathname("/channels/sync-log")).toBe("scan");
  });

  test("buckets config surfaces", () => {
    expect(taskClassForPathname("/settings")).toBe("config");
    expect(taskClassForPathname("/onboarding")).toBe("config");
    expect(taskClassForPathname("/channels")).toBe("config");
    expect(taskClassForPathname("/channels/connect")).toBe("config");
    expect(taskClassForPathname("/certification")).toBe("config");
    expect(taskClassForPathname("/frontdesk")).toBe("config");
  });

  test("buckets external-link surfaces", () => {
    expect(taskClassForPathname("/login")).toBe("external_link");
    expect(taskClassForPathname("/signup")).toBe("external_link");
  });

  test("unknown pathname falls through to other", () => {
    expect(taskClassForPathname("/something-new")).toBe("other");
    expect(taskClassForPathname("/v2/experimental")).toBe("other");
  });

  test("null/undefined/empty fall through to other (defensive)", () => {
    expect(taskClassForPathname(null)).toBe("other");
    expect(taskClassForPathname(undefined)).toBe("other");
    expect(taskClassForPathname("")).toBe("other");
  });
});
