/**
 * global-teardown — runs ONCE after all specs.
 *
 * M13 Phase 1.B Playwright harness. Removes the durable fixtures + any
 * orphaned nonce rows the mutating specs may have left if an afterEach
 * was interrupted. Best-effort — never throws (teardown failure
 * shouldn't mask a real test result). Hard-delete is fine: staging is
 * non-prod (prod-guard already enforced in global-setup).
 */

import { assertNonProdTarget } from "./helpers/prod-guard";
import { adminClient, removeDurableFixtures } from "./helpers/supabase-admin";

async function globalTeardown(): Promise<void> {
  try {
    assertNonProdTarget(); // belt-and-suspenders before any delete
    const admin = adminClient();
    await removeDurableFixtures(admin);
  } catch (err) {
    // Surface but don't fail the run.
    console.warn(
      `[e2e teardown] non-fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export default globalTeardown;
