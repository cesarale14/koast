/**
 * Pure VAPID public-key helpers (no DOM, no React) — so the encoding/conversion
 * + validation path is DETERMINISTICALLY unit-tested. This is the seam the suite
 * was blind to: the browser pushManager.subscribe() call needs jsdom, but the
 * key SHAPE that makes it throw is pure and testable here.
 *
 * A1-5 root cause: a VAPID public key truncated by one base64url char decodes to
 * 64 bytes (not 65). It looks fine as a string, but pushManager.subscribe rejects
 * it: "applicationServerKey must contain a valid P-256 public key." A valid VAPID
 * application-server key is an UNCOMPRESSED P-256 point — exactly 65 bytes, first
 * byte 0x04 (≈87 base64url chars). isValidVapidPublicKey enforces that shape so a
 * misconfigured key degrades gracefully (and is logged) instead of throwing.
 */

/** base64url → Uint8Array (the applicationServerKey the browser expects). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * True only when `key` is a well-formed VAPID application-server public key:
 * base64url (no padding / no std-b64 chars / no whitespace) that decodes to an
 * uncompressed P-256 point — 65 bytes, first byte 0x04. Catches the truncated
 * paste (64 bytes), the private key, std-base64, and empty/undefined.
 */
export function isValidVapidPublicKey(key: string | null | undefined): boolean {
  if (!key || typeof key !== "string") return false;
  const t = key.trim();
  if (t.length === 0) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return false; // base64url only (no +,/,=,whitespace)
  let bytes: Uint8Array;
  try {
    bytes = urlBase64ToUint8Array(t);
  } catch {
    return false;
  }
  return bytes.length === 65 && bytes[0] === 0x04;
}
