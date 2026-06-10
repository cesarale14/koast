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
import { readTodayTurnovers } from "@/lib/today/readTodayTurnovers";
import { TodayHome } from "@/components/today/TodayHome";
import { TodayTurnovers } from "@/components/today/TodayTurnovers";
import { TodaySuggests } from "@/components/today/TodaySuggests";

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

function dateInTz(tz: string): string {
  try {
    // en-CA renders YYYY-MM-DD, the shape cleaning_tasks.scheduled_date uses.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
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
  const todayLocal = dateInTz(tz);

  const [data, todayTurnovers] = await Promise.all([
    readTodayHome(supabase, user.id, { name, hourLocal }),
    readTodayTurnovers(supabase, user.id, todayLocal),
  ]);

  // S4 + S5: the turnover strip — assign+dispatch for an uncovered turnover,
  // status reflection (dispatched → in-progress → done) for the rest. Only
  // rendered when there's a turnover in the window (otherwise the home stays calm).
  const actionSlot =
    todayTurnovers.turnovers.length > 0 ? (
      <TodayTurnovers turnovers={todayTurnovers.turnovers} cleaners={todayTurnovers.cleaners} />
    ) : undefined;

  return (
    <TodayHome
      payload={data.payload}
      places={data.places}
      greeting={data.greeting}
      actionSlot={actionSlot}
      suggestsSlot={<TodaySuggests />}
    />
  );
}
