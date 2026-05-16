/**
 * Shape primitives for pattern-catalog modules — M9 Phase F (γ extraction).
 *
 * Behavior-preserving lift from src/lib/agent/refusal-patterns.ts. No
 * runtime change at the extraction step; consumers in refusal-patterns.ts
 * now import these definitions instead of declaring them inline.
 *
 * Why this lives at `src/lib/agent/patterns/`:
 *   - The primitive is agent-substrate concern (both refusal-patterns and
 *     voice anti-patterns flow through the agent envelope substrate).
 *   - The enumerations themselves live with their domain (refusal patterns
 *     under agent/, voice anti-patterns under voice/). One shape, two
 *     catalogs, evolving on independent cadences.
 *
 * Conventions v2.6 §6.10 codifies this γ extraction pattern as M10
 * inheritance methodology for the LLM judge catalog.
 */

/**
 * Catalog entry. Generic over kind so each catalog can narrow to its own
 * discriminator (RefusalPatternKind, CompletionPatternKind, the M9 Phase F
 * "voice-anti-pattern", future M10 judge kinds).
 */
export type PatternEntry<TKind extends string> = {
  /** Stable identifier — used in audit events + telemetry. */
  id: string;
  /** Regex pattern (source string); flags applied uniformly at match time. */
  pattern: string;
  /** Classification target — discriminates downstream handling. */
  kind: TKind;
  /** Human-readable purpose. Comment-grade; surfaces in audit events. */
  description: string;
};

/** Result row from a catalog scan. */
export interface PatternMatch<TKind extends string> {
  entry: PatternEntry<TKind>;
  matchedText: string;
  index: number;
}

/**
 * Run a pattern list against a text and return all matches.
 *
 * Pattern flags: case-insensitive + multiline + global by default.
 * Patterns that need case sensitivity declare anchors in their pattern body.
 */
export function findAllMatches<TKind extends string>(
  text: string,
  patterns: ReadonlyArray<PatternEntry<TKind>>,
): PatternMatch<TKind>[] {
  const matches: PatternMatch<TKind>[] = [];
  for (const entry of patterns) {
    const regex = new RegExp(entry.pattern, "gim");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      matches.push({ entry, matchedText: m[0], index: m.index });
      // Guard against zero-length matches looping forever.
      if (m.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

/**
 * Return the FIRST match across a pattern list, or null. Convenience for
 * callers that only need to know "did something match?" not "what are all
 * the matches?". Faster than findAllMatches for short-circuit paths.
 */
export function findFirstMatch<TKind extends string>(
  text: string,
  patterns: ReadonlyArray<PatternEntry<TKind>>,
): PatternMatch<TKind> | null {
  for (const entry of patterns) {
    const regex = new RegExp(entry.pattern, "im");
    const m = regex.exec(text);
    if (m) return { entry, matchedText: m[0], index: m.index };
  }
  return null;
}
