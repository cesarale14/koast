"use client";

/**
 * TurnoverBlock — the canonical single-turnover row (P2.2). ONE component,
 * two modes:
 *  - read-only (no `actions`): status dot + property + date + status label.
 *    This is what the agent's render lane / a ProposalCard summary shows
 *    (id-free, no buttons).
 *  - actionable (`actions` passed): the live Today row — cleaner picker +
 *    one-tap Assign (= assign+dispatch) for pending turnovers, and a Photos
 *    toggle + grid for completed ones.
 *
 * The Today strip (TodayTurnovers) owns the strip-level state (busy/optimistic/
 * poll/toast + the /api/turnover/* calls) and renders one TurnoverBlock per
 * row — so the turnover the host sees on Today, the turnover the agent shows in
 * chat, and the turnover inside a ProposalCard are ALL this same component.
 */

import type { CleaningTaskStatus } from "@/lib/db/schema";
import type { TurnoverBlockData } from "./types";
import { fmtWeekdayMonthDay } from "./format";

export type TurnoverBlockActions = {
  cleaners: { id: string; name: string }[];
  selectedCleanerId: string;
  onSelectCleaner: (id: string) => void;
  onAssign: () => void;
  assigning?: boolean;
  photos?: {
    open: boolean;
    loading: boolean;
    urls: string[];
    onToggle: () => void;
  };
};

const STATUS_DOT: Partial<Record<CleaningTaskStatus, string>> = {
  assigned: "var(--amber-tide)",
  in_progress: "var(--lume)",
  completed: "var(--lagoon)",
  issue: "var(--coral-reef)",
};

export function turnoverStatusLabel(status: CleaningTaskStatus, cleaner: string | null): string {
  const who = cleaner ?? "Cleaner";
  switch (status) {
    case "assigned":
      return cleaner ? `Dispatched to ${who}` : "Dispatched";
    case "in_progress":
      return `${who} is cleaning`;
    case "completed":
      return cleaner ? `Done · ${who}` : "Done";
    case "issue":
      return "Issue reported";
    default:
      return "";
  }
}

export function TurnoverBlock({
  data,
  actions,
}: {
  data: TurnoverBlockData;
  actions?: TurnoverBlockActions;
}) {
  const isPending = data.status === "pending";
  const dot = isPending ? "var(--coral-reef)" : STATUS_DOT[data.status] ?? "var(--tideline)";
  const noCleaners = (actions?.cleaners.length ?? 0) === 0;
  const photoCount = data.photoCount ?? 0;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
        opacity: data.status === "completed" ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden
          style={{ width: 9, height: 9, borderRadius: 99, background: dot, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 15 }}>{data.property}</div>
          <div style={{ color: "var(--tideline)", fontSize: 13 }}>
            {fmtWeekdayMonthDay(data.date)}
            {!isPending ? ` · ${turnoverStatusLabel(data.status, data.cleanerName)}` : ""}
          </div>
        </div>

        {actions && isPending && actions.cleaners.length > 1 && (
          <select
            aria-label="Choose cleaner"
            value={actions.selectedCleanerId}
            onChange={(e) => actions.onSelectCleaner(e.target.value)}
            disabled={actions.assigning}
            style={{
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid var(--hairline)",
              background: "white",
              color: "var(--deep-sea)",
            }}
          >
            {actions.cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {actions && isPending && (
          <button
            onClick={actions.onAssign}
            disabled={actions.assigning || noCleaners}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              whiteSpace: "nowrap",
              cursor: actions.assigning || noCleaners ? "default" : "pointer",
              background: noCleaners ? "var(--shell)" : "var(--coastal)",
              color: noCleaners ? "var(--tideline)" : "white",
              opacity: actions.assigning ? 0.7 : 1,
            }}
          >
            {actions.assigning
              ? "Assigning..."
              : noCleaners
                ? "No cleaners"
                : actions.cleaners.length === 1
                  ? `Assign ${actions.cleaners[0].name.split(/\s+/)[0]}`
                  : "Assign"}
          </button>
        )}

        {actions?.photos && !isPending && photoCount > 0 && (
          <button
            onClick={actions.photos.onToggle}
            disabled={actions.photos.loading}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--hairline)",
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: "white",
              color: "var(--coastal)",
            }}
          >
            {actions.photos.loading ? "Loading..." : actions.photos.open ? "Hide" : `Photos (${photoCount})`}
          </button>
        )}
      </div>

      {actions?.photos &&
        actions.photos.open &&
        !actions.photos.loading &&
        actions.photos.urls.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
            {actions.photos.urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={`Cleaning photo ${i + 1}`}
                style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        )}
    </div>
  );
}
