"use client";

import styles from "./ChatShell.module.css";
import { KoastMark } from "./KoastMark";

/** M8 D10 Tier 1 — locked starter copy, revised at F.1.
 *
 *  C3-shipped set ("Tell me about your first property" / "Just one property
 *  for now" / etc.) was directionally wrong: those starters were Koast-voice
 *  prompts, not host-voice utterances — clicking them sent Koast's own
 *  question back to Koast. F.1 revised to four host-voice operational
 *  starters per conventions v1.7 D10 + directional discipline note.
 *
 *  Tier 2 (context-aware LLM-generated starters) remains deferred to M9. */
export const TIER_1_STARTERS: ReadonlyArray<string> = [
  "Walk me through what you can do",
  "I'm coming from another tool — here's what I had set up there",
  "What should I be focused on today?",
  "Catch me up on what changed",
];

export type EmptyStateProps = {
  prompt?: string;
  /** Tier 1 starter list (locked copy). Click populates the Composer
   *  via onStarterSelect; no auto-send per C3 sign-off R-6. */
  starters?: ReadonlyArray<string>;
  onStarterSelect?: (text: string) => void;
};

const DEFAULT_PROMPT = "Ask Koast about a guest, a price, a turnover.";

export function EmptyState({
  prompt = DEFAULT_PROMPT,
  starters,
  onStarterSelect,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <KoastMark size={28} state="idle" />
      <p className={styles["empty-prompt"]}>{prompt}</p>
      {starters && starters.length > 0 && onStarterSelect ? (
        <StarterGrid starters={starters} onSelect={onStarterSelect} />
      ) : null}
    </div>
  );
}

function StarterGrid({
  starters,
  onSelect,
}: {
  starters: ReadonlyArray<string>;
  onSelect: (text: string) => void;
}) {
  return (
    <div
      style={{
        marginTop: 18,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 8,
        width: "100%",
        maxWidth: 520,
      }}
    >
      {starters.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          style={{
            textAlign: "left",
            padding: "10px 14px",
            background: "transparent",
            border: "1px solid var(--hairline)",
            borderRadius: 8,
            color: "var(--deep-sea)",
            fontSize: 13,
            lineHeight: 1.45,
            cursor: "pointer",
            transition:
              "background-color 150ms cubic-bezier(0.4,0,0.2,1), border-color 150ms cubic-bezier(0.4,0,0.2,1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--shore-soft)";
            e.currentTarget.style.borderColor = "var(--coastal)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.borderColor = "var(--hairline)";
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
