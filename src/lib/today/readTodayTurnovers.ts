/**
 * readTodayTurnovers — the id-bearing turnover read behind the Today home's
 * turnover strip (S4 assign + S5 status reflection). The agenda render payload
 * is deliberately id-stripped (a host-safety invariant), so this separate read
 * carries the task ids + live status the home needs to both act on a gap and
 * show it walk needs-cleaner → dispatched → in-progress → done. Read-only.
 *
 * Window: scheduled today onward (so a turnover completed today still shows
 * "done", then drops off tomorrow). Soonest-first; capped so the strip stays calm.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CleaningTaskStatus } from "@/lib/db/schema";

export type TodayTurnover = {
  taskId: string;
  property: string;
  date: string;
  status: CleaningTaskStatus;
  cleanerName: string | null;
};
export type CleanerOption = { id: string; name: string };
export type TodayTurnovers = { turnovers: TodayTurnover[]; cleaners: CleanerOption[] };

export async function readTodayTurnovers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  hostId: string,
  /** Host-local YYYY-MM-DD; turnovers scheduled before this are not surfaced. */
  today: string,
): Promise<TodayTurnovers> {
  const { data: propRows } = await supabase
    .from("properties")
    .select("id, name")
    .eq("user_id", hostId);
  const props = (propRows ?? []) as { id: string; name: string | null }[];
  if (props.length === 0) return { turnovers: [], cleaners: [] };

  const propName = new Map(props.map((p) => [p.id, p.name ?? "Property"]));
  const propIds = props.map((p) => p.id);

  const { data: cleanerRows } = await supabase
    .from("cleaners")
    .select("id, name")
    .eq("user_id", hostId)
    .eq("is_active", true)
    .order("name");
  const cleaners = ((cleanerRows ?? []) as { id: string; name: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name ?? "Cleaner",
  }));
  const cleanerName = new Map(cleaners.map((c) => [c.id, c.name]));

  const { data: taskRows } = await supabase
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, status, cleaner_id")
    .in("property_id", propIds)
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .limit(12);
  const turnovers = (
    (taskRows ?? []) as {
      id: string;
      property_id: string;
      scheduled_date: string;
      status: string | null;
      cleaner_id: string | null;
    }[]
  ).map((t) => ({
    taskId: t.id,
    property: propName.get(t.property_id) ?? "Property",
    date: t.scheduled_date,
    status: (t.status ?? "pending") as CleaningTaskStatus,
    cleanerName: t.cleaner_id ? cleanerName.get(t.cleaner_id) ?? null : null,
  }));

  return { turnovers, cleaners };
}
