/**
 * Draft envelope display labels — M10 Phase D STEP 8 (S3).
 *
 * §13.1 accessibility lock: confidence labels MANDATORY (colorblind-safe;
 * color reinforces, label carries meaning). KoastChip variants — success /
 * warning / danger — match the locked palette (lagoon / amber-tide /
 * coral-reef) without extension.
 *
 * Lives in its own JSX-free module so the unit test
 * `__tests__/pending-draft-bubble-confidence-labels.test.ts` can import
 * without invoking ts-jest's missing JSX transform (the codebase has no
 * React Testing Library / jsdom setup; DOM-render behavior is covered by
 * visual operator-attestation per §4.2 amendment).
 *
 * Consumed by `PendingDraftBubble.tsx` for confidence-badge rendering.
 */

/** D22 AgentTextOutput envelope subset surfaced in PendingDraftBubble.
 *  Whole envelope is plumbed end-to-end (S3-a plumb-whole-envelope), but
 *  STEP 8 displays only confidence + judge_results per locked scope (C).
 *  Deferred S3 fields (source_attribution / hedge / output_grounding)
 *  persisted in JSONB but not surfaced this Slice. */
export interface DraftEnvelope {
  confidence?: "confirmed" | "high_inference" | "active_guess";
  judge_results?: Array<{
    judge_id: string;
    verdict: "pass" | "fail";
    reason: string;
    confidence: number;
  }>;
}

export const CONFIDENCE_LABEL: Record<
  NonNullable<DraftEnvelope["confidence"]>,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  confirmed: { label: "Confirmed", variant: "success" },
  high_inference: { label: "High inference", variant: "warning" },
  active_guess: { label: "Active guess", variant: "danger" },
};
