/**
 * Constitution-prompt anti-pattern catalog (J3, M10 Phase C).
 *
 * SUBSTRATE ONLY — no scan, no LLM at this phase. The v2.8 LLM judge
 * consumes CONSTITUTION_PROMPT_JUDGE_TARGETS × CONSTITUTION_PROMPT_ANTI_PATTERNS
 * via Haiku quote-vs-instance judgment (D34 vi). These patterns describe
 * anti-patterns in constitution-prompt OWN PROSE, distinct from pedagogical
 * quotations of banned phrases (which the LLM judge will distinguish).
 *
 * §7.9 13a doctrine (v2.7): "new constitution-prompt anti-patterns enter
 * CONSTITUTION_PROMPTS-specific catalog (not PROMPT_BEARING_FILES catalog)";
 * "constitution prompts deferred to LLM judge for quote-vs-instance distinction".
 *
 * Catalog completeness meta-test enforces same-PR fixture additions for new
 * entries (per §6.10 SHIP/DEFER prefix convention).
 */

import type {
  ConstitutionAntiPattern,
  ConstitutionPromptJudgeTarget,
} from "@/lib/agent/patterns/constitution-judge-types";

export const CONSTITUTION_PROMPT_ANTI_PATTERNS: ReadonlyArray<ConstitutionAntiPattern> =
  [
    {
      id: "constitution_chipper_register_in_prose",
      description:
        "Constitution-prompt instruction text exhibits chipper / lifestyle-brand register in its own framing — e.g., 'hope this helps!', 'you've got this!', 'sending good vibes' — outside of explicit negative-example quotation.",
      rationale:
        "Constitution prompts model the voice they teach. Chipper register in instruction prose contradicts §5.5 doctrine; teaching against a register while exhibiting it undermines the doctrine. Quote-vs-instance: the v2.8 LLM judge distinguishes 'Don't write \"hope this helps!\"' (pedagogical quote, allowed) from 'Hope this guide helps you understand!' (instruction prose, violation).",
      applies_to_section: "any",
      severity: "medium",
    },
    {
      id: "constitution_corporate_jargon_in_prose",
      description:
        "Constitution-prompt instruction text uses corporate jargon ('synergies', 'best practices', 'leveraging', 'circle back', 'driving outcomes') in its own framing outside quoted exemplars.",
      rationale:
        "§5.4 bans these in generated output; the constitution prompt itself should model the same restraint when writing its own instructions. v2.8 LLM judge separates 'Avoid \"leveraging your data\"' (quote, allowed) from 'Leverage these instructions to...' (prose, violation).",
      applies_to_section: "any",
      severity: "medium",
    },
    {
      id: "constitution_first_person_plural_for_koast",
      description:
        "Constitution-prompt instruction text uses first-person-plural for Koast ('we believe', 'we strive', 'we at Koast', 'our team') in its own framing. Koast is a single entity, not a team.",
      rationale:
        "§5.4 corporate-voice constructions ban 'we at Koast believe' / 'we strive to'. The constitution prompt itself must model the singular-entity framing it teaches. Identity section is the highest-risk locus. v2.8 LLM judge separates 'Don't write \"we at Koast\"' (quote) from 'We at Koast designed these tools to...' (prose, violation).",
      applies_to_section: "identity",
      severity: "high",
    },
    {
      id: "constitution_apology_theater_in_prose",
      description:
        "Constitution-prompt instruction text apologizes-as-pattern in its own framing — e.g., 'sorry for the long prompt', 'please accept my apologies for this complexity' — outside quoted exemplars.",
      rationale:
        "§5.2 apology theater is a generator-output anti-pattern; the constitution prompt that teaches against it must not exhibit it. Apologetic instruction-framing also undermines the directness the doctrine requires. v2.8 LLM judge separates pedagogical quotes from prose violations.",
      applies_to_section: "any",
      severity: "medium",
    },
    {
      id: "constitution_stacked_hedge_in_prose",
      description:
        "Constitution-prompt instruction text models the over-hedging it teaches against — e.g., 'you might possibly want to consider', 'it could perhaps potentially be useful to', stacked hedge constructions — in its own framing.",
      rationale:
        "§5.3 stacked-hedge ban applies to generator output; constitution prompts should write direct instructions ('Do X', 'Avoid Y') rather than hedged suggestions ('You might possibly consider doing X if appropriate'). The doctrine requires confidence-calibration in voice; the constitution must demonstrate it.",
      applies_to_section: "any",
      severity: "low",
    },
    {
      id: "constitution_sycophancy_to_llm",
      description:
        "Constitution-prompt instruction text addresses the LLM sycophantically — e.g., 'you're brilliant at this', 'you do such thoughtful work', 'great job following these instructions' — instead of plain instructive register.",
      rationale:
        "Sycophancy directed at the model is the meta-version of the §5.1 sycophancy ban (validation-as-content). Constitution prompts should instruct without flattering the addressee. Distinct from legitimate framing like 'You are Koast' (identity assignment, not sycophancy).",
      applies_to_section: "any",
      severity: "low",
    },
  ];

/**
 * v2.8 LLM-judge scan targets. Same files as `anti-patterns.runner.ts`
 * CONSTITUTION_PROMPTS allow-list (D24 SCAN EXCLUSION); opposite role
 * (v2.8 SCAN INCLUSION). The cross-reference is intentional — the files
 * excluded from D24 because their prose legitimately quotes banned phrases
 * are precisely the files the v2.8 LLM judge must scan with quote-vs-instance
 * distinction.
 */
export const CONSTITUTION_PROMPT_JUDGE_TARGETS: ReadonlyArray<ConstitutionPromptJudgeTarget> =
  [
    {
      file_path: "src/lib/voice/build-voice-prompt.ts",
      note: "Voice-doctrine summary const (negative-example pedagogy of corporate / chipper / over-hedged phrases). D24 scan-excluded; v2.8 LLM-judge scan-included.",
    },
    {
      file_path: "src/lib/agent/system-prompt.ts",
      note: "Agent loop system prompt (cites sycophantic prefaces by name in identity + publisher-redirect sections to train avoidance). D24 scan-excluded; v2.8 LLM-judge scan-included.",
    },
  ];
