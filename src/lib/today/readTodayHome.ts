/**
 * readTodayHome — the server-side standalone read for the Today-home cold paint.
 *
 * REUSE, no new triage: this is exactly the render_agenda tool's path
 * (buildAgendaRollup + classifySufficiency + toAgendaRenderPayload), called with
 * (supabase, hostId), zero agent loop, plus a cheap places join (cover_photo_url)
 * and the deterministic greeting. Read-only: no loop, no actions, no writes.
 *
 * Measured latency (staging): ~165-400ms for the rollup+sufficiency pair — non-
 * trivial, so the route wraps <TodayHome> in <Suspense> behind a calm skeleton
 * rather than blocking the paint (see the Phase 0 composition).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAgendaRollup } from "@/lib/agent/agenda";
import { classifySufficiency } from "@/lib/agent/sufficiency";
import { toAgendaRenderPayload } from "@/lib/agent/render/agenda";
import type { AgendaRenderPayload } from "@/lib/agent/render/types";
import { deriveGreeting, type GreetingFacts } from "./deriveGreeting";
import { toPlacesMap, type Places } from "./places";

export type TodayHomeData = {
  payload: AgendaRenderPayload;
  places: Places;
  greeting: GreetingFacts;
};

export async function readTodayHome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  hostId: string,
  opts: { name: string | null; hourLocal: number },
): Promise<TodayHomeData> {
  const [rollup, sufficiency, propRes] = await Promise.all([
    buildAgendaRollup(supabase, hostId),
    classifySufficiency(supabase, hostId),
    supabase.from("properties").select("name, cover_photo_url").eq("user_id", hostId),
  ]);
  const missingEssentials = sufficiency.per_property
    .filter((p) => p.missing_count > 0)
    .map((p) => p.property_name ?? "a property");
  const payload = toAgendaRenderPayload(rollup, missingEssentials);
  const places = toPlacesMap(
    (propRes.data ?? []) as { name: string | null; cover_photo_url: string | null }[],
  );
  const greeting = deriveGreeting(payload, opts.name, opts.hourLocal);
  return { payload, places, greeting };
}
