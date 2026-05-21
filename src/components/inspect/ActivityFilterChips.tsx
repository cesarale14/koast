"use client";

import type { AuditFeedFilter } from "@/lib/audit-feed";

const CHIPS: ReadonlyArray<{ value: AuditFeedFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "memory", label: "Memory" },
  { value: "messages", label: "Messages" },
  { value: "pricing", label: "Pricing" },
  // M10 Phase C STEP 8 (M3): renamed from "SMS" to "Notifications" — chip
  // surfaces both sms_log delivery events + notifications audit-log rows.
  { value: "notifications", label: "Notifications" },
];

export function ActivityFilterChips({
  active,
  onChange,
}: {
  active: AuditFeedFilter;
  onChange: (filter: AuditFeedFilter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter activity by category"
      className="flex flex-wrap items-center gap-2"
    >
      {CHIPS.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(chip.value)}
            className={[
              "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border",
              isActive
                ? "bg-[var(--coastal)] text-white border-[var(--coastal)]"
                : "bg-white text-[var(--tideline)] border-[var(--hairline)] hover:text-[var(--coastal)] hover:border-[var(--tideline)]",
            ].join(" ")}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
