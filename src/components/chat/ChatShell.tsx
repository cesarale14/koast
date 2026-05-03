"use client";

/**
 * ChatShell — root chat-shell layout.
 *
 * Two-column grid (240px rail + 1fr surface) at desktop. The .shell wrapper
 * carries the M5 semantic token layer (--bg, --surface, --fg, --accent,
 * --rule, etc. — see ChatShell.module.css) so all descendants can read the
 * tokens via CSS variable inheritance, while the rest of the app keeps its
 * own globals untouched (D-13a).
 *
 * Theme is opt-in via a wrapper attribute — `data-theme="dark"` on .shell
 * flips the semantic layer to the dark palette. M5 default is light;
 * dark-mode visual QA is M6 polish (carry-forward §10.5).
 *
 * Mobile breakpoint (<640px) is a class flip via `mobile` prop, NOT a media
 * query — keeps the design canvas frames render-predictable per the bundle
 * convention. Drawer interaction is M5 stub (carry-forward §10.3).
 */

import type { ReactNode } from "react";
import styles from "./ChatShell.module.css";

export type ChatShellProps = {
  /** Light (default) or dark theme — flips the .shell semantic layer. */
  theme?: "light" | "dark";
  /** When true, applies .m-mobile (rail collapses behind hamburger). */
  mobile?: boolean;
  children: ReactNode;
};

export function ChatShell({ theme = "light", mobile, children }: ChatShellProps) {
  const cls = mobile ? `${styles.shell} ${styles["m-mobile"]}` : styles.shell;
  return (
    <div className={cls} data-theme={theme === "dark" ? "dark" : undefined}>
      {children}
    </div>
  );
}
