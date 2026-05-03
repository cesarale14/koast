"use client";

import styles from "./ChatShell.module.css";
import { KoastMark } from "./KoastMark";

export type RespondingRowProps = {
  onStop: () => void;
};

export function RespondingRow({ onStop }: RespondingRowProps) {
  return (
    <div className={styles["responding-row"]} role="status" aria-live="polite">
      <KoastMark size={12} state="active" />
      <span>Koast is responding…</span>
      <button type="button" className={styles["stop-btn"]} onClick={onStop}>
        stop
      </button>
    </div>
  );
}
