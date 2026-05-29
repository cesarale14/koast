/**
 * Playwright config — M13 Phase 1.B conversation-lifecycle E2E harness.
 *
 * Scope: the 14 §8 sweep items in docs/conversation-lifecycle-spec.md.
 * Target: the non-prod staging Supabase project ONLY (prod-guard in
 * e2e/global-setup.ts refuses anything else).
 *
 * webServer: launches the app locally and tests hit localhost (hermetic,
 * deterministic — not Vercel-preview). Command is env-conditional:
 *   - local: `next dev` (no build — respects the VPS "never build" rule)
 *   - CI: `next build && next start` (prod-faithful; source of truth)
 * Both boot with the staging env + KOAST_E2E_CANNED_AGENT=1 passed via
 * webServer.env. @next/env will NOT override these process.env values
 * with .env.local, so the test server can never point at prod.
 */

import { defineConfig, devices } from "@playwright/test";
import { loadPlaywrightEnv } from "./e2e/helpers/load-env";
import { STORAGE_STATE_PATH, BASE_URL } from "./e2e/helpers/fixtures";

// Load .env.playwright into process.env before anything reads it.
loadPlaywrightEnv();

const isCI = !!process.env.CI;

// Vars passed to the spawned app server — staging, never .env.local.
const serverEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  DATABASE_URL_POOLED: process.env.DATABASE_URL_POOLED ?? "",
  KOAST_E2E_CANNED_AGENT: "1",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Serial locally — one dev server + shared staging DB; avoids
  // contention/flake on the loaded VPS. CI can parallelize modestly.
  fullyParallel: false,
  workers: isCI ? 2 : 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: isCI
      ? "next build && next start -p 3000"
      : "next dev -p 3000",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    env: serverEnv,
  },
});
