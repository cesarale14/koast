/**
 * Agenda render type — wires the verified agenda rollup into the typed render
 * payload. Built ON TOP of buildAgendaRollup (data/windowing/tz untouched) and
 * the SHARED groupAgenda transform, so the card and the prose preamble can
 * never disagree.
 *
 * Invariants enforced here: NO ids in the payload (host-facing), STRUCTURED
 * gaps (kind + property + optional guest — the card renders the sentence, never
 * the server), and no-drift-by-construction. The gap flags — the salient
 * elements of a card — are: no_cleaner + awaiting_reply (derived from the
 * rollup) and missing_essentials (passed in, derived by classifySufficiency —
 * the SAME source the prose property-gaps line uses, so the card and prose
 * can't disagree on the gap the host cares about most).
 */
import {
  groupAgenda,
  type AgendaRollup,
  type AgendaPropertyBucket,
} from "@/lib/agent/agenda";
import type {
  AgendaGap,
  AgendaPropertyGroup,
  AgendaRenderPayload,
} from "./types";

function toGroup(b: AgendaPropertyBucket): AgendaPropertyGroup {
  return {
    property: b.property,
    checkIns: b.checkIns.map((c) => ({ guest: c.guest, date: c.date, numGuests: c.numGuests })),
    checkOuts: b.checkOuts.map((c) => ({ guest: c.guest, date: c.date })),
    turnovers: b.turnovers.map((t) => ({ date: t.date, time: t.time, cleanerAssigned: t.cleanerAssigned })),
  };
}

/**
 * @param missingEssentialsProperties property nicknames missing check-in
 *   essentials, from classifySufficiency.per_property (missing_count > 0). The
 *   SAME source as the prose property-gaps line — pass [] when sufficiency
 *   isn't available (the card simply omits that gap, never re-derives it).
 */
export function toAgendaRenderPayload(
  rollup: AgendaRollup,
  missingEssentialsProperties: string[] = [],
): AgendaRenderPayload {
  const grouped = groupAgenda(rollup);

  // no_cleaner gaps carry the turnover DATE (horizon-aware): today's groups are
  // iterated before upcoming, so today-urgent gaps come first in the array.
  const gaps: AgendaGap[] = [];
  for (const b of [...grouped.todayGroups, ...grouped.upcomingGroups]) {
    for (const t of b.turnovers) {
      if (!t.cleanerAssigned) gaps.push({ kind: "no_cleaner", property: b.property, date: t.date });
    }
  }
  for (const m of grouped.pendingMessages) {
    gaps.push({ kind: "awaiting_reply", property: m.property, guest: m.guest });
  }
  for (const property of missingEssentialsProperties) {
    gaps.push({ kind: "missing_essentials", property });
  }

  return {
    v: 1,
    kind: "agenda",
    horizon: "today_48h",
    today: grouped.today,
    groups: {
      today: grouped.todayGroups.map(toGroup),
      upcoming: grouped.upcomingGroups.map(toGroup),
    },
    gaps,
    nullTzPropertyCount: grouped.nullTzPropertyCount,
  };
}
