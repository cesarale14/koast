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
import { fmtDate, propertyBlockLines, gapSentence } from "./agendaCardLines";

const GAP_TONE: Record<AgendaGap["kind"], "ok" | "warn" | "alert" | "muted"> = {
  no_cleaner: "alert",
  missing_essentials: "warn",
  awaiting_reply: "warn",
};

function PropertyBlock({ g, upcoming }: { g: AgendaPropertyGroup; upcoming?: boolean }) {
  const lines = propertyBlockLines(g, !!upcoming);
  return (
    <div data-testid="agenda-property" className="mb-1.5 last:mb-0">
      <div className="font-medium text-[var(--deep-sea)]">{g.property}</div>
      {lines.map((l, i) => (
        <div key={i} className="pl-3 text-[var(--tideline)]">{l}</div>
      ))}
    </div>
  );
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
