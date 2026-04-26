// TURN-S1a — internal-route auth helper.
//
// /api/internal/* routes are called by Postgres triggers (via pg_net)
// and other server-side surfaces, never by browsers. They authenticate
// via a shared bearer secret (`INTERNAL_TRIGGER_SECRET` in the Vercel
// env, mirrored in Supabase vault as `turnover_trigger_secret`).
//
// NOT a substitute for `getAuthenticatedUser` on user-facing routes —
// this is a single shared secret for trusted internal callers.
//
// Always 401 on miss/mismatch. Constant-time compare to avoid
// timing attacks on the secret.

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export class InternalAuthError extends Error {
  status = 401;
  constructor(message: string) { super(message); this.name = "InternalAuthError"; }
}

/**
 * Validates `Authorization: Bearer <INTERNAL_TRIGGER_SECRET>` on a
 * request. Throws `InternalAuthError` (status 401) on miss/mismatch
 * or when the env var isn't configured.
 */
export function assertInternalAuth(request: NextRequest): void {
  const expected = process.env.INTERNAL_TRIGGER_SECRET;
  if (!expected) {
    // Configuration miss — return 401 rather than 500 so an
    // attacker can't distinguish "secret not set" from "wrong
    // secret." Internal logs surface the configuration error.
    console.error("[auth/internal] INTERNAL_TRIGGER_SECRET is not set");
    throw new InternalAuthError("Unauthorized");
  }

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    throw new InternalAuthError("Unauthorized");
  }
  const presented = header.slice(prefix.length);

  // Constant-time compare. Both sides must be Buffers of identical
  // length, so wrap the short side first.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InternalAuthError("Unauthorized");
  }
}
