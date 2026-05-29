/**
 * global-setup — runs ONCE before all specs.
 *
 * M13 Phase 1.B Playwright harness:
 *   1. prod-guard (allowlist, fail-closed) — abort unless target is staging
 *   2. idempotent seed of durable fixtures (H1, H2, convs A/B/F)
 *   3. log in H1 through the real /login UI → save storageState
 *
 * The login uses the real Supabase cookie path (Decision 1) so specs
 * exercise auth exactly as production does.
 */

import { chromium, type FullConfig } from "@playwright/test";
import { assertNonProdTarget } from "./helpers/prod-guard";
import { adminClient, seedDurableFixtures } from "./helpers/supabase-admin";
import {
  TEST_HOST_1_EMAIL,
  TEST_PASSWORD,
  STORAGE_STATE_PATH,
  BASE_URL,
} from "./helpers/fixtures";

async function globalSetup(_config: FullConfig): Promise<void> {
  // 1. SAFETY: refuse anything that isn't the allowlisted staging project.
  assertNonProdTarget();

  // 2. Idempotent seed (seed-if-missing every run — self-heals a wipe).
  const admin = adminClient();
  await seedDurableFixtures(admin);

  // 3. Real-login → storageState. Reuses the webServer Playwright will
  //    have started (the webServer launches before globalSetup? No —
  //    Playwright starts webServer before globalSetup runs, so BASE_URL
  //    is reachable here).
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', TEST_HOST_1_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  // On success the app redirects off /login (to chat-primary `/`).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

export default globalSetup;
