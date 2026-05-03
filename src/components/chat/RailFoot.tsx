"use client";

import styles from "./ChatShell.module.css";
import type { RailUser } from "./Rail";

export function RailFoot({ user }: { user: RailUser }) {
  return (
    <div className={styles["rail-foot"]}>
      <div className={styles["av-me"]}>{user.initials}</div>
      <span className={styles.who}>{user.name}</span>
      <span className={styles.org}>{user.org}</span>
    </div>
  );
}
