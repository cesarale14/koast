/**
 * Lightweight advisory lock primitive built on top of Supabase and the
 * `concurrency_locks` table (see migration 20260413020000). Callers use
 * this to serialize risky multi-step operations — in particular the
 * Booking.com connect flow and the Channex import flow, both of which
 * interleave Channex API writes with Supabase writes and must not race
 * on the same property.
 *
 * Acquire is inline-safe: before attempting to insert the lock row we
 * proactively delete any rows whose expires_at has passed. This means a
 * server crash that orphans a lock row cleans itself up on the next
 * acquire attempt — we don't depend on a cron.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/**
 * Try to acquire the lock. Returns true if we got it, false if another
 * holder is active. TTL is in seconds; we use 60s by default everywhere.
 */
export async function acquireLock(
  supabase: SupabaseLike,
  lockKey: string,
  ttlSeconds = 60
): Promise<boolean> {
  // Inline stale-row cleanup: delete any lock row whose expires_at has
  // passed. Targeting the specific key keeps this cheap; we don't sweep
  // the whole table. Errors are swallowed because the acquire attempt
  // below is the real correctness gate.
  try {
    await supabase
      .from("concurrency_locks")
      .delete()
      .eq("lock_key", lockKey)
      .lt("expires_at", new Date().toISOString());
  } catch { /* best effort */ }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from("concurrency_locks")
      .insert({ lock_key: lockKey, expires_at: expiresAt })
      .select("lock_key")
      .maybeSingle();
    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the lock. Safe to call multiple times; errors are swallowed
 * because releasing a lock that's already gone is a no-op by design.
 */
export async function releaseLock(
  supabase: SupabaseLike,
  lockKey: string
): Promise<void> {
  try {
    await supabase
      .from("concurrency_locks")
      .delete()
      .eq("lock_key", lockKey);
  } catch { /* ignore */ }
}
