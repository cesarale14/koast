/**
 * Voice fact payload schema — M9 Phase E D25 (v2.5).
 *
 * Locked at Phase E sign-off: voice_mode lives as memory_fact on
 * entity_type='host' + sub_entity_type='voice'. Fact value JSONB
 * carries this payload shape.
 *
 * Honors M8 C13 binding copy at
 * src/app/(dashboard)/koast/guide/memory/page.tsx:
 *   "Voice memory learns how you write — your cadence, your
 *    vocabulary, the way you sign off — so drafted guest messages
 *    stay recognizably yours at scale."
 *
 * Feature mapping to copy:
 *   - cadence              → sentence_length_avg + sentence_length_stdev
 *   - vocabulary           → vocabulary_signature[]
 *   - sign-off             → closing_patterns[]
 *   - greeting_patterns[] (bonus; supports "recognizably yours" at scale)
 *
 * Phase E ships SHAPE-RECOGNITION only per Method-in-code Belief 7
 * v1 framing. Generative Mode 1 = M10+.
 */

import { z } from "zod";

export const VoiceFeaturesSchema = z.object({
  /** Average sentence length (in characters or tokens; locked at chars). */
  sentence_length_avg: z.number().nonnegative(),
  /** Sample stddev of sentence lengths; 0 when sample_count < 2. */
  sentence_length_stdev: z.number().nonnegative(),
  /** Top-K opening phrases extracted from host writings (frequency-ranked). */
  greeting_patterns: z.array(z.string()),
  /** Top-K sign-off phrases extracted from host writings (frequency-ranked). */
  closing_patterns: z.array(z.string()),
  /**
   * Top-N distinctive words/phrases from the host's vocabulary, ranked
   * by frequency vs corpus baseline. Phase E ships top-N words; richer
   * signature (n-grams, distinctive collocations, register markers) is
   * M10 enrichment per v2.5 §6 M10 inheritance.
   */
  vocabulary_signature: z.array(z.string()),
  /** Number of host-authored messages contributing to this fact. */
  sample_count: z.number().int().nonnegative(),
});

export type VoiceFeatures = z.infer<typeof VoiceFeaturesSchema>;

export const VoiceFactPayloadSchema = z.object({
  /**
   * `neutral` — Mode 2 register; voice extraction not run yet or host
   *   chose neutral baseline. Sites 1-4 use doctrine + neutral context.
   * `learned` — Mode 1 shape-recognition; features + seed_samples
   *   inject as exemplars at generation time per B2 (a) lock.
   */
  mode: z.enum(["neutral", "learned"]),
  features: VoiceFeaturesSchema,
  /**
   * 3-5 representative host writings, captured for prompt-injection
   * exemplars. Optional because pre-extraction state (mode='neutral')
   * has no samples yet; populated when mode flips to 'learned'.
   */
  seed_samples: z.array(z.string()).optional(),
});

export type VoiceFactPayload = z.infer<typeof VoiceFactPayloadSchema>;

/**
 * Default neutral voice fact payload — used when no voice extraction
 * has run yet or host explicitly chose Mode 2. Features fields are
 * zero-valued; mode='neutral' signals to buildVoicePrompt to use
 * doctrine + neutral context rather than learned features.
 */
export const NEUTRAL_VOICE_FACT_PAYLOAD: VoiceFactPayload = {
  mode: "neutral",
  features: {
    sentence_length_avg: 0,
    sentence_length_stdev: 0,
    greeting_patterns: [],
    closing_patterns: [],
    vocabulary_signature: [],
    sample_count: 0,
  },
};
