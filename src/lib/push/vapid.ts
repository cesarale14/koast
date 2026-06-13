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

import { isValidVapidPublicKey } from "./vapid-key";

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

/**
 * Public key for the browser (applicationServerKey), or null if unconfigured OR
 * malformed. A1-5: a truncated/invalid key must NOT reach the client — it would
 * throw the cryptic "valid P-256 public key" error at pushManager.subscribe. We
 * validate the SHAPE here (65-byte uncompressed P-256 point) and return null +
 * warn when it's wrong, so the cleaner page degrades to "unavailable" and the
 * misconfig is visible in logs instead of failing opaquely in the browser.
 */
export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return null;
  const trimmed = key.trim();
  if (!isValidVapidPublicKey(trimmed)) {
    console.warn(
      "[vapid] VAPID_PUBLIC_KEY is set but is not a valid base64url-encoded uncompressed P-256 public key (must be 65 bytes / ~87 chars). Push is treated as unconfigured. Regenerate the VAPID keypair and set both VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY.",
    );
    return null;
  }
  return trimmed;
}
