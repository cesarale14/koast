/**
 * readUncoveredTurnovers — the id-bearing companion read for S4 (host dispatch
 * from Today). The agenda render payload deliberately strips all ids (a
 * host-safety invariant), so it can't drive an Assign action. This separate
 * read returns the actual uncovered turnover task ids (+ the host's active
 * cleaners) so the Today home can assign + dispatch inline. Read-only.
 *
 * Uncovered = unassigned (cleaner_id IS NULL), still pending, scheduled today
 * onward. Capped so the action strip stays calm; soonest-first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type UncoveredTask = { taskId: string; property: string; date: string };
export type CleanerOption = { id: string; name: string };
export type UncoveredTurnovers = { tasks: UncoveredTask[]; cleaners: CleanerOption[] };

export async function readUncoveredTurnovers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  hostId: string,
  /** Host-local YYYY-MM-DD; tasks scheduled before this are not surfaced. */
  today: string,
): Promise<UncoveredTurnovers> {
  const { data: propRows } = await supabase
    .from("properties")
    .select("id, name")
    .eq("user_id", hostId);
  const props = (propRows ?? []) as { id: string; name: string | null }[];
  if (props.length === 0) return { tasks: [], cleaners: [] };

  const propName = new Map(props.map((p) => [p.id, p.name ?? "Property"]));
  const propIds = props.map((p) => p.id);

  const { data: taskRows } = await supabase
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, status, cleaner_id")
    .in("property_id", propIds)
    .is("cleaner_id", null)
    .eq("status", "pending")
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .limit(12);
  const tasks = ((taskRows ?? []) as { id: string; property_id: string; scheduled_date: string }[]).map(
    (t) => ({ taskId: t.id, property: propName.get(t.property_id) ?? "Property", date: t.scheduled_date }),
  );

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

  return { tasks, cleaners };
}
