/**
 * Durable E2E fixtures — fixed ids seeded idempotently by global-setup.
 *
 * M13 Phase 1.B Playwright harness. Conversations A + B are owned by the
 * primary test host (H1, the storageState identity); F is owned by a
 * SECOND host (H2) for the item-14 foreign-owned redirect sub-case.
 *
 * Fixed UUIDs (not random) so: (a) seeding is idempotent — upsert by id;
 * (b) the switch/deep-link specs reference them directly without a
 * lookup round-trip.
 */

export const TEST_HOST_1_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL ?? "e2e-host1@koast-test.local";
export const TEST_HOST_2_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL_2 ?? "e2e-host2@koast-test.local";
export const TEST_PASSWORD =
  process.env.PLAYWRIGHT_TEST_PASSWORD ?? "Koast-E2E-test-pw-9c3f2a7b";

/** Conversation A — owned by H1. Used by switch/load specs (8-13). */
export const CONV_A_ID = "a0000000-0000-4000-8000-000000000a01";
export const CONV_A_FIRST_MESSAGE = "Fixture A — what is my occupancy?";

/** Conversation B — owned by H1. The switch target. */
export const CONV_B_ID = "b0000000-0000-4000-8000-000000000b02";
export const CONV_B_FIRST_MESSAGE = "Fixture B — show me next weekend pricing.";

/** Conversation F — owned by H2 (foreign). Item 14 RLS sub-case. */
export const CONV_F_ID = "f0000000-0000-4000-8000-000000000f03";
export const CONV_F_FIRST_MESSAGE = "Fixture F — owned by a different host.";

/** A syntactically-valid UUID that does not exist. Item 14 sub-case (a). */
export const NONEXISTENT_CONV_ID = "deadbeef-0000-4000-8000-000000000000";

/** Storage-state path for the authenticated H1 session. */
export const STORAGE_STATE_PATH = "e2e/.auth/host1.json";

// Dedicated harness port (3100, not the dev-default 3000) so the suite never
// collides with — or has to kill — an unrelated app a developer may already
// be running on 3000. Playwright boots its own server here (see webServer).
export const BASE_URL = "http://localhost:3100";
