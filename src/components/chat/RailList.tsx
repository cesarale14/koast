"use client";

import styles from "./ChatShell.module.css";
import type { ConversationGroup } from "./Rail";

export function RailList({
  groups,
  activeId,
  onSelect,
}: {
  groups: ConversationGroup[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className={styles["rail-list"]}>
      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles["rail-section-label"]}>{group.label}</div>
          {group.items.map((item) => {
            const isActive = item.id === activeId;
            const cls = isActive
              ? `${styles.conv} ${styles.active}`
              : styles.conv;
            return (
              <button
                key={item.id}
                type="button"
                className={cls}
                onClick={() => onSelect?.(item.id)}
              >
                <span className={styles["conv-name"]}>{item.name}</span>
                <span className={styles["conv-meta"]}>
                  {item.meta} ·{" "}
                  <span className={styles["conv-time"]} suppressHydrationWarning>
                    {item.timeLabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
