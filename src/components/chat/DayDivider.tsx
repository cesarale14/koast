"use client";

import styles from "./ChatShell.module.css";

export function DayDivider({ label }: { label: string }) {
  // Day labels are typically formatted client-side from a Date; suppress
  // hydration warning so server (UTC) vs. client (browser-local) timezone
  // formatting doesn't yell. CF§10.19 — proper fix is M6.
  return (
    <div className={styles.day} suppressHydrationWarning>
      {label}
    </div>
  );
}
