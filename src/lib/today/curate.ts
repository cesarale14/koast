/**
 * curate — the Today-home curation layer: turns the raw agenda payload into the
 * CALM, GROUPED model the surface renders. Curation (grouping same-type events,
 * separating gaps from movements) lives HERE as tested structured facts, never
 * ad-hoc in JSX — the same discipline as deriveGreeting (facts derived + unit-
 * tested; the component owns presentation).
 *
 * Two rules the surface depends on:
 *
 *  - GROUP same-type events into one line ("2 checkouts — Jeremy +1"): the named
 *    guest leads, a clean "+N" counts the nameless OTA placeholders, never a
 *    standalone "A checkout". Grouped by (kind, date) so a property's checkouts on
 *    different upcoming days stay distinct — and it loses/dupes nothing
 *    (count === named.length + namelessCount, always).
 *
 *  - SEPARATE gaps from movements: NEEDS YOU owns the gaps (payload.gaps), the
 *    TODAY / COMING-UP blocks show MOVEMENTS ONLY (guest check-ins / check-outs).
 *    A turnover is NOT a movement line — an unstaffed turnover is a no_cleaner GAP
 *    (NEEDS YOU); a staffed one is routine and stays quiet. So "no cleaner yet"
 *    never appears in both places.
 */
import type {
  AgendaRenderPayload,
  AgendaPropertyGroup,
  AgendaGap,
} from "@/lib/agent/render/types";

export type MovementKind = "checkout" | "checkin";

export type MovementLine = {
  kind: MovementKind;
  /** ISO date; in the TODAY section this equals payload.today. */
  date: string;
  /** Total events of this kind on this date. */
  count: number;
  /** Real-named guests, in encounter order — the lead of the line. */
  named: string[];
  /** OTA-placeholder / un-taught guests → the "+N". count === named.length + this. */
  namelessCount: number;
  /** Summed numGuests when any entry carried it, else null (light people). */
  guests: number | null;
};

export type CuratedProperty = {
  property: string;
  /** Grouped movement lines; always non-empty (movement-less properties drop out). */
  movements: MovementLine[];
};

export type CuratedToday = {
  /** NEEDS YOU — unchanged from the payload; the ONLY home for gaps. */
  gaps: AgendaGap[];
  /** Movements only. */
  today: CuratedProperty[];
  /** Movements only. */
  upcoming: CuratedProperty[];
  /** No movements AND no gaps — the all-clear day. */
  empty: boolean;
};

function groupEntries(
  entries: { guest: string | null; date: string; numGuests?: number | null }[],
  kind: MovementKind,
): MovementLine[] {
  // Group by date (Map preserves first-seen order); within a group the named
  // guests lead and the nameless are counted.
  const byDate = new Map<string, MovementLine>();
  for (const e of entries) {
    let line = byDate.get(e.date);
    if (!line) {
      line = { kind, date: e.date, count: 0, named: [], namelessCount: 0, guests: null };
      byDate.set(e.date, line);
    }
    line.count += 1;
    if (e.guest) line.named.push(e.guest);
    else line.namelessCount += 1;
    if (e.numGuests != null) line.guests = (line.guests ?? 0) + e.numGuests;
  }
  return Array.from(byDate.values());
}

function curateProperty(g: AgendaPropertyGroup): CuratedProperty | null {
  // Movements = guest flow: check-outs, then check-ins. Turnovers are NOT a
  // movement (an unstaffed one is a NEEDS-YOU gap; a staffed one is routine).
  const movements = [
    ...groupEntries(g.checkOuts, "checkout"),
    ...groupEntries(g.checkIns, "checkin"),
  ];
  if (movements.length === 0) return null; // movement-less property → not a block row
  return { property: g.property, movements };
}

function curateSection(groups: AgendaPropertyGroup[]): CuratedProperty[] {
  return groups
    .map(curateProperty)
    .filter((p): p is CuratedProperty => p !== null);
}

export function curateToday(payload: AgendaRenderPayload): CuratedToday {
  const today = curateSection(payload.groups.today);
  const upcoming = curateSection(payload.groups.upcoming);
  return {
    gaps: payload.gaps,
    today,
    upcoming,
    empty: today.length === 0 && upcoming.length === 0 && payload.gaps.length === 0,
  };
}

/**
 * A2 (5b) — partition the read-only "Needs you" gaps into what's IMMINENT (today
 * through +windowDays) vs. what's further out. Cold-open focus stays on the next
 * couple of days; dated gaps beyond the window fold into a "+N upcoming" link.
 * Undated gaps (no date on the gap) are always imminent — they're not time-bound.
 * Pure so it's unit-tested; the surface only renders the result.
 */
export function partitionImminentGaps(
  gaps: AgendaGap[],
  today: string,
  windowDays = 2,
): { imminent: AgendaGap[]; upcomingCount: number } {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + windowDays);
  const imminent = gaps.filter(
    (g) => !g.date || new Date(`${g.date}T00:00:00Z`).getTime() <= cutoff.getTime(),
  );
  return { imminent, upcomingCount: gaps.length - imminent.length };
}
