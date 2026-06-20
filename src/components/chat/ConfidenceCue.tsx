"use client";

/**
 * ConfidenceCue — the single visual for the confidence/honesty system (design
 * pass Phase 2). Renders nothing when Koast is confident (certainty needs no
 * chrome) and a quiet, NEUTRAL, informative cue when a signal is thin.
 *
 * Tone (operator msg 3749): competence, not apology. Deliberately NOT amber —
 * amber is the warning semantic; a confidence note isn't a warning, it's an
 * operator stating plainly what they know. So: a calm neutral chip + one
 * informative line, no alarm color.
 */

import type { ConfidenceEnvelope } from "@/lib/agent/confidence/envelope";

export function ConfidenceCue({
  envelope,
  compact = false,
  onDark = false,
}: {
  envelope: ConfidenceEnvelope;
  /** compact: chip only, no note line (for dense inline blocks). */
  compact?: boolean;
  /** onDark: the cue sits on a dark surface (the draft bubble) — same neutral,
   *  non-alarm register, just light-on-dark so it reads as competence, not a
   *  warning. Keeps it the ONE cue across light cards and the dark bubble. */
  onDark?: boolean;
}) {
  if (envelope.tier !== "early") return null;
  const chipStyle = onDark
    ? {
        border: "1px solid rgba(247,243,236,0.30)",
        background: "rgba(247,243,236,0.12)",
        color: "rgba(247,243,236,0.92)",
      }
    : {
        border: "1px solid var(--hairline)",
        background: "var(--shore-soft)",
        color: "var(--tideline)",
      };
  const noteColor = onDark ? "rgba(247,243,236,0.78)" : "var(--tideline)";
  return (
    <div
      data-testid="confidence-cue"
      data-confidence-reason={envelope.reason}
      style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 9px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          ...chipStyle,
        }}
      >
        {envelope.label}
      </span>
      {!compact && envelope.note ? (
        <span style={{ color: noteColor, fontSize: 12, lineHeight: 1.45 }}>
          {envelope.note}
        </span>
      ) : null}
    </div>
  );
}
