"use client";

/**
 * RailNav — global tab navigation folded into the conversation drawer
 * (mobile only; nav-blocker fix, operator msg 3725 / 3727).
 *
 * On the chat-primary surface the persistent global nav is the collapsed
 * 60px icon rail (desktop, `hidden md:flex`). On mobile that rail is gone,
 * so rather than add a SECOND trigger the tabs are folded into the
 * existing chat hamburger drawer (the conversation Rail). This component
 * renders that tab list. It is `display:none` on desktop (the icon rail
 * handles nav there) and visible only inside the <768px drawer — see the
 * `.rail-nav` rules in ChatShell.module.css.
 *
 * Same nav source as the sidebar (`navGroups`) + the same per-host tab
 * visibility filter, so the drawer never surfaces a tab the sidebar hides.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./ChatShell.module.css";
import { navGroups, isNavItemActive } from "@/lib/nav/nav-config";
import { useTabVisibility } from "@/hooks/useTabVisibility";
import { filterNavGroupsByVisibility } from "@/lib/tab-visibility";

export function RailNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { visibility } = useTabVisibility();
  const groups = filterNavGroupsByVisibility(navGroups, visibility);

  return (
    <nav className={styles["rail-nav"]} aria-label="Sections">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.label ? (
            <div className={styles["rail-nav-label"]}>{group.label}</div>
          ) : null}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`${styles["rail-nav-item"]}${active ? ` ${styles["is-active"]}` : ""}`}
              >
                <Icon size={16} strokeWidth={1.6} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
