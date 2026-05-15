/**
 * Post-stream classifier — M9 Phase D substrate (A4 + A6-1).
 *
 * Two activation points in loop.ts per D27 Option ε lock:
 *   1. After `stream.finalMessage()` in `runOneRound`: classify
 *      `accumulatedText` for refusal patterns. Match → substitute
 *      RefusalEnvelope, break round (A4 chat-text substrate-catch).
 *   2. Before `finalizeTurn` in `runAgentTurn`: classify cross-round
 *      `finalText` for completion-message duplicates. Match-twice →
 *      A6-1 suppression flag.
 *   3. In `stop_reason === "refusal"` branch: upgrade generic event
 *      to RefusalEnvelope (G8-D3 closure).
 *
 * Pattern source: `src/lib/agent/refusal-patterns.ts`. Same catalog
 * consumed at runtime here AND by Phase F D24 CI shape regex when it
 * ships. No drift between runtime + CI enforcement layers.
 *
 * Voice doctrine bindings: §5 anti-pattern enumeration (refusal
 * patterns); §4 RefusalEnvelope shape; §1.3 (Never mention you are
 * an AI — caught via REFUSAL_PATTERNS as_an_ai entry).
 */

import {
  REFUSAL_PATTERNS,
  COMPLETION_DUPLICATE_PATTERNS,
  findFirstMatch,
  findAllMatches,
  type RefusalPatternKind,
} from "./refusal-patterns";
import type { RefusalEnvelope } from "./refusal-envelope";

// ---- Public API ----

export type ClassifierResult =
  | {
      kind: "refusal";
      envelope: RefusalEnvelope;
      /** Stable pattern id for telemetry/audit. */
      pattern_id: string;
      /** The exact substring that matched — for audit feed trust-inspection. */
      matched_text: string;
    }
  | {
      kind: "completion_duplicate";
      /** Number of times the pattern matched. ≥ 2 means duplicate detected. */
      occurrences: number;
      /** Stable pattern id of the first matching pattern. */
      pattern_id: string;
    };

/**
 * Classify accumulated assistant text against the refusal + completion
 * pattern catalogs.
 *
 * Refusal patterns short-circuit on FIRST match (A4 substrate-catch
 * fires immediately). Completion patterns count occurrences — duplicate
 * detection requires ≥ 2 matches of the SAME pattern (or 2+ matches of
 * any completion pattern in aggregate, indicating the model repeated
 * the milestone-acknowledgment shape).
 *
 * Returns null when no pattern matched (the common case — clean
 * assistant text passes through unchanged).
 */
export function classifyAccumulatedText(text: string): ClassifierResult | null {
  if (!text) return null;

  // Refusal patterns: short-circuit on first match.
  const refusalMatch = findFirstMatch(text, REFUSAL_PATTERNS);
  if (refusalMatch !== null) {
    return {
      kind: "refusal",
      envelope: buildRefusalEnvelope(refusalMatch.entry.kind),
      pattern_id: refusalMatch.entry.id,
      matched_text: refusalMatch.matchedText,
    };
  }

  // Completion-duplicate: count aggregate matches across all completion
  // patterns. ≥ 2 → duplicate.
  const completionMatches = findAllMatches(text, COMPLETION_DUPLICATE_PATTERNS);
  if (completionMatches.length >= 2) {
    return {
      kind: "completion_duplicate",
      occurrences: completionMatches.length,
      pattern_id: completionMatches[0].entry.id,
    };
  }

  return null;
}

/**
 * Upgrade the loop's `stop_reason === "refusal"` branch (G8-D3 closure).
 *
 * v2.0 framing assumed the existing branch already emitted an envelope;
 * audit revealed it emits a generic `{ type: "refusal", reason }` event
 * pre-dating M8 F4. This helper classifies the accumulated text to pick
 * the most-specific envelope kind, defaulting to `hard_refusal` per Q-D5
 * sign-off.
 */
export function upgradeStopReasonRefusal(
  accumulatedText: string,
): RefusalEnvelope {
  // If the accumulated text contains a soft_refusal pattern (apology-
  // prefixed refusals), use soft_refusal — the model is signaling
  // pushback rather than hard close. Otherwise default to hard_refusal
  // per Q-D5: an explicit `stop_reason === "refusal"` indicates the
  // model categorically refused the turn.
  const match = findFirstMatch(accumulatedText, REFUSAL_PATTERNS);
  const kind: RefusalPatternKind = match?.entry.kind ?? "hard_refusal";
  return buildRefusalEnvelope(kind);
}

// ---- Internal: envelope construction ----

/**
 * Build a generic RefusalEnvelope for substrate-catch substitution.
 *
 * Distinct from M8 P4's category-specific envelopes
 * (`LEGAL_CORRESPONDENCE_REFUSAL` etc) — those are domain-locked. Phase
 * D substrate catches generic LLM-refusal voice (model-trained safety
 * patterns), not domain refusals. Envelope copy is direct, owned, and
 * voice-doctrine-compliant per §4.2 + §4.3.
 */
function buildRefusalEnvelope(kind: RefusalPatternKind): RefusalEnvelope {
  if (kind === "soft_refusal") {
    return {
      kind: "soft_refusal",
      reason:
        "I'm pushing back on this one — want to think through what you're after, or override and we keep going?",
      alternative_path:
        "Tell me more about what you're trying to do and I'll find the right shape.",
      override_available: true,
    };
  }
  // hard_refusal
  return {
    kind: "hard_refusal",
    reason:
      "That's not something I'll do from here. Tell me what you're trying to get to and I'll surface the right path.",
    alternative_path:
      "If this is something the substrate genuinely can't reach, I'll name the gap directly.",
    override_available: false,
  };
}
