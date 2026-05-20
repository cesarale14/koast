/**
 * J1 output-filter — §6.9 sub-item (i) emoji policy mode-dependent
 * surface control. M10 Phase B STEP 5.
 *
 * Deterministic emoji output-filter applied post-LLM-response at route
 * boundary. NOT an LLM call. Composes the orthogonal axes (audience ×
 * voiceMode) into a first-class policy table per phase-b-ultraplan §2.1
 * + STEP 4 review (per-mode enforcement first-class, not ad-hoc branches).
 *
 * Q1-c divergence (recorded for phase-b.md per ultraplan §14.2):
 *   chat-locked J1-b said "Mode 1=learned"; shipped-state audit revealed
 *   Phase E VoiceFeatures has no emoji-frequency signal; Mode 1 collapsed
 *   to minimal (same as neutral/Mode 2) for Phase B. Learned-allowance
 *   deferred to v2.8 pending VoiceFeatures.emoji_frequency extension.
 *
 * Grapheme-aware counting: \p{Extended_Pictographic} matches individual
 * pictographic codepoints, not visual emoji. A ZWJ sequence (e.g.
 * 👨‍👩‍👧) decomposes to 3 pictographic codepoints; a skin-tone-modified
 * emoji (e.g. 👋🏼) decomposes to 2. Treating each codepoint as a separate
 * emoji breaks the "minimal allow 1" policy on visual ZWJ emoji. We use
 * Intl.Segmenter (grapheme granularity) to count visual emoji as units.
 */

import type {
  Audience,
  JudgeResult,
} from "@/lib/agent/patterns/judge-types";
import type { VoiceFactPayload } from "@/lib/memory/voice-fact-schema";

/** voiceMode is the Phase E payload mode enum: 'neutral' (Mode 2) or
 *  'learned' (Mode 1). Re-typed here as the relevant slice; importing
 *  from Phase E keeps single source of truth. */
export type VoiceMode = VoiceFactPayload["mode"];

/** Resolved policy per (audience × voiceMode). 'zero' strips all emoji;
 *  'minimal' keeps the first emoji and strips the rest. */
type EmojiPolicy = "zero" | "minimal";

/** First-class policy table — composes audience × voiceMode → EmojiPolicy.
 *  Per-mode tuning happens by editing this table, not by adding ad-hoc
 *  branches at the call-site. */
const EMOJI_POLICY: Record<Audience, Record<VoiceMode, EmojiPolicy>> = {
  "koast-to-host": {
    neutral: "zero",
    learned: "zero",
  },
  "host-to-guest": {
    neutral: "minimal",
    // Q1-c collapse — see file header. v2.8 will derive emoji-allowance
    // from VoiceFeatures.emoji_frequency once that signal lands.
    learned: "minimal",
  },
};

function resolvePolicy(audience: Audience, voiceMode: VoiceMode): EmojiPolicy {
  return EMOJI_POLICY[audience][voiceMode];
}

const ALLOWANCE_BY_POLICY: Record<EmojiPolicy, number> = {
  zero: 0,
  minimal: 1,
};

/** Module-singleton grapheme segmenter. Locale is structural only —
 *  grapheme cluster segmentation is governed by Unicode UAX #29, not
 *  locale-specific rules. */
const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Detects pictographic codepoints. A grapheme containing any pictographic
 *  codepoint is treated as one visual emoji. Constructed via RegExp() (not
 *  literal) because tsconfig has no explicit target and the regex /u literal
 *  flag triggers TS1501; runtime behavior identical. */
const PICTOGRAPHIC_REGEX = new RegExp("\\p{Extended_Pictographic}", "u");

export interface ApplyEmojiPolicyResult {
  filtered_text: string;
  stripped_count: number;
  judge_result: JudgeResult;
}

/**
 * Apply the emoji output-filter policy resolved from (audience × voiceMode).
 *
 *   - zero: every visual emoji stripped; verdict 'fail' if any present.
 *   - minimal: first visual emoji kept; remaining stripped; verdict 'fail'
 *     if any stripping occurred.
 *
 * Returns the filtered text, the count of visual emoji stripped, and a
 * JudgeResult ready to attach to AgentTextOutput.judge_results (STEP 6).
 */
export function applyEmojiPolicy(
  text: string,
  audience: Audience,
  voiceMode: VoiceMode,
): ApplyEmojiPolicyResult {
  const policy = resolvePolicy(audience, voiceMode);
  const allowance = ALLOWANCE_BY_POLICY[policy];

  let emojiCount = 0;
  let strippedCount = 0;
  let keptCount = 0;
  const parts: string[] = [];

  // Array.from to avoid downlevelIteration requirement on the Segments
  // iterable under the current tsconfig target.
  for (const seg of Array.from(GRAPHEME_SEGMENTER.segment(text))) {
    if (PICTOGRAPHIC_REGEX.test(seg.segment)) {
      emojiCount += 1;
      if (keptCount < allowance) {
        keptCount += 1;
        parts.push(seg.segment);
      } else {
        strippedCount += 1;
        // strip — omit this grapheme from output
      }
    } else {
      parts.push(seg.segment);
    }
  }

  const filtered_text = parts.join("");

  let verdict: JudgeResult["verdict"];
  let reason: string;
  if (emojiCount === 0) {
    verdict = "pass";
    reason = "no_emoji_found";
  } else if (strippedCount === 0) {
    verdict = "pass";
    reason = "within_policy";
  } else {
    verdict = "fail";
    reason = "stripped_to_policy";
  }

  const judge_result: JudgeResult = {
    judge_id: "emoji_policy",
    verdict,
    reason,
    confidence: 1.0,
    details: {
      policy,
      stripped_count: strippedCount,
      original_emoji_count: emojiCount,
    },
  };

  return { filtered_text, stripped_count: strippedCount, judge_result };
}
