/**
 * P6.3 — single source of truth for cleaner-token authentication.
 *
 * Every /api/clean/[taskId]/[token]/* route authenticates the same way: match
 * the unguessable per-task `cleaner_token`. Before P6.3 that was an inline
 * `.eq("cleaner_token", token)` in each route with no notion of expiry or
 * revocation. This helper adds both so a host can rotate a link (the old token
 * stops working instantly) and so stale links can lapse — and it's one place to
 * audit, not five.
 *
 * Returns a discriminated result; callers translate `!ok` into their own
 * NextResponse with the given status + message.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type CleanerTokenResult =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { ok: true; task: any }
  | { ok: false; status: number; error: string };

export async function verifyCleanerToken(
  supabase: SupabaseLike,
  taskId: string,
  token: string,
  /** Columns the caller needs; the guard columns are always added. */
  selectCols: string,
): Promise<CleanerTokenResult> {
  if (!taskId || !token) {
    return { ok: false, status: 403, error: "Invalid task or token" };
  }

  const cols = `${selectCols}, token_invalidated_at, token_expires_at`;
  const { data } = await supabase
    .from("cleaning_tasks")
    .select(cols)
    .eq("id", taskId)
    .eq("cleaner_token", token)
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((data ?? []) as any[])[0];
  if (!task) return { ok: false, status: 403, error: "Invalid task or token" };

  if (task.token_invalidated_at) {
    return { ok: false, status: 403, error: "This link has been replaced. Ask the host to text you a new one." };
  }
  if (task.token_expires_at && new Date(task.token_expires_at).getTime() < Date.now()) {
    return { ok: false, status: 403, error: "This link has expired. Ask the host to text you a new one." };
  }

  return { ok: true, task };
}
