"use client";

/**
 * Session 5b.3 — confirmation modal for multi-date rate saves.
 * Two modes:
 *   - "platform" : user edited Airbnb or Booking.com card
 *   - "base"     : user edited the Base rate card (DB-only, no OTA push)
 *
 * Renders a per-date diff table, a mode-specific summary footer, and
 * Cancel / commit buttons. Delegates the actual commit to the caller
 * via onCommit; the modal interprets the returned per-date status
 * array to render inline success/failure markers without re-fetching.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X as XIcon } from "lucide-react";

export interface DateDiff {
  date: string;          // YYYY-MM-DD
  oldRate: number | null;
  newRate: number;
  hasBooking: boolean;
  /** Populated after commit if partial failure. */
  status?: "ok" | "failed";
  error?: string;
}

export type BulkModalMode =
  | { kind: "platform"; platform: "Airbnb" | "Booking.com" }
  | { kind: "base"; overridesAffected: number };

interface Props {
  mode: BulkModalMode;
  diffs: DateDiff[];
  onCancel: () => void;
  /**
   * Caller executes the server push and resolves with per-date status.
   * Returns null on total success (everything ok) and an object with a
   * diffs[] copy carrying status/error fields on partial failure. If
   * the promise rejects, the modal treats it as a total failure.
   */
  onCommit: () => Promise<{ diffs: DateDiff[] } | null>;
  onDone: (message: string) => void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

function fmtRange(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  const firstD = new Date(first + "T00:00:00");
  const lastD = new Date(last + "T00:00:00");
  const expected = (lastD.getTime() - firstD.getTime()) / 86_400_000;
  const contiguous = expected === sortedDates.length - 1;
  if (!contiguous) return `${sortedDates.length} dates selected`;
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  const firstFmt = firstD.toLocaleDateString("en-US", opts);
  const lastFmt = lastD.toLocaleDateString("en-US", opts);
  return `${firstFmt} – ${lastFmt} · ${sortedDates.length} dates`;
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded.toLocaleString("en-US")}`;
  return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BulkRateConfirmModal({ mode, diffs, onCancel, onCommit, onDone }: Props) {
  const [phase, setPhase] = useState<"confirm" | "committing" | "partial">("confirm");
  const [committed, setCommitted] = useState<DateDiff[] | null>(null);

  const sorted = useMemo(
    () => [...diffs].sort((a, b) => a.date.localeCompare(b.date)),
    [diffs]
  );

  const changingCount = useMemo(
    () => sorted.filter((d) => (d.oldRate == null ? 0 : d.oldRate) !== d.newRate).length,
    [sorted]
  );
  const unchangedCount = sorted.length - changingCount;
  const bookingCount = useMemo(() => sorted.filter((d) => d.hasBooking).length, [sorted]);

  const isPlatform = mode.kind === "platform";
  const platformName = isPlatform ? mode.platform : null;

  const title = isPlatform
    ? `Push ${changingCount} change${changingCount === 1 ? "" : "s"} to ${platformName}?`
    : `Update base rate for ${sorted.length} date${sorted.length === 1 ? "" : "s"}?`;
  const commitLabel = isPlatform ? "Push to channels" : "Save base rate";

  const rowsToRender = committed ?? sorted;

  async function handleCommit() {
    setPhase("committing");
    try {
      const result = await onCommit();
      if (!result) {
        // Total success — caller will close + toast via onDone
        const msg = isPlatform
          ? `${changingCount} ${platformName} rate${changingCount === 1 ? "" : "s"} pushed`
          : `${sorted.length} base rate${sorted.length === 1 ? "" : "s"} updated`;
        onDone(msg);
        return;
      }
      // Partial failure — render per-row status, keep modal open
      setCommitted(result.diffs);
      setPhase("partial");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Push failed";
      onDone(msg);
    }
  }

  // Portal mount target. SSR-safe: on server, createPortal needs a
  // DOM element that doesn't exist yet, so we short-circuit to null.
  // The modal is client-only anyway — triggered by user interaction.
  const [mountTarget, setMountTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMountTarget(document.body);
  }, []);

  // Escape = Cancel (matches backdrop-click). Disabled during commit
  // so a stray key doesn't interrupt the push mid-flight.
  useEffect(() => {
    if (phase === "committing") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onCancel]);

  if (!mountTarget) return null;

  const ui = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-rate-modal-title"
      style={overlayStyle}
      onClick={phase === "committing" ? undefined : onCancel}
    >
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div id="bulk-rate-modal-title" style={titleStyle}>{title}</div>
          <div style={subtitleStyle}>{fmtRange(sorted.map((d) => d.date))}</div>
        </header>

        <div style={tableWrapStyle}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thRightStyle}>Current</th>
                <th style={thCenterStyle} />
                <th style={thRightStyle}>New</th>
                {phase === "partial" && <th style={thCenterStyle}>Status</th>}
              </tr>
            </thead>
            <tbody>
              {rowsToRender.map((d) => {
                const oldV = d.oldRate;
                const newV = d.newRate;
                const unchanged = oldV != null && oldV === newV;
                const rowStyle: React.CSSProperties = unchanged
                  ? { opacity: 0.55 }
                  : {};
                return (
                  <tr key={d.date} style={rowStyle}>
                    <td style={tdStyle}>
                      <span>{fmtDate(d.date)}</span>
                      {d.hasBooking && (
                        <span
                          title="A booking exists on this night. Rate push applies to future reservations only."
                          style={bookingBadgeStyle}
                          aria-label="Has booking"
                        >
                          booked
                        </span>
                      )}
                    </td>
                    <td style={tdRightStyle}>{fmtMoney(oldV)}</td>
                    <td style={tdCenterStyle} aria-hidden>
                      {unchanged ? <span style={{ color: "var(--tideline)" }}>·</span> : "→"}
                    </td>
                    <td style={tdRightStyle}>
                      {unchanged ? (
                        <span style={{ color: "var(--tideline)" }}>unchanged</span>
                      ) : (
                        <strong>{fmtMoney(newV)}</strong>
                      )}
                    </td>
                    {phase === "partial" && (
                      <td style={tdCenterStyle}>
                        {d.status === "ok" ? (
                          <Check size={14} color="var(--lagoon)" aria-label="Pushed" />
                        ) : d.status === "failed" ? (
                          <span title={d.error ?? "Failed"} aria-label={`Failed: ${d.error ?? "unknown"}`}>
                            <XIcon size={14} color="var(--coral-reef)" />
                          </span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer style={footerStyle}>
          <div style={summaryStyle}>
            <div>
              <strong>{changingCount}</strong> will change
              {unchangedCount > 0 && <>, <span style={{ color: "var(--tideline)" }}>{unchangedCount} unchanged</span></>}
            </div>
            {isPlatform && bookingCount > 0 && (
              <div style={{ color: "var(--tideline)", marginTop: 4 }}>
                {bookingCount} date{bookingCount === 1 ? " has" : "s have"} existing bookings. Rate changes apply to future reservations — existing bookings keep their original rate.
              </div>
            )}
            {isPlatform && (
              <div style={{ color: "var(--tideline)", marginTop: 4 }}>
                Changes push to {platformName} via Channex. Reflects within 5–15 minutes.
              </div>
            )}
            {!isPlatform && (
              <>
                <div style={{ color: "var(--tideline)", marginTop: 4 }}>
                  Base rate updates apply to Koast&apos;s pricing engine only. Your Airbnb and Booking.com rates are not changed.
                </div>
                {mode.kind === "base" && mode.overridesAffected > 0 && (
                  <div style={{ color: "var(--tideline)", marginTop: 4 }}>
                    {mode.overridesAffected} of {sorted.length} dates have per-platform overrides — those overrides stay unchanged and continue to apply.
                  </div>
                )}
              </>
            )}
          </div>
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={onCancel}
              disabled={phase === "committing"}
              style={{ ...btnStyle, background: "transparent", border: "1px solid var(--dry-sand)", color: "var(--tideline)" }}
            >
              {phase === "partial" ? "Close" : "Cancel"}
            </button>
            {phase !== "partial" && (
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={phase === "committing" || changingCount === 0}
                style={{
                  ...btnStyle,
                  background: "var(--coastal)",
                  color: "var(--shore)",
                  opacity: phase === "committing" || changingCount === 0 ? 0.7 : 1,
                }}
              >
                {phase === "committing" ? "Pushing…" : commitLabel}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(ui, mountTarget);
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(19, 46, 32, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  width: "min(600px, 100%)",
  maxHeight: "90vh",
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 24px 48px rgba(19,46,32,0.18)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "22px 24px 14px",
  borderBottom: "1px solid var(--dry-sand)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 600,
  color: "var(--coastal)",
  letterSpacing: "-0.015em",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "var(--tideline)",
};

const tableWrapStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "4px 8px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--tideline)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--dry-sand)",
};
const thRightStyle: React.CSSProperties = { ...thStyle, textAlign: "right" };
const thCenterStyle: React.CSSProperties = { ...thStyle, textAlign: "center" };

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "var(--coastal)",
  borderBottom: "1px solid rgba(237,231,219,0.6)",
};
const tdRightStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdCenterStyle: React.CSSProperties = { ...tdStyle, textAlign: "center" };

const footerStyle: React.CSSProperties = {
  padding: "16px 24px 18px",
  borderTop: "1px solid var(--dry-sand)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  background: "#FAFAF7",
};

const summaryStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--coastal)",
  lineHeight: 1.5,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const btnStyle: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 8,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const bookingBadgeStyle: React.CSSProperties = {
  marginLeft: 8,
  padding: "1px 6px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  color: "var(--tideline)",
  background: "var(--shell)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  verticalAlign: "middle",
};
