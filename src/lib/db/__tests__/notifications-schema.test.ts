/**
 * Drizzle schema-shape assertion for notifications.host_id.
 * M10 Phase C STEP 6 (M3) — verifies the schema.ts hostId column landed
 * with the migration 20260521190000_notifications_host_id.sql.
 *
 * Nullable PERMANENT per Q-M3-a + STEP 4 §13.1 + STEP 6 §6.1 Outcome 3.
 * App-level enforcement on new rows (STEP 7 thread).
 */

import { notifications } from "@/lib/db/schema";

describe("notifications schema — M3 host_id column", () => {
  test("notifications Drizzle table exposes hostId column", () => {
    // Drizzle column accessors live as properties on the table. The
    // hostId reference returning a column object (not undefined) is
    // sufficient evidence the schema entry shipped.
    expect(notifications.hostId).toBeDefined();
    // Verify the SQL column name maps correctly (host_id snake_case).
    // Drizzle's column object exposes .name with the underlying SQL name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((notifications.hostId as any).name).toBe("host_id");
  });
});
