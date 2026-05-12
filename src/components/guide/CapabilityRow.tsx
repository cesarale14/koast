/**
 * CapabilityRow — M8 Phase H C13 (D13).
 *
 * Flat-list row for the /koast/guide/capabilities surface. Synthesis-
 * report register (read-deliberately, not glanced-at); hairline bottom
 * separator gives quiet visual structure without competing with the
 * content. No card chrome, no hover state — the row is content, not
 * affordance.
 */

import type { ReactNode } from "react";

export interface CapabilityRowProps {
  name: string;
  /** "always" | "conditional" — drives the visibility-predicate sub-label. */
  visibility: "always" | "conditional";
  /** Human-readable predicate (e.g., "when at least one booking exists").
   *  Required for conditional; ignored for always. */
  predicate?: string;
  /** Synthesis-register prose. Pass markdown-free; bold/italic should be
   *  rendered as JSX from the caller when needed. */
  children: ReactNode;
}

export function CapabilityRow({ name, visibility, predicate, children }: CapabilityRowProps) {
  return (
    <section className="py-6 border-b border-[var(--hairline)] last:border-b-0">
      <header className="mb-2 flex items-baseline gap-3">
        <h3 className="m-0 text-[16px] font-semibold text-[var(--deep-sea)] leading-tight">
          {name}
        </h3>
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--tideline)]">
          {visibility === "always" ? "Always visible" : "Visible when data exists"}
        </span>
      </header>
      <p
        className="m-0 text-[15px] text-[var(--deep-sea)]"
        style={{ lineHeight: 1.55 }}
      >
        {children}
      </p>
      {visibility === "conditional" && predicate ? (
        <p className="mt-1.5 text-[12px] text-[var(--tideline)] italic">
          {predicate}
        </p>
      ) : null}
    </section>
  );
}
