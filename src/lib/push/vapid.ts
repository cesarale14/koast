/**
 * VAPID configuration for web-push (TURN-S2-send).
 *
 * Env-only — NO embedded fallback keys (unlike the throwaway spike). The real
 * keypair lives in Vercel env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ optional
 * VAPID_SUBJECT). If they're unset, push is treated as unconfigured and the
 * send/subscribe paths degrade gracefully (best-effort; never throws into the
 * caller). The PUBLIC key is safe to expose to the browser; the private key is
 * a secret and must never reach the client bundle or version control.
 */

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** Returns the VAPID config from env, or null when not configured. */
export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    subject: process.env.VAPID_SUBJECT || "mailto:ops@koasthq.com",
    publicKey,
    privateKey,
  };
}

/** Public key for the browser (applicationServerKey), or null if unconfigured. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}
