#!/usr/bin/env tsx
/**
 * scripts/fluidity-check — M13 Phase 1.B Step 4 CI gate.
 *
 * Reads scripts/fluidity-budgets.json (the contract) and runs the
 * jest perf-test suite (tests under any __perf__ subdirectory). Exits
 * non-zero if any perf test fails its budget assertion.
 *
 * Per the M13 Phase 1.B STOP §2.4 and operator sign-off (msg 3527):
 *   - This script is the unit-test layer enforceable at PR time.
 *   - Production telemetry rollup (host_surface_telemetry rows where
 *     event_category='perf') is the real truth-source — that layer is
 *     substrate-without-consumer at 1.B per v2.8 §6.16 (cron + analyzer
 *     ship when data is meaningful).
 *   - Playwright E2E is DEFERRED. Revisit when a regression escapes
 *     this unit-test gate.
 *
 * Usage:
 *   npx tsx scripts/fluidity-check.ts          — runs the jest perf suite
 *   npx tsx scripts/fluidity-check.ts --print  — prints the manifest + exits 0
 *
 * The script is intentionally thin — the load-bearing work is in the
 * jest tests themselves (e.g. src/lib/cmdk/__tests__/filter.test.ts's
 * "performance (M13 Phase 1.B fluidity budget)" block). This script's
 * job is to (a) make the contract explicit + auditable in CI, (b) keep
 * the perf-suite invocation in one place, (c) give the operator a
 * single command to verify the gate.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(REPO_ROOT, "scripts/fluidity-budgets.json");

type BudgetManifest = {
  property_focus: number;
  chat_start_of_stream: number;
  cmd_k_first_result: number;
  route_nav: number;
  perceived_action: number;
  $meta?: { ci_tolerance_multiplier?: number };
};

function loadManifest(): BudgetManifest {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`[fluidity-check] manifest not found: ${MANIFEST_PATH}`);
    process.exit(2);
  }
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as BudgetManifest & Record<string, unknown>;
  return parsed;
}

function printManifest(m: BudgetManifest): void {
  console.log("Fluidity budgets (M13 Phase 1.B):");
  console.log(`  property_focus         < ${m.property_focus}ms`);
  console.log(`  chat_start_of_stream   < ${m.chat_start_of_stream}ms`);
  console.log(`  cmd_k_first_result     < ${m.cmd_k_first_result}ms`);
  console.log(`  route_nav              < ${m.route_nav}ms`);
  console.log(`  perceived_action       < ${m.perceived_action}ms`);
  const mult = m.$meta?.ci_tolerance_multiplier ?? 1;
  console.log(`  (CI tolerance multiplier: ${mult}×)`);
}

function runPerfSuite(): number {
  // Run only tests whose file path contains '__perf__' OR whose
  // describe-block title contains 'fluidity budget'. The existing
  // src/lib/cmdk filter.test.ts uses the describe-block convention;
  // future perf tests can use either path or describe-name convention.
  console.log("[fluidity-check] running perf suite (jest --testPathPattern)…");
  // jest@30 renamed --testPathPattern to --testPathPatterns (plural).
  // Pass both flag forms is messy; use the new name. Test-name filter
  // is unchanged.
  const result = spawnSync(
    "npx",
    [
      "jest",
      "--testPathPatterns",
      "(__perf__|cmdk/__tests__/filter)",
      "--testNamePattern",
      "(performance|fluidity budget)",
      "--colors",
    ],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  return result.status ?? 1;
}

function main(): void {
  const args = process.argv.slice(2);
  const manifest = loadManifest();

  if (args.includes("--print")) {
    printManifest(manifest);
    process.exit(0);
  }

  printManifest(manifest);
  console.log("");
  const code = runPerfSuite();
  if (code === 0) {
    console.log("[fluidity-check] PASS — all perf-suite budgets met.");
  } else {
    console.error(
      "[fluidity-check] FAIL — at least one perf test exceeded its budget. See output above.",
    );
  }
  process.exit(code);
}

main();
