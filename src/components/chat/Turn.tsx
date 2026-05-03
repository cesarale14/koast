"use client";

import type { ReactNode } from "react";
import styles from "./ChatShell.module.css";

export type TurnRole = "user" | "koast";

export function Turn({
  role,
  meta,
  children,
}: {
  role: TurnRole;
  /** <Meta … /> — turn meta row (avatar + who + time). */
  meta: ReactNode;
  /** Body content: text, ToolCall, ActionProposal, MemoryArtifact, ErrorBlock, RefusalTag. */
  children: ReactNode;
}) {
  return (
    <div className={`${styles.turn} ${styles[role]}`}>
      {meta}
      {children}
    </div>
  );
}
