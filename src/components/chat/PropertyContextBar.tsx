"use client";

/**
 * PropertyContextBar — slim header strip on the chat-primary surface
 * showing the active property context (M13 Phase 1.A; Padres-mockup
 * `surface-bar` design language).
 *
 * Renders ONLY when an active property is bound (Phase 1.B contract:
 * `useActiveProperty` hook surfaces property from URL / cookie /
 * single-property hosts). At Phase 1.A the prop is always null and the
 * bar renders nothing — the chat's internal ChatShell.Topbar provides
 * the property dropdown as the chat-primary affordance. Operator
 * msg 3521 follow-on fix: prior fallback rendered "Your properties" as
 * placeholder text, which read as a duplicate property affordance
 * alongside the chat's own PropertyContext dropdown.
 *
 * Pricing-conversation scope (phase 1.A wedge): when 1.B lands, the
 * bar surfaces the "what we're talking about" anchor; the conversation
 * body below is where the agent does the work.
 */

import { Home } from "lucide-react";

export type PropertyContextBarProps = {
  propertyName: string | null;
};

export function PropertyContextBar({ propertyName }: PropertyContextBarProps) {
  if (!propertyName) return null;
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
        {propertyName}
      </span>
    </div>
  );
}
