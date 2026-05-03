"use client";

import type { ReactNode } from "react";
import styles from "./ChatShell.module.css";

/**
 * KoastMessage — agent prose body.
 *
 * Renders a sequence of mixed content children: <p> paragraphs (with
 * .reveal/.s1..s5 progressive-reveal classes during streaming), inline
 * <ToolCall> blocks, <ActionProposal>, <MemoryArtifact>, <ErrorBlock>,
 * <RefusalTag>. ToolCall MUST live inline inside KoastMessage in source
 * order — never lifted to a sibling card (M5 anti-pattern, conventions §14).
 *
 * The .stream-tail block is rendered by streaming consumers (the reducer
 * appends it to the latest paragraph during streaming) — this component
 * doesn't own the cursor, just the prose container.
 */
export function KoastMessage({ children }: { children: ReactNode }) {
  return <div className={styles["koast-msg"]}>{children}</div>;
}

/** Helper to render a streaming-style paragraph with the .reveal animation
 *  staggered in five slots (s1..s5). Caller decides which slot each <p> uses. */
export function StreamingParagraph({
  slot,
  children,
}: {
  slot: 1 | 2 | 3 | 4 | 5;
  children: ReactNode;
}) {
  return <p className={`${styles.reveal} ${styles[`s${slot}`]}`}>{children}</p>;
}

/** The streaming caret block — a single subtle dot, NOT a typewriter cursor. */
export function StreamTail() {
  return <span className={styles["stream-tail"]} aria-hidden="true" />;
}
