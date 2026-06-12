/**
 * P6.4 — internal API error capture (operator-facing; no Sentry dep, no DSN).
 *
 * captureApiError writes one row to api_errors and, when a route is failing
 * repeatedly in a short window, logs a loud CRITICAL line so the operator sees
 * the burst in Vercel logs. This is the "bell-on-repeated-failures" without a
 * host-facing notification — internal errors are an operator concern, not a host
 * one. (Wiring the burst signal to a real alert sink — email/Slack/Sentry — is a
 * NEEDS-CESAR follow-up; the capture + threshold is the substrate.)
 *
 * Best-effort: capture must NEVER throw back into the caller's catch block.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const BURST_THRESHOLD = 5; // same-route errors...
const BURST_WINDOW_MIN = 10; // ...within this window → operator alert

export interface ApiErrorInput {
  route: string;
  method?: string;
  status?: number;
  message: string;
  context?: Record<string, unknown>;
  hostId?: string | null;
}

export async function captureApiError(supabase: SupabaseLike, e: ApiErrorInput): Promise<void> {
  try {
    await supabase.from("api_errors").insert({
      route: e.route,
      method: e.method ?? null,
      status: e.status ?? null,
      message: (e.message ?? "").slice(0, 2000),
      context: e.context ?? {},
      host_id: e.hostId ?? null,
    });

    // Burst detection — count recent same-route errors (head+count, no rows).
    const since = new Date(Date.now() - BURST_WINDOW_MIN * 60_000).toISOString();
    const { count } = await supabase
      .from("api_errors")
      .select("id", { count: "exact", head: true })
      .eq("route", e.route)
      .gte("created_at", since);

    if ((count ?? 0) >= BURST_THRESHOLD) {
      console.error(
        `[CRITICAL][api_errors] route "${e.route}" failed ${count}x in ${BURST_WINDOW_MIN}min — investigate. latest: ${e.message}`,
      );
    }
  } catch (err) {
    console.warn("[captureApiError] failed to record:", err instanceof Error ? err.message : err);
  }
}
