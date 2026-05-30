"use client";

import { Trash2 } from "lucide-react";
import styles from "./ChatShell.module.css";
import type { ConversationGroup } from "./Rail";

export function RailList({
  groups,
  activeId,
  onSelect,
  onDelete,
}: {
  groups: ConversationGroup[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className={styles["rail-list"]} data-testid="conversation-list">
      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles["rail-section-label"]}>{group.label}</div>
          {group.items.map((item) => {
            const isActive = item.id === activeId;
            const cls = isActive
              ? `${styles.conv} ${styles.active}`
              : styles.conv;
            // Row container wraps the select button + the (sibling) delete
            // button — a button can't nest inside a button. M13 D1.
            return (
              <div
                key={item.id}
                className={styles["conv-row"]}
                data-testid="conversation-row"
                data-conversation-id={item.id}
              >
                <button
                  type="button"
                  data-testid="conversation-item"
                  data-conversation-id={item.id}
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
                {onDelete ? (
                  <button
                    type="button"
                    data-testid="conversation-delete"
                    aria-label="Delete conversation"
                    className={styles["conv-delete"]}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                  >
                    <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
