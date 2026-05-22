/**
 * Voice extraction scheduler — M10 Phase E STEP 5 (K1).
 *
 * Shared handler that BOTH the cron route (Vercel Cron nightly) AND the
 * manual-trigger route invoke. Single function = single behavior path =
 * no cron/manual drift. Per ultraplan §10 item 5 — v2.8 "scheduler shared
 * handler" candidate convention.
 *
 * Pure scheduling substrate:
 *   - Enumerates hosts via `SELECT DISTINCT user_id FROM properties`
 *     (i.e., "hosts who can be drafted-for"; production = 1 host today)
 *   - Iterates extractVoiceForHost per host with per-host try/catch
 *     (one host's failure doesn't abort the run)
 *   - Aggregates results into an ExtractionRunSummary
 *
 * Auth-agnostic: routes (STEP 6) own authentication; the handler trusts
 * its supabase client (typically service-role from createServiceClient).
 *
 * Logic-untouched: orchestrates the existing M9 Phase E extractor
 * (src/lib/voice/extraction-worker.ts; D25/Q-E5/Q-E6/Q-E7 iii locks).
 * Does NOT modify extraction logic, schema, or VoiceFeatures shape
 * (Q1/emoji_frequency stays deferred v2.8).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractVoiceForHost,
  type ExtractionResult,
} from "@/lib/voice/extraction-worker";

/** Aggregated outcome of a single extraction-scheduler run. Keys map
 *  directly to extractVoiceForHost's ExtractionStatus variants
 *  ('extracted' | 'no_change' | 'insufficient_samples') plus an error
 *  bucket for per-host throws. */
export interface ExtractionRunSummary {
  hosts_processed: number;
  hosts_extracted: number;
  hosts_no_change: number;
  hosts_insufficient: number;
  hosts_error: number;
  errors: Array<{ host_id: string; message: string }>;
}

/** Enumerate hosts who can be drafted-for. "host" = distinct user_id on
 *  the properties table (a property owner; not all auth.users). Set-based
 *  to scale beyond the current single-host production state. */
async function enumerateHosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("user_id");
  if (error) {
    throw new Error(`extraction-scheduler: host enumeration failed: ${error.message}`);
  }
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ user_id: string | null }>) {
    if (row.user_id) ids.add(row.user_id);
  }
  return Array.from(ids);
}

function emptySummary(): ExtractionRunSummary {
  return {
    hosts_processed: 0,
    hosts_extracted: 0,
    hosts_no_change: 0,
    hosts_insufficient: 0,
    hosts_error: 0,
    errors: [],
  };
}

function tallyResult(summary: ExtractionRunSummary, result: ExtractionResult): void {
  switch (result.status) {
    case "extracted":
      summary.hosts_extracted += 1;
      return;
    case "no_change":
      summary.hosts_no_change += 1;
      return;
    case "insufficient_samples":
      summary.hosts_insufficient += 1;
      return;
  }
}

/**
 * Run voice-extraction for every host. Per-host failure isolation: one
 * host throwing does NOT abort the run; the error is captured into the
 * summary and iteration continues. Structured per-host log mirrors the
 * pricing_validator/booking_sync log shape (single line; status keyword).
 *
 * Auth-agnostic: callers (cron + manual routes) authenticate themselves
 * before invoking this handler. Caller passes a supabase client typically
 * from `createServiceClient()` (service-role; bypasses RLS).
 *
 * Returns the aggregated summary. Never throws on per-host errors;
 * throws only on infrastructure failures (host enumeration query error).
 */
export async function runExtractionForAllHosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<ExtractionRunSummary> {
  const summary = emptySummary();
  const hosts = await enumerateHosts(supabase);
  summary.hosts_processed = hosts.length;

  for (const hostId of hosts) {
    try {
      const result = await extractVoiceForHost(supabase, hostId);
      tallyResult(summary, result);
      console.log(
        `[voice-extraction] host=${hostId} status=${result.status} samples=${result.sample_count}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.hosts_error += 1;
      summary.errors.push({ host_id: hostId, message });
      console.error(
        `[voice-extraction] host=${hostId} status=error message=${message}`,
      );
    }
  }

  console.log(
    `[voice-extraction] run-summary processed=${summary.hosts_processed} extracted=${summary.hosts_extracted} no_change=${summary.hosts_no_change} insufficient=${summary.hosts_insufficient} error=${summary.hosts_error}`,
  );
  return summary;
}
