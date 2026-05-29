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
import {
  adminClient,
  seedDurableFixtures,
  deleteConversationsByNonce,
} from "./helpers/supabase-admin";
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
  const { host1Id } = await seedDurableFixtures(admin);

  // 3. Real-login → storageState. Reuses the webServer Playwright will
  //    have started (the webServer launches before globalSetup? No —
  //    Playwright starts webServer before globalSetup runs, so BASE_URL
  //    is reachable here).
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // waitUntil:"networkidle" (not domcontentloaded) so React has hydrated
  // before we interact — otherwise the controlled inputs reset and the
  // submit click is a no-op (handlers not yet attached), which silently
  // strands us on /login.
  await page.goto(`${BASE_URL}/login`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  // Robust, app-specific selectors (testids on the AuthShell primitives) —
  // the generic CSS (input[type=email]/...) was brittle to the AuthInput
  // wrapper.
  await page.getByTestId("login-email").fill(TEST_HOST_1_EMAIL);
  await page.getByTestId("login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  // On success the app redirects off /login (to chat-primary `/`).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });

  // Warm the heavy chat-primary route ONCE here, serially, with no parallel
  // request pressure. Under `next dev` the first hit to `/` triggers an
  // expensive on-demand webpack compile; if a spec races that compile the
  // chunk-request cascade overwhelms Chromium (ERR_INSUFFICIENT_RESOURCES)
  // or times out. Pre-compiling it here means specs hit a warm route.
  //
  // NOT networkidle: the chat surface holds a live connection, so the
  // network never idles. domcontentloaded + waiting for the rendered
  // empty-state is the right warm signal (route compiled + hydrated).
  // Best-effort — a warm-up hiccup must not fail the whole run.
  try {
    await page.goto(`${BASE_URL}/`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .getByTestId("chat-empty-state")
      .waitFor({ state: "visible", timeout: 60_000 });
  } catch {
    /* warm-up only */
  }

  // Warm the SEND / create path too. The first create spec otherwise pays
  // the cold compile of /api/agent/turn + the SSE stream + the conversations
  // refetch on its first send; under `next dev` that latency can push the
  // optimistic rail entry past the assertion budget (the item-1 flake — the
  // rail entry surfaces, just late). One throwaway canned send compiles the
  // whole create path; we delete the conversation immediately after so it
  // can't pollute counts or rails. Best-effort.
  const WARMUP_MARKER = "e2e-warmup-send";
  try {
    const input = page.getByTestId("composer-input");
    await input.waitFor({ state: "visible", timeout: 30_000 });
    await input.fill(`${WARMUP_MARKER} warm the create path`);
    await page.getByTestId("composer-send").click();
    // Wait for the canned assistant turn — the full round-trip is now warm.
    await page
      .getByTestId("chat-turn")
      .nth(1)
      .waitFor({ state: "visible", timeout: 60_000 });
  } catch {
    /* warm-up only */
  }
  // Remove the throwaway conversation regardless of how the warm-up went.
  await deleteConversationsByNonce(admin, host1Id, WARMUP_MARKER).catch(() => {
    /* best-effort cleanup */
  });

  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

export default globalSetup;
