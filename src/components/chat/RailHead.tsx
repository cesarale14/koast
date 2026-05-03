"use client";

import styles from "./ChatShell.module.css";
import { KoastMark } from "./KoastMark";

export function RailHead({ onNew }: { onNew?: () => void }) {
  return (
    <div className={styles["rail-head"]}>
      <KoastMark size={22} state="idle" />
      <span className={styles.wm}>Koast</span>
      <button
        type="button"
        className={styles["new-btn"]}
        title="New conversation"
        aria-label="New conversation"
        onClick={onNew}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
