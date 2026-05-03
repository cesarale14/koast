"use client";

/**
 * KoastMark — the banded Koast brand mark.
 *
 * Shipping the basic 5-band SVG from design/m5-handoff/handoff/_mark.svg.html
 * verbatim per conventions §7. Animation is gated by data-state and driven by
 * the global keyframes in src/app/globals.css (k-cascade-pulse for active,
 * k-brightness-pulse for active+small, k-milestone-* for milestone).
 *
 * The 'hero' state is intentionally excluded from the prop union — it is
 * marketing-only per brand spec and runs continuously, which feels restless
 * inside a tool. TypeScript prevents accidental product use.
 *
 * Note on the milestone state: the deposit visual (k-milestone-ghost +
 * k-milestone-stack keyframes) targets .ghost / .stack groups that are NOT
 * in the basic 5-band markup. The data-state="milestone" still flips for
 * one shot (~2s) so consumers can react, but the visual fallback is the
 * idle mark — full deposit visual is M6 polish (carry-forward §10).
 */

import { useId } from "react";

export type KoastMarkState = "idle" | "active" | "milestone";

export type KoastMarkProps = {
  /** Pixel size; default 24. ≥32 enables full cascade, 16-31 enables brightness pulse. */
  size?: number;
  /** Default 'idle'. */
  state?: KoastMarkState;
  /** Optional aria-label override (defaults to "Koast"). */
  label?: string;
  /** Optional className appended to the global "k-mark" wrapper class. */
  className?: string;
};

export function KoastMark({
  size = 24,
  state = "idle",
  label = "Koast",
  className,
}: KoastMarkProps) {
  // Single useId — calling it twice would return distinct IDs and the
  // <defs><clipPath id> and <g clipPath="url(#…)"> would mismatch.
  // Sanitize React 18's `:r0:`-style id for safe use in SVG/url() fragments.
  const reactId = useId();
  const clipId = `k-clip-${reactId.replace(/[^a-zA-Z0-9-_]/g, "")}`;
  const isSmall = size < 32 && state === "active";
  return (
    <span
      className={className ? `k-mark ${className}` : "k-mark"}
      data-state={state}
      data-size={isSmall ? "small" : undefined}
      style={{ width: size, height: size, display: "inline-block" }}
    >
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={label}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="50" cy="50" r="46" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`} className="bands">
          <rect className="b1" x="0" y="4" width="100" height="23" fill="#d4eef0" />
          <rect className="b2" x="0" y="27" width="100" height="20" fill="#a8e0e3" />
          <rect className="b3" x="0" y="47" width="100" height="18" fill="#4cc4cc" />
          <rect className="b4" x="0" y="65" width="100" height="17" fill="#2ba2ad" />
          <rect className="b5" x="0" y="82" width="100" height="14" fill="#0e7a8a" />
        </g>
      </svg>
    </span>
  );
}
