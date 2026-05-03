"use client";

/**
 * ActionProposal — quiet proposal block, NOT a card.
 *
 * Markup mirrors state 08 (handoff/states/08-action-proposal.html):
 *   <div class="proposal">
 *     <div class="proposal-head">…</div>
 *     <div class="proposal-why"><span class="label">why</span>…</div>
 *     <div class="proposal-actions">
 *       <button class="btn btn-primary">Approve <arrow/></button>
 *       <button class="btn btn-secondary">…</button>
 *       <button class="btn btn-ghost">…</button>
 *     </div>
 *   </div>
 *
 * Visual chrome is a left tide-color stripe via .proposal in
 * ChatShell.module.css — no shadow, no fill. Spec §components.md.
 *
 * D-PREVIEW-ROUTES — until M6/M7 wires `action_proposed` into the
 * substrate, this only renders via the documented preview routes.
 * The reducer has no branch for the event today (D-FORWARD-EVENTS).
 */

import type { ReactNode } from "react";
import styles from "./ChatShell.module.css";

export type ActionKind = "primary" | "secondary" | "ghost";

export type ProposalAction = {
  /** Stable id used as React key + click identification by parent. */
  id: string;
  label: ReactNode;
  kind: ActionKind;
  /** Optional icon node — rendered AFTER the label per the design (e.g. arrow on primary). */
  icon?: ReactNode;
  onClick?: () => void;
};

export type ActionProposalProps = {
  /** Plain-language headline, e.g. "Push price to $199 on Airbnb · expires Tue 12:00 pm". */
  head: ReactNode;
  /** 1-3 sentence rationale rendered with the "why" eyebrow. Capped to 56ch via CSS. */
  why: ReactNode;
  actions: ProposalAction[];
};

const BTN_BY_KIND: Record<ActionKind, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

export function ActionProposal({ head, why, actions }: ActionProposalProps) {
  return (
    <div className={styles.proposal}>
      <div className={styles["proposal-head"]}>{head}</div>
      <div className={styles["proposal-why"]}>
        <span className={styles.label}>why</span>
        {why}
      </div>
      <div className={styles["proposal-actions"]}>
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`${styles.btn} ${styles[BTN_BY_KIND[a.kind]]}`}
            onClick={a.onClick}
          >
            {a.label}
            {a.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
