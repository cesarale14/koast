/**
 * Drizzle schema-shape assertion for messages.envelope.
 * M10 Phase D STEP 6 (S3) — verifies the schema.ts envelope column landed
 * with the migration 20260522010000_messages_envelope.sql.
 *
 * Nullable PERMANENT per phase-d-ultraplan §3.6 (M3-outcome-3-family lineage,
 * 2nd instance). App-level population at STEP 7; display gates on presence
 * at STEP 8. Schema-shape test mirrors Phase C STEP 6 notifications.host_id
 * shape test pattern (src/lib/db/__tests__/notifications-schema.test.ts).
 */

import { messages } from "@/lib/db/schema";

describe("messages schema — S3 envelope column", () => {
  test("messages Drizzle table exposes envelope column mapped to SQL 'envelope'", () => {
    expect(messages.envelope).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((messages.envelope as any).name).toBe("envelope");
  });
});
