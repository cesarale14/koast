"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Activity", href: "/koast/inspect/activity" },
  { label: "Memory", href: "/koast/inspect/memory" },
] as const;

export function InspectTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--shore-soft)] p-1"
      aria-label="Inspect tabs"
    >
      {TABS.map((tab) => {
        const isActive = pathname?.startsWith(tab.href) ?? false;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "px-4 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors",
              isActive
                ? "bg-white text-[var(--coastal)] shadow-[0_1px_2px_rgba(19,46,32,0.06)]"
                : "text-[var(--tideline)] hover:text-[var(--coastal)]",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
