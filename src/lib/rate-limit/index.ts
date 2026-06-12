/**
 * P6.3 — shared rate-limit primitive (abuse-surface hardening).
 *
 * DB-backed fixed-window counter on top of the `rate_limits` table +
 * `rate_limit_hit` SQL function (migration 20260612030000). There is no Redis
 * in this stack and Vercel serverless instances don't share memory, so the
 * limiter state must live in Postgres. The increment-and-check is a single
 * atomic SECURITY-DEFINER call, so concurrent requests can't race past the cap.
 *
 * Usage in a route:
 *   const rl = await rateLimit(svc, { key: `clean-photo:${ip}`, limit: 30, windowSec: 60 });
 *   if (!rl.allowed) return rateLimited(rl);
 *
 * Fail-OPEN: if the limiter call itself errors (DB blip), we allow the request
 * rather than hard-failing a cleaner mid-job. The limiter is a guard, not the
 * correctness gate — the token check is.
 */

import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface RateLimitInput {
  /** Stable bucket key — namespace it, e.g. `clean-photo:<ip>` or `webhook:<ip>`. */
  key: string;
  /** Max hits permitted within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  /** When the current window resets (ISO string), for Retry-After. */
  resetAt: string | null;
  retryAfterSec: number;
}

export async function rateLimit(
  supabase: SupabaseLike,
  { key, limit, windowSec }: RateLimitInput,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSec,
      p_limit: limit,
    });
    if (error) throw error;
    // RETURNS TABLE → supabase returns an array of one row.
    const row = Array.isArray(data) ? data[0] : data;
    const allowed = row?.allowed !== false; // default-allow if shape is unexpected
    const resetAt: string | null = row?.reset_at ?? null;
    const retryAfterSec = resetAt
      ? Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000))
      : windowSec;
    return { allowed, count: row?.current_count ?? 0, resetAt, retryAfterSec };
  } catch (err) {
    // Fail-open — never block a legitimate request because the limiter hiccuped.
    console.warn(`[rate-limit] check failed for ${key}, failing open:`, err instanceof Error ? err.message : err);
    return { allowed: true, count: 0, resetAt: null, retryAfterSec: windowSec };
  }
}

/** Standard 429 response for a blocked request, with Retry-After. */
export function rateLimited(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}

/**
 * Best-effort client IP from the standard proxy headers (Vercel sets
 * x-forwarded-for). Falls back to a constant so the limiter still groups
 * unknown-IP traffic into one bucket rather than letting it through unbounded.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
