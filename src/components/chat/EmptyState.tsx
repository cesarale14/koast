"use client";

import styles from "./ChatShell.module.css";
import { KoastMark } from "./KoastMark";

export type EmptyStateProps = {
  prompt?: string;
};

const DEFAULT_PROMPT = "Ask Koast about a guest, a price, a turnover.";

export function EmptyState({ prompt = DEFAULT_PROMPT }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <KoastMark size={28} state="idle" />
      <p className={styles["empty-prompt"]}>{prompt}</p>
    </div>
  );
}
