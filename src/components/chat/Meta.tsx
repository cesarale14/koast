"use client";

import styles from "./ChatShell.module.css";
import { KoastMark, type KoastMarkState } from "./KoastMark";

export type MetaProps = {
  role: "user" | "koast";
  who: string;
  time: string;
  /** Koast role: avatar mark state. Defaults to 'idle'. */
  avatarState?: KoastMarkState;
  /** User role: initials shown in the .av-me circle. */
  initials?: string;
};

/**
 * Source DOM order matters — chat-shell.css `.turn.user .meta` row-reverses
 * for visual layout. Source order:
 *   - koast: av → who → · → stamp
 *   - user:  who → · → stamp → av-me  (visually reversed)
 */
export function Meta({
  role,
  who,
  time,
  avatarState = "idle",
  initials,
}: MetaProps) {
  if (role === "koast") {
    return (
      <div className={styles.meta}>
        <div className={styles.av}>
          <KoastMark size={16} state={avatarState} />
        </div>
        <span className={styles.who}>{who}</span>
        <span>·</span>
        <span className={styles.stamp} suppressHydrationWarning>
          {time}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.meta}>
      <span className={styles.who}>{who}</span>
      <span>·</span>
      <span className={styles.stamp} suppressHydrationWarning>
        {time}
      </span>
      <div className={styles["av-me"]}>{initials ?? "?"}</div>
    </div>
  );
}
