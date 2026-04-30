"use client";

/**
 * Availability tab for the Calendar sidebar.
 *
 * Tri-toggle Available/Booked/Blocked (Booked is disabled — it
 * reflects a live reservation and can't be toggled from the UI).
 * Booking window stepper + notes textarea. Writes to calendar_rates
 * via a direct Supabase client mutation on the base row — the
 * Channex restrictions push uses stop_sell for Blocked states;
 * Booking window isn't pushed this session (placeholder storage).
 */

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

interface Props {
  isBooked: boolean;
  isBlocked: boolean;
  bookingWindowDays: number;
  notes: string;
  onChangeStatus: (status: "available" | "blocked") => Promise<void>;
  onChangeBookingWindow: (days: number) => Promise<void>;
  onChangeNotes: (notes: string) => Promise<void>;
}

type Status = "available" | "booked" | "blocked";

export default function AvailabilityTab({
  isBooked,
  isBlocked,
  bookingWindowDays,
  notes,
  onChangeStatus,
  onChangeBookingWindow,
  onChangeNotes,
}: Props) {
  const initial: Status = isBooked ? "booked" : isBlocked ? "blocked" : "available";
  const [current, setCurrent] = useState<Status>(initial);
  const [draftNotes, setDraftNotes] = useState(notes);
  const [window, setWindow] = useState(bookingWindowDays);

  const setStatus = async (next: Status) => {
    if (next === "booked") return; // disabled
    setCurrent(next);
    await onChangeStatus(next);
  };

  const setWindowVal = async (next: number) => {
    const clamped = Math.max(0, Math.min(720, next));
    setWindow(clamped);
    await onChangeBookingWindow(clamped);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <section>
        <div style={eyebrowStyle}>Status</div>
        <div style={{ marginTop: 8, display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--shore-soft)" }}>
          {(["available", "booked", "blocked"] as const).map((s) => {
            const active = current === s;
            const disabled = s === "booked" && !isBooked;
            return (
              <button
                key={s}
                type="button"
                onClick={() => void setStatus(s)}
                disabled={disabled}
                aria-pressed={active}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  background: active ? "#fff" : "transparent",
                  color: active ? "var(--coastal)" : disabled ? "rgba(61,107,82,0.4)" : "var(--tideline)",
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  boxShadow: active ? "0 1px 3px rgba(19,46,32,0.08)" : "none",
                  transition: "background-color 160ms ease, color 160ms ease, box-shadow 160ms ease",
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
        {isBooked && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--tideline)" }}>
            This night has a confirmed reservation. Cancel the booking first to change status.
          </div>
        )}
      </section>

      <section>
        <div style={eyebrowStyle}>Booking window</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            style={stepBtn}
            onClick={() => void setWindowVal(window - 1)}
            aria-label="Decrease booking window"
          >
            <Minus size={14} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--coastal)", minWidth: 50, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {window}
          </span>
          <button
            type="button"
            style={stepBtn}
            onClick={() => void setWindowVal(window + 1)}
            aria-label="Increase booking window"
          >
            <Plus size={14} />
          </button>
          <span style={{ fontSize: 12, color: "var(--tideline)" }}>
            day{window === 1 ? "" : "s"} in advance
          </span>
        </div>
      </section>

      <section>
        <div style={eyebrowStyle}>Notes</div>
        <textarea
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          onBlur={() => void onChangeNotes(draftNotes)}
          placeholder="Private notes for this date (not visible to guests)"
          style={{
            marginTop: 8,
            width: "100%",
            minHeight: 80,
            padding: 10,
            borderRadius: 8,
            border: "1px solid var(--dry-sand)",
            background: "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            color: "var(--coastal)",
            resize: "vertical",
            outline: "none",
          }}
        />
      </section>
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--tideline)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const stepBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "1px solid var(--dry-sand)",
  background: "#fff",
  color: "var(--coastal)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
