/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — VAPID keys + test-push secret.
 *
 * Env-first. The embedded fallbacks exist ONLY so the throwaway Vercel PREVIEW
 * is field-testable without configuring Vercel env (the CLI isn't authenticated
 * in this environment). These keys are SPIKE-ONLY — generated fresh for this
 * branch, never used in production, and discarded when the branch is deleted.
 * Do NOT reuse them anywhere real. To override on the preview, set
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / SPIKE_TEST_SECRET in Vercel env.
 * ==========================================================================*/

const FALLBACK_PUBLIC =
  "BH5ATvOXY0S2IaMY_DY0cMhyHXSKUGBw_YD3KJTSuWxsJfWAIZwv3ptYE7lBJvEODSPQNQNy9ew6IFB-DfkNRqE";
const FALLBACK_PRIVATE = "EotgGkdAlsClZNIDfBy8CWZWHl7fSK3346pid-BfxjE";

export function getVapid(): { publicKey: string; privateKey: string } {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY || FALLBACK_PUBLIC,
    privateKey: process.env.VAPID_PRIVATE_KEY || FALLBACK_PRIVATE,
  };
}

export const VAPID_SUBJECT = "mailto:spike@koasthq.com";

// Guards the test-push route. Throwaway, shown on the page for field-test
// convenience; override via SPIKE_TEST_SECRET env on the preview if desired.
export const SPIKE_TEST_SECRET =
  process.env.SPIKE_TEST_SECRET || "koast-spike-push-2026";
