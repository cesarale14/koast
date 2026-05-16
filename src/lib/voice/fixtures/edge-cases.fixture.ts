/**
 * Edge-cases fixture — M9 Phase F D24.
 *
 * Documents v1 catalog behavior on cases that sit at the boundary between
 * shape-regex catch and contextual judgment. Each case has `expectedMatches`
 * declaring exactly which catalog IDs should fire — the meta-test asserts
 * the catalog catches exactly those IDs against the case text, no more
 * and no fewer.
 *
 * Purpose:
 *   - case_apology_permitted: doctrine §5.2 permits apology language for
 *     substantive errors. v1 catalog matches apology-shape regardless of
 *     context, so this case asserts ZERO matches when the example uses
 *     unambiguously-real-error apology shape (no "I apologize, I don't
 *     have access" etc. — instead the real-error pattern is "I sent that
 *     to Sarah when you'd told me to hold").
 *   - case_hedge_single_probably: §3.2.2 permits single hedge qualifiers
 *     attached to genuinely-inferred claims. ZERO matches expected.
 *   - case_stacked_hedge: §5.3 explicit stacked-qualifier ban. Matches
 *     hedge_stacked_qualifiers exactly.
 *   - case_quoted_violation: doctrine self-quotation. v1 catalog matches
 *     inside quotes — this is documented behavior, not a bug. Resolution
 *     deferred to M10 LLM judge (§6.9 inheritance).
 *   - case_corporate_in_doctrine: §5.4 doctrine block paste. v1 catalog
 *     matches every banned phrase even though the runner allow-list
 *     excludes voice-doctrine.md from scan — proves the catalog itself
 *     is complete; the doctrine-exclusion is a runner-layer choice.
 *
 * Acknowledged false-positives go on the §6.9 M10 refinement queue.
 */

export type EdgeCase = {
  text: string;
  expectedMatches: string[];
  rationale: string;
};

export const EDGE_CASES: Record<string, EdgeCase> = {
  case_apology_permitted: {
    text: `I sent the rate push to Villa Jamaica when you'd told me last week
to hold pushes for that property until you approved. I shouldn't have. The
push has already landed at Channex — want me to roll it back, or are you
fine with what went through?`,
    expectedMatches: [],
    rationale:
      "§5.2 permitted apology — specific real error + recovery surface. Catalog must not flag.",
  },

  case_hedge_single_probably: {
    text: `The Channex revision probably arrived after the BDC reauth window
closed. The dedup table shows two entries with the same revision_id, which
would explain the duplicate event.`,
    expectedMatches: [],
    rationale:
      "§3.2.2 permits single hedge qualifier ('probably') attached to inferred claim. Catalog must not flag.",
  },

  case_stacked_hedge: {
    text: `The push probably might have failed silently during the reconnect.`,
    expectedMatches: ["hedge_stacked_qualifiers"],
    rationale:
      "§5.3 stacked-qualifier ban — two hedge words within window. Catalog must flag exactly the stacked-hedge entry.",
  },

  case_quoted_violation: {
    text: `Doctrine §5.1 lists 'great question' as a banned phrase shape.`,
    expectedMatches: ["sycophancy_great_question"],
    rationale:
      "v1 catalog matches inside quotes (no quote-stripping). Documents known behavior; M10 LLM judge will distinguish quote-from-instance.",
  },

  case_corporate_in_doctrine: {
    text: `Doctrine §5.4 banned phrases:
- "Reach out to our team"
- "We've optimized your portfolio"
- "Let's discuss next steps"
- "I'd love to hop on a call"
- "Circle back"
- "Touch base"
- "Aligning on objectives"
- "Leveraging your data"
- "Driving outcomes"
- "Synergies"
- "Best practices"
- "Our solution"
- "Industry-leading"
- "Cutting-edge"
- "World-class"
- "Empowering hosts"
- "Streamlining operations"

Doctrine §5.4 banned constructions:
- "We at Koast believe..."
- "Our goal is to..."
- "We strive to..."
- "It is our pleasure to..."`,
    expectedMatches: [
      "corporate_reach_out_team",
      "corporate_optimized_portfolio",
      "corporate_discuss_next_steps",
      "corporate_hop_on_call",
      "corporate_circle_back",
      "corporate_touch_base",
      "corporate_aligning_objectives",
      "corporate_leveraging_data",
      "corporate_driving_outcomes",
      "corporate_synergies",
      "corporate_best_practices",
      "corporate_our_solution",
      "corporate_industry_leading",
      "corporate_cutting_edge",
      "corporate_world_class",
      "corporate_empowering_hosts",
      "corporate_streamlining_operations",
      "corporate_we_at_koast_believe",
      "corporate_our_goal_is_to",
      "corporate_we_strive_to",
      "corporate_it_is_our_pleasure_to",
    ],
    rationale:
      "Doctrine self-quotation. Catalog completeness check — all 21 §5.4 patterns match the doctrine paste. Runner excludes voice-doctrine.md path so this never fires in real CI; the case exists to prove catalog coverage, not to be a runtime gate.",
  },
};
