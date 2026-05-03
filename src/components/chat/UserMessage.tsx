"use client";

import type { ReactNode } from "react";
import styles from "./ChatShell.module.css";

export function UserMessage({ children }: { children: ReactNode }) {
  return <div className={styles["user-msg"]}>{children}</div>;
}
