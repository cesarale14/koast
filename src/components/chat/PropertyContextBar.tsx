"use client";

/**
 * PropertyContextBar — slim header strip on the chat-primary surface
 * showing the active property context (M13 Phase 1.A; Padres-mockup
 * design language).
 *
 * Shows: property name (if any) + lightweight context affordance.
 * Pricing-conversation scope (phase 1.A wedge): the bar surfaces the
 * "what we're talking about" anchor; the conversation body below is
 * where the agent does the work.
 *
 * Reads property from `useActiveProperty` (Phase 1.B contract: surfaced
 * from URL / cookie / single-property hosts). At Phase 1.A only, the
 * property is passed in as a prop; the hook is built out at 1.B.
 */

import { Home } from "lucide-react";

export type PropertyContextBarProps = {
  propertyName: string | null;
};

export function PropertyContextBar({ propertyName }: PropertyContextBarProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 md:px-6 h-12 border-b flex-shrink-0"
      style={{
        backgroundColor: "var(--shore)",
        borderColor: "var(--dry-sand)",
      }}
    >
      <Home
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: "var(--tideline)" }}
      />
      <span
        className="text-[13px] font-medium truncate"
        style={{ color: "var(--coastal)" }}
      >
        {propertyName ?? "Your properties"}
      </span>
    </div>
  );
}
