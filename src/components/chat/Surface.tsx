"use client";

import type { ReactNode, RefObject, UIEventHandler } from "react";
import styles from "./ChatShell.module.css";

export type SurfaceProps = {
  /** Topbar slot (typically `<Topbar … />`). */
  topbar?: ReactNode;
  /** Composer slot (typically `<Composer … />`). */
  composer?: ReactNode;
  /** Optional <RespondingRow /> shown below composer when streaming. */
  responding?: ReactNode;
  /** Turn list / message stream / empty state. */
  children: ReactNode;
  /** Optional ref to the scroll container — used by ChatClient for auto-scroll anchoring (CF§10.8). */
  scrollRef?: RefObject<HTMLDivElement>;
  /** Optional onScroll handler — used by ChatClient to detect user scroll-up. */
  onScroll?: UIEventHandler<HTMLDivElement>;
};

export function Surface({
  topbar,
  composer,
  responding,
  children,
  scrollRef,
  onScroll,
}: SurfaceProps) {
  return (
    <main className={styles.surface}>
      {topbar}
      <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
        <div className={styles.col}>{children}</div>
      </div>
      {(composer || responding) && (
        <div className={styles["composer-wrap"]}>
          {composer}
          {responding}
        </div>
      )}
    </main>
  );
}
