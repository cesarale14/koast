/**
 * Refusal + completion-duplicate pattern catalog — M9 Phase D substrate.
 *
 * Authored data, not code. Consumed at runtime by `post-stream-classifier.ts`
 * (A4 substrate-catch + A6-1 in-turn duplicate detection) and by Phase F
 * D24 CI shape regex (when it ships). Single source of truth across the
 * two enforcement layers; no drift between runtime catch and pre-merge
 * regression catch.
 *
 * Phase D scope (per v2.4 D27 + A6 locks):
 *   - REFUSAL_PATTERNS: generic LLM-refusal phrases that should never
 *     surface in Koast-to-host text. Match → substitute RefusalEnvelope
 *     (Option ε post-stream classifier).
 *   - COMPLETION_DUPLICATE_PATTERNS: completion-message phrase signatures
 *     per system-prompt.ts:248 framing. Match-twice-in-same-text → A6-1
 *     suppression flag.
 *
 * Pattern discipline (locked at v2.4):
 *   - Patterns stay narrow. False positives create voice-doctrine drift
 *     (Koast refuses legitimate work because the model phrasing accidentally
 *     matched). When in doubt, narrow the pattern.
 *   - Off-doctrine refusals (LLM declining capability Koast actually has)
 *     stay out of scope unless real-traffic data shows the failure mode.
 *     v2.0 framing implied broader catch; audit-surfaced narrow scope.
 *
 * Voice doctrine binding (§5 anti-pattern enumeration): refusal patterns
 * mirror the doctrine's banned phrases. Phase F D24 CI catches via regex;
 * Phase D substrate-catch via this catalog. Same source.
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

// ---- Refusal patterns (A4) ----

export type RefusalPatternKind = "hard_refusal" | "soft_refusal";

/**
 * Generic LLM-refusal phrases. Narrow set — only patterns that almost
 * always signal off-doctrine refusal in Koast context. Each entry's
 * kind drives the substitute RefusalEnvelope's kind.
 *
 * "I can't help with that" / "I'm not able to" / "I cannot" patterns
 * are the standard model-trained safety voice that voice doctrine §5
 * explicitly bans. Substrate-catch substitutes a proper envelope.
 */
export const REFUSAL_PATTERNS: ReadonlyArray<PatternEntry<RefusalPatternKind>> = [
  {
    id: "cant_help_with_that",
    pattern: "\\bI\\s+(?:can(?:'|’)t|cannot)\\s+help\\s+with\\s+that\\b",
    kind: "hard_refusal",
    description:
      "Standard model-trained refusal phrase. Voice doctrine §5 anti-pattern; substrate substitutes envelope.",
  },
  {
    id: "not_able_to_assist",
    pattern: "\\bI(?:'|’)?m\\s+not\\s+able\\s+to\\s+(?:help|assist)\\b",
    kind: "hard_refusal",
    description: "Model-safety voice variant of cant_help_with_that.",
  },
  {
    id: "im_sorry_cant",
    pattern: "\\bI(?:'|’)?m\\s+sorry,?\\s+(?:but\\s+)?I\\s+can(?:'|’)t\\b",
    kind: "soft_refusal",
    description:
      "Apology-prefixed refusal. §5 anti-pattern (apology theater); soft_refusal kind because the model is signaling pushback rather than hard close.",
  },
  {
    id: "as_an_ai",
    pattern: "\\b[Aa]s\\s+an\\s+AI\\b",
    kind: "hard_refusal",
    description:
      "Model-trained self-disclosure phrase. Voice doctrine §1.3 explicitly disallows ('Never mention you are an AI' from messaging system prompt). Substrate-catch as hard_refusal — the model has left character; substrate substitutes envelope rather than surfacing the AI-voice text.",
  },
];

// ---- Completion-duplicate patterns (A6-1) ----

export type CompletionPatternKind = "completion_message";

/**
 * Completion-message phrase signatures from system-prompt.ts:248 canonical
 * framing: "I think I have enough to draft check-in messages and watch your
 * rates. Anything else worth telling me, or want me to take something off
 * your plate?"
 *
 * In-turn duplicate detection: if any pattern matches TWICE in the same
 * accumulatedText, A6-1 flags the duplicate for suppression. Cross-turn
 * suppression is handled by the fact-write substrate (M8 Phase F +
 * A6-2 hardening).
 */
export const COMPLETION_DUPLICATE_PATTERNS: ReadonlyArray<PatternEntry<CompletionPatternKind>> = [
  {
    id: "enough_to_draft",
    pattern:
      "\\bI\\s+(?:think\\s+I\\s+)?have\\s+enough\\s+to\\s+(?:start|draft|begin)\\b",
    kind: "completion_message",
    description:
      "Canonical completion phrase per system-prompt.ts:248. Match-twice-in-same-text → A6-1 suppression.",
  },
  {
    id: "take_something_off_your_plate",
    pattern: "\\btake\\s+something\\s+off\\s+your\\s+plate\\b",
    kind: "completion_message",
    description:
      "Trailing offering in canonical completion phrase. Secondary signature for robustness when model paraphrases the opening.",
  },
];

// ---- Match helper ----

export interface PatternMatch<TKind extends string> {
  entry: PatternEntry<TKind>;
  matchedText: string;
  index: number;
}

/**
 * Run a pattern list against a text and return all matches.
 *
 * Pattern flags: case-insensitive + multiline by default. Patterns that
 * need case sensitivity (e.g., "as an AI" where "as an Ai" is also a
 * match) declare anchors in their pattern body.
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
 * Return the FIRST match across a pattern list, or null. Convenience
 * for callers that only need to know "did something match?" not "what
 * are all the matches?". Faster than findAllMatches for short-circuit
 * paths.
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
