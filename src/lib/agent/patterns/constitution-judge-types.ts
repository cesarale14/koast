/**
 * γ shape primitives for the constitution-prompt judge subsystem.
 * M10 Phase C STEP 5 (§6.10 extraction methodology).
 *
 * Judge INPUT (anti-patterns to check) — DISTINCT from Phase B
 * `judge-types.ts` JudgeResult (judge OUTPUT). Parallel separate-domain
 * module per §6.10 — Phase F regex-catalog vs Phase B judge-output vs
 * Phase C judge-input are three independent shape families on three
 * independent evolution cadences.
 *
 * Runtime consumer (the LLM-judge driver that iterates targets × patterns
 * × Haiku call) is DEFERRED v2.8 per D34 (vi). Phase C ships the
 * substrate so the v2.8 plug-in is one-PR away.
 *
 * Pairs with `src/lib/voice/constitution-anti-patterns.ts` (the catalog +
 * JUDGE_TARGETS registry).
 */

/** Severity tier. v2.8 LLM-judge driver may use this to gate behavior
 *  (e.g., 'high' fails CI; 'low' surfaces in audit but doesn't block). */
export type ConstitutionPatternSeverity = "low" | "medium" | "high";

/**
 * Anti-pattern entry — describes what the v2.8 LLM judge should flag in
 * constitution-prompt OWN PROSE, distinct from pedagogical quotations
 * of banned phrases. The quote-vs-instance distinction is the LLM
 * judge's job (D34 vi); this shape describes the target behavior.
 */
export interface ConstitutionAntiPattern {
  /** Stable identifier; snake_case; unique across the catalog. */
  id: string;
  /** What the v2.8 LLM judge should flag in constitution-prompt own prose. */
  description: string;
  /** Why this is an anti-pattern at the constitution-prompt class. */
  rationale: string;
  /** Optional locus: which prompt section the pattern applies to (e.g., 'identity'). */
  applies_to_section?: string;
  severity: ConstitutionPatternSeverity;
}

/**
 * Parallel registration of constitution-prompt files as v2.8 LLM-judge
 * scan targets. DISTINCT ROLE from `anti-patterns.runner.ts`
 * CONSTITUTION_PROMPTS allow-list (D24 SCAN EXCLUSION). Same files,
 * opposite roles:
 *   - CONSTITUTION_PROMPTS (Phase F)         → exclude from D24 call-site scan
 *   - CONSTITUTION_PROMPT_JUDGE_TARGETS (J3) → include in v2.8 LLM-judge scan
 *
 * The cross-reference is intentional: D24 exclusions are exactly the files
 * the v2.8 LLM judge needs to scan (the only files whose own prose can
 * legitimately quote banned phrases).
 */
export interface ConstitutionPromptJudgeTarget {
  /** Repo-relative path to the constitution-prompt file. */
  file_path: string;
  /** Cross-reference note to the D24-exclusion allow-list entry + role. */
  note?: string;
}
