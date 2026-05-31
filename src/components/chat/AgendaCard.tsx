"use client";

/**
 * AgendaCard — the agenda render type's purpose-built component (Phase C).
 *
 * Renders the typed AgendaRenderPayload (server owns the data; this owns the
 * presentation — it composes the English from structured fields, the server
 * never ships pre-rendered text). Grouped TODAY vs UPCOMING, one row per
 * property carrying its own counts, with the GAP FLAGS as the salient elements
 * (the whole pitch of a card over prose): unstaffed turnovers, guests awaiting
 * a reply, properties missing check-in essentials — each with a StatusDot.
 *
 * A null-tz property is silently absent from the agenda data; when
 * nullTzPropertyCount > 0 the card says so explicitly rather than implying
 * nothing is scheduled there.
 */

import { type ReactNode } from "react";
import StatusDot from "@/components/polish/StatusDot";
import type {
  AgendaGap,
  AgendaPropertyGroup,
  AgendaRenderPayload,
} from "@/lib/agent/render/types";

const GAP_TONE: Record<AgendaGap["kind"], "ok" | "warn" | "alert" | "muted"> = {
  no_cleaner: "alert",
  missing_essentials: "warn",
  awaiting_reply: "warn",
};

function fmtDate(iso: string): string {
  // iso = YYYY-MM-DD. Parse + format in UTC so the label never shifts by tz.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function entryLine(
  label: string,
  entries: { guest: string | null }[],
  withDate?: { date: string },
): string | null {
  if (entries.length === 0) return null;
  const named = entries.filter((e) => e.guest).map((e) => e.guest as string);
  const nameless = entries.length - named.length;
  const detail = named.length
    ? ` (${named.join(", ")}${nameless ? `, +${nameless}` : ""})`
    : "";
  const date = withDate ? ` · ${fmtDate(withDate.date)}` : "";
  return `${entries.length} ${label}${entries.length === 1 ? "" : "s"}${detail}${date}`;
}

function PropertyBlock({ g, upcoming }: { g: AgendaPropertyGroup; upcoming?: boolean }) {
  const dateOf = (arr: { date: string }[]) => (upcoming && arr[0] ? { date: arr[0].date } : undefined);
  const lines = [
    entryLine("check-out", g.checkOuts, dateOf(g.checkOuts)),
    entryLine("check-in", g.checkIns, dateOf(g.checkIns)),
    g.turnovers.length ? `${g.turnovers.length} turnover${g.turnovers.length === 1 ? "" : "s"}` : null,
  ].filter((l): l is string => l !== null);
  return (
    <div data-testid="agenda-property" className="mb-1.5 last:mb-0">
      <div className="font-medium text-[var(--deep-sea)]">{g.property}</div>
      {lines.map((l, i) => (
        <div key={i} className="pl-3 text-[var(--tideline)]">{l}</div>
      ))}
    </div>
  );
}

function relTurnover(iso: string, today: string): string {
  if (iso === today) return "today's";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return "tomorrow's";
  return `the ${fmtDate(iso)}`;
}

function gapSentence(gap: AgendaGap, today: string): string {
  switch (gap.kind) {
    case "no_cleaner":
      return gap.date
        ? `${gap.property}: no cleaner for ${relTurnover(gap.date, today)} turnover`
        : `${gap.property}: no cleaner assigned`;
    case "missing_essentials":
      return `${gap.property}: missing check-in essentials`;
    case "awaiting_reply":
      return `${gap.guest ?? "A guest"} at ${gap.property} may be awaiting a reply`;
  }
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--golden)]">
      {children}
    </div>
  );
}

export function AgendaCard({ payload }: { payload: AgendaRenderPayload }) {
  const { groups, gaps, nullTzPropertyCount } = payload;
  const hasToday = groups.today.length > 0;
  const hasUpcoming = groups.upcoming.length > 0;

  return (
    <div
      data-testid="render-card"
      data-render-kind="agenda"
      className="mt-3 rounded-2xl border border-[var(--hairline)] bg-[var(--shore)] p-4 text-sm leading-relaxed"
    >
      <Eyebrow>Agenda</Eyebrow>

      <div data-testid="agenda-today" className="mb-1 font-medium text-[var(--deep-sea)]">
        Today · {fmtDate(payload.today)}
      </div>
      {hasToday ? (
        <div className="mb-3">
          {groups.today.map((g) => (
            <PropertyBlock key={`t-${g.property}`} g={g} />
          ))}
        </div>
      ) : (
        <div data-testid="agenda-empty" className="mb-3 text-[var(--tideline)]">
          Nothing scheduled today.
        </div>
      )}

      {hasUpcoming && (
        <>
          <Eyebrow>Upcoming</Eyebrow>
          <div className="mb-3">
            {groups.upcoming.map((g) => (
              <PropertyBlock key={`u-${g.property}`} g={g} upcoming />
            ))}
          </div>
        </>
      )}

      {gaps.length > 0 && (
        <>
          <Eyebrow>Needs attention</Eyebrow>
          <ul className="space-y-1">
            {gaps.map((gap, i) => (
              <li
                key={`gap-${i}`}
                data-testid="agenda-gap"
                className="flex items-center gap-2 text-[var(--deep-sea)]"
              >
                <StatusDot tone={GAP_TONE[gap.kind]} />
                <span>{gapSentence(gap, payload.today)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {nullTzPropertyCount > 0 && (
        <div data-testid="agenda-nulltz" className="mt-3 text-[var(--amber-tide)]">
          {nullTzPropertyCount} {nullTzPropertyCount === 1 ? "property" : "properties"} not shown —
          {" "}set {nullTzPropertyCount === 1 ? "its" : "their"} timezone to include {nullTzPropertyCount === 1 ? "it" : "them"}.
        </div>
      )}
    </div>
  );
}
