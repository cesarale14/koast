/**
 * TodayHomeServer — the async server component that fetches the real Today-home
 * data and renders <TodayHome>. Lives behind a <Suspense> boundary in the "/"
 * page so the slow rollup (readTodayHome ~165-400ms) streams while the shell
 * paints (the Phase 0 RSC-through-client-layout composition).
 *
 * P1.2 (v1 program) — Today-home go-live. Read-only: readTodayHome runs the
 * render_agenda path (buildAgendaRollup + classifySufficiency + payload) with
 * zero agent loop, no actions, no writes. The host's display name (first token
 * of their metadata name) and local hour (from their primary property timezone,
 * defaulting to ET for this fleet) feed the deterministic greeting.
 */
import { createClient } from "@/lib/supabase/server";
import { readTodayHome } from "@/lib/today/readTodayHome";
import { TodayHome } from "@/components/today/TodayHome";

function firstName(meta: Record<string, unknown> | undefined): string | null {
  const full = (meta?.full_name ?? meta?.name) as string | undefined;
  const token = (full ?? "").trim().split(/\s+/)[0];
  return token || null;
}

function hourInTz(tz: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(new Date());
    const n = parseInt(formatted, 10);
    return Number.isFinite(n) ? n % 24 : 9;
  } catch {
    return 9; // unknown tz → a neutral morning hour; greeting still renders
  }
}

export async function TodayHomeServer() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (dashboard) segment is auth-gated by middleware; this is a defensive
  // no-op for the unreachable signed-out case.
  if (!user) return null;

  // Host primary timezone for the greeting hour (cheap single row; both fleet
  // properties are ET, and we default to ET when unset).
  const { data: tzRows } = await supabase
    .from("properties")
    .select("timezone")
    .eq("user_id", user.id)
    .not("timezone", "is", null)
    .limit(1);
  const tz = (tzRows?.[0]?.timezone as string | undefined) || "America/New_York";

  const name = firstName(user.user_metadata as Record<string, unknown> | undefined);
  const hourLocal = hourInTz(tz);

  const { payload, places, greeting } = await readTodayHome(supabase, user.id, {
    name,
    hourLocal,
  });

  return <TodayHome payload={payload} places={places} greeting={greeting} />;
}
