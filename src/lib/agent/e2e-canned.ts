/**
 * e2e-canned — deterministic agent response for Playwright E2E.
 *
 * M13 Phase 1.B Playwright harness (Decision 7). The conversation
 * lifecycle create specs (sweep items 1, 2, 5, 13) assert REAL
 * persistence + list reactivity — a turn must create a conversation
 * row, persist turns, and appear in history. They must NOT depend on a
 * live LLM call (slow, nondeterministic, costly, flaky — the exact
 * thing the harness exists to eliminate).
 *
 * So `runAgentTurn` cans ONLY the model call when this mode is active:
 * the conversation + user turn + assistant turn are still persisted
 * exactly as in production; only the assistant's text is the canned
 * constant below instead of an Anthropic stream.
 *
 * SAFETY — fail-closed / prod-inert:
 *   Active iff KOAST_E2E_CANNED_AGENT === "1" AND the Supabase URL is
 *   NOT the production project ref. The env flag is the primary control
 *   (never set in Vercel prod). The prod-ref denylist is belt-and-
 *   suspenders: if the flag were somehow set against prod, this returns
 *   false and the real LLM path runs — canned mode can never touch a
 *   production database. Mirrors the allowlist-fail-closed discipline of
 *   the Playwright global-setup prod-guard.
 */

/** Production Supabase project ref — canned mode is refused against it. */
const PROD_SUPABASE_REF = "wxxpbgbfebpkvsxhpphb";

export const CANNED_AGENT_TEXT =
  "This is a deterministic Koast test response.";

export function isCannedAgentMode(): boolean {
  if (process.env.KOAST_E2E_CANNED_AGENT !== "1") return false;
  // Fail-closed: never can a response against production.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (url.includes(PROD_SUPABASE_REF)) return false;
  return true;
}
