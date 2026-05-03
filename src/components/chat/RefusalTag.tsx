"use client";

import styles from "./ChatShell.module.css";

export type RefusalTagProps = {
  /** Optional scope tags rendered as a mono eyebrow. Hidden when empty. */
  scope: string[];
};

export function RefusalTag({ scope }: RefusalTagProps) {
  if (scope.length === 0) return null;
  // State 11 markup: <span class="refusal-tag">scope · pricing · auto-approve</span>
  return <span className={styles["refusal-tag"]}>{scope.join(" · ")}</span>;
}
