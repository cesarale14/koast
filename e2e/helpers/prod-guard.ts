/**
 * prod-guard — SAFETY-CRITICAL allowlist guard.
 *
 * M13 Phase 1.B Playwright harness (Decision 2). These specs CREATE and
 * DELETE conversations + seed/wipe users. They must NEVER touch the
 * production Supabase project.
 *
 * The guard is ALLOWLIST-shaped + fails closed: it REFUSES to proceed
 * unless the target URL matches the expected staging ref AND does not
 * match the known prod ref. Anything ambiguous → throw → the whole run
 * aborts before any write.
 */

const PROD_SUPABASE_REF = "wxxpbgbfebpkvsxhpphb"; // production project

export function assertNonProdTarget(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const expected = process.env.PLAYWRIGHT_EXPECTED_SUPABASE_REF ?? "";

  if (!url) {
    throw new Error(
      "[e2e prod-guard] NEXT_PUBLIC_SUPABASE_URL is empty — refusing to run.",
    );
  }
  if (!expected) {
    throw new Error(
      "[e2e prod-guard] PLAYWRIGHT_EXPECTED_SUPABASE_REF is unset — refusing to run (allowlist requires an expected staging ref).",
    );
  }
  if (url.includes(PROD_SUPABASE_REF)) {
    throw new Error(
      `[e2e prod-guard] TARGET IS PRODUCTION (${PROD_SUPABASE_REF}). REFUSING. The E2E harness only runs against the non-prod staging project.`,
    );
  }
  if (!url.includes(expected)) {
    throw new Error(
      `[e2e prod-guard] target URL (${url}) does not match the expected staging ref (${expected}). Allowlist failed closed — refusing to run.`,
    );
  }
  // Passed: target is the allowlisted staging project, not prod.
}
