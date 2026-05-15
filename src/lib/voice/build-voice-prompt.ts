/**
 * buildVoicePrompt — M9 Phase E STEP 3 (B2 (a) lock).
 *
 * Returns the voice-context string injected into LLM system prompts
 * at Sites 1-4 generators. Per Q-E3 (a) lock: single doctrine import
 * + voice_mode parameter, uniform across all 4 call sites.
 *
 * Voice doctrine canonical source: `method/voice-doctrine.md` (vault)
 * + `~/koast/docs/voice.md` (repo mirror). This module wraps a short
 * operational summary suitable for prompt-injection; the full doctrine
 * is reference-grade for human reviewers, not LLM prompt context.
 *
 * Phase E ships SHAPE-RECOGNITION mode 1 per Method-in-code Belief 7
 * v1 framing — applies host's features as transformations on top of
 * the neutral baseline, NOT generation-from-scratch.
 */

import type { VoiceFactPayload } from "@/lib/memory/voice-fact-schema";

/**
 * Doctrine summary suitable for prompt-injection. Captures the
 * operational discipline from voice doctrine §§1-4 without
 * bloating prompt token cost. Full doctrine at
 * `method/voice-doctrine.md` is reference-grade for code review.
 */
const VOICE_DOCTRINE_SUMMARY = `Write in Koast's voice when speaking to the host (chat, audit, internal); in the host's voice when speaking to guests on their behalf. Never: corporate ("we've optimized your portfolio"), chipper ("hope this helps!"), or over-hedged ("I might be wrong, but..."). Always: direct without terse, warm without effusive, honest about limits without apologizing for them. End on the next move, not on social closure. No emoji in Koast-to-host. Voice doctrine §§1-4 govern.`;

/**
 * Build voice context for prompt-injection at a single call site.
 *
 * - voiceMode = null OR voiceMode.mode='neutral': returns neutral
 *   baseline guidance (doctrine + neutral register).
 * - voiceMode.mode='learned': returns doctrine + learned features
 *   + seed_samples as exemplars per shape-recognition pattern.
 *
 * The returned string is appended to the call site's existing system
 * prompt construction; doctrine + voice context become part of prompt
 * context alongside site-specific instructions.
 */
export function buildVoicePrompt(voiceMode: VoiceFactPayload | null): string {
  if (voiceMode === null || voiceMode.mode === "neutral") {
    return `${VOICE_DOCTRINE_SUMMARY}

Voice mode: neutral baseline. The host hasn't established a learned voice yet; apply the neutral host-approved tone — friendly, direct, not corporate, not repetitive.`;
  }

  // Learned mode — inject features + samples as shape-recognition guidance.
  const { features, seed_samples } = voiceMode;
  const cadenceLine =
    features.sample_count > 0
      ? `Cadence: avg sentence length ~${Math.round(features.sentence_length_avg)} chars (stdev ${Math.round(features.sentence_length_stdev)}); ${features.sample_count} sample messages observed.`
      : `Cadence: not yet observed.`;
  const greetingLine =
    features.greeting_patterns.length > 0
      ? `Greeting patterns: ${features.greeting_patterns.slice(0, 3).map((p) => `"${p}"`).join(", ")}.`
      : "";
  const closingLine =
    features.closing_patterns.length > 0
      ? `Sign-off patterns: ${features.closing_patterns.slice(0, 3).map((p) => `"${p}"`).join(", ")}.`
      : "";
  const vocabLine =
    features.vocabulary_signature.length > 0
      ? `Distinctive vocabulary: ${features.vocabulary_signature.slice(0, 6).join(", ")}.`
      : "";
  const samplesBlock =
    seed_samples && seed_samples.length > 0
      ? `\n\nRepresentative samples of the host's voice:\n${seed_samples.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`
      : "";

  return `${VOICE_DOCTRINE_SUMMARY}

Voice mode: learned. Apply the host's observed shape — match their cadence, greeting style, and sign-off — without forcing imitation. Shape-recognition only; produce text that reads as theirs in cadence + vocabulary, not generated-from-scratch in their voice.

${[cadenceLine, greetingLine, closingLine, vocabLine].filter((l) => l.length > 0).join("\n")}${samplesBlock}`;
}
