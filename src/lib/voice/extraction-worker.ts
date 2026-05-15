/**
 * Voice extraction worker — M9 Phase E STEP 2 (D25 + Q-E5 lock).
 *
 * Reads host-authored messages from the `messages` table (direction
 * detection per the codebase's actor_kind discipline from M1) and
 * extracts the four voice-feature axes per M8 C13 binding copy:
 *
 *   - cadence              → sentence_length_avg + sentence_length_stdev
 *   - vocabulary           → vocabulary_signature[]
 *   - sign-off             → closing_patterns[]
 *   - greeting_patterns[]  (bonus; supports "recognizably yours")
 *
 * Phase E ships SHAPE-RECOGNITION only per Method-in-code Belief 7 v1
 * framing. Generative Mode 1 = M10+ per v2.5 §6 M10 inheritance.
 *
 * Supersession trigger (Q-E6 lock): threshold-based — new fact writes
 * when sample_count crosses 2× prior baseline. Continuous-learn
 * (every N edits) deferred to M10.
 *
 * Invocation (Q-E7 (iii) lock): nightly for v1. The exact scheduling
 * infrastructure (Vercel Cron vs VPS worker) is a follow-up decision
 * post-Phase E; this module is the substrate. A manual-trigger API
 * route ships alongside for testing + adoption.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readVoiceMode,
  writeVoiceMode,
} from "@/lib/memory/voice-mode";
import {
  VoiceFactPayloadSchema,
  type VoiceFeatures,
} from "@/lib/memory/voice-fact-schema";

/**
 * Minimum host-authored messages required to extract a voice fact.
 * Below this threshold, extraction returns 'insufficient_samples' and
 * doesn't write. Locked at 10 for Phase E (statistical features need
 * sample size for stdev to be meaningful; cadence avg is noisy at <10).
 */
const MIN_SAMPLES_FOR_EXTRACTION = 10;

/**
 * Sample-count growth factor that triggers supersession. New fact
 * writes when current sample_count ≥ prior_sample_count × 2.
 * Per Q-E6 lock.
 */
const SUPERSESSION_GROWTH_FACTOR = 2;

/**
 * Number of top-K patterns to extract per axis (greeting/closing/
 * vocabulary). Locked at 5 for Phase E; richer signature is M10.
 */
const TOP_K = 5;

/**
 * Number of seed_samples to capture per extraction. Locked at 5 for
 * Phase E — small enough to fit in prompt-injection context window
 * without ballooning token costs; large enough to convey voice shape.
 */
const SEED_SAMPLES_COUNT = 5;

export type ExtractionStatus =
  | "extracted"
  | "no_change"
  | "insufficient_samples";

export interface ExtractionResult {
  status: ExtractionStatus;
  /** Set when status='extracted'; the new memory_fact id. */
  fact_id?: string;
  /** Always set; number of host-authored messages examined. */
  sample_count: number;
  /** Set when status='extracted'; the prior sample_count for supersession context. */
  prior_sample_count?: number;
}

interface HostMessageRow {
  id: string;
  content: string;
  direction: string | null;
  created_at: string;
}

/**
 * Extract voice features for a host and write a new voice_mode fact
 * if the supersession threshold has been crossed (or no prior fact
 * exists with sufficient samples).
 */
export async function extractVoiceForHost(
  supabase: SupabaseClient,
  hostId: string,
): Promise<ExtractionResult> {
  // 1. Read host-authored messages (outbound direction). Cap at a
  //    sensible upper bound for v1 (1000 messages); statistical
  //    features stabilize well before that.
  const { data: messages, error: messagesErr } = await supabase
    .from("messages")
    .select("id, content, direction, created_at")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<HostMessageRow[]>();
  if (messagesErr) {
    throw new Error(`extractVoiceForHost: messages lookup failed: ${messagesErr.message}`);
  }
  const hostMessages = (messages ?? [])
    .map((m) => m.content)
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0);

  const sampleCount = hostMessages.length;

  // 2. Insufficient-samples gate.
  if (sampleCount < MIN_SAMPLES_FOR_EXTRACTION) {
    return { status: "insufficient_samples", sample_count: sampleCount };
  }

  // 3. Threshold check vs prior fact (if any).
  const prior = await readVoiceMode(supabase, hostId);
  const priorSampleCount = prior?.features.sample_count ?? 0;
  // First-run case (no prior fact): always extract.
  // Repeat-run case: require 2× growth to write supersession.
  if (prior !== null && sampleCount < priorSampleCount * SUPERSESSION_GROWTH_FACTOR) {
    return {
      status: "no_change",
      sample_count: sampleCount,
      prior_sample_count: priorSampleCount,
    };
  }

  // 4. Compute features.
  const features = computeFeatures(hostMessages);
  const seedSamples = selectSeedSamples(hostMessages);
  const payload = {
    mode: "learned" as const,
    features,
    seed_samples: seedSamples,
  };
  VoiceFactPayloadSchema.parse(payload); // assert schema before write

  // 5. Write (supersedes prior if exists; reason='outdated' for
  //    threshold-driven supersession).
  const factId = await writeVoiceMode(supabase, hostId, payload, {
    source: "inferred",
    confidence: 0.8,
    supersession_reason: "outdated",
  });

  return {
    status: "extracted",
    fact_id: factId,
    sample_count: sampleCount,
    prior_sample_count: prior ? priorSampleCount : undefined,
  };
}

// ---- Feature computation ----

/**
 * Compute statistical + pattern features across host writings.
 * Exported for unit-testability — extraction worker calls this; tests
 * can exercise without DB.
 */
export function computeFeatures(messages: string[]): VoiceFeatures {
  const sentenceLengths: number[] = [];
  for (const m of messages) {
    // Sentence split via period/question/exclamation; tolerant of
    // chat-text shapes (no terminator → whole message is one sentence).
    const sentences = m
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length === 0 && m.trim().length > 0) {
      sentenceLengths.push(m.trim().length);
    }
    for (const s of sentences) {
      sentenceLengths.push(s.length);
    }
  }
  const avg =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0;
  const stdev =
    sentenceLengths.length > 1
      ? Math.sqrt(
          sentenceLengths.reduce((acc, x) => acc + (x - avg) ** 2, 0) /
            (sentenceLengths.length - 1),
        )
      : 0;

  return {
    sentence_length_avg: Math.round(avg * 10) / 10,
    sentence_length_stdev: Math.round(stdev * 10) / 10,
    greeting_patterns: extractTopPhrases(messages, "opening"),
    closing_patterns: extractTopPhrases(messages, "closing"),
    vocabulary_signature: extractVocabularySignature(messages),
    sample_count: messages.length,
  };
}

/**
 * Extract top-K opening or closing phrases by frequency. Opening = first
 * sentence (or first 50 chars if no terminator); closing = last
 * sentence (or last 50 chars). Phrases normalized via lowercase +
 * first-name placeholder substitution.
 */
function extractTopPhrases(
  messages: string[],
  position: "opening" | "closing",
): string[] {
  const counts = new Map<string, number>();
  for (const m of messages) {
    const phrase = extractPhrase(m, position);
    if (phrase.length === 0) continue;
    const normalized = normalizePhrase(phrase);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([phrase]) => phrase);
}

function extractPhrase(
  message: string,
  position: "opening" | "closing",
): string {
  const sentences = message
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) {
    return message.trim().slice(0, 50);
  }
  return position === "opening"
    ? sentences[0].slice(0, 50)
    : sentences[sentences.length - 1].slice(0, 50);
}

function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/\b(sarah|marcus|john|jane|sara|alex)\b/gi, "{first_name}")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract top-N distinctive vocabulary tokens from host messages.
 * Phase E ships frequency-ranked content words filtered against a
 * small stop-word list. Richer vocabulary signature (n-grams,
 * distinctive collocations, register markers) is M10 enrichment per
 * v2.5 §6 M10 inheritance.
 */
function extractVocabularySignature(messages: string[]): string[] {
  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "if", "then", "for", "to",
    "of", "at", "in", "on", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "i", "you", "he", "she",
    "it", "we", "they", "this", "that", "these", "those", "with",
    "from", "as", "by", "my", "your", "our", "their", "me", "him",
    "her", "us", "them", "so", "very", "just", "can", "will", "would",
    "should", "could", "may", "might", "not", "no", "yes", "ok", "okay",
  ]);
  const counts = new Map<string, number>();
  for (const m of messages) {
    const tokens = m
      .toLowerCase()
      .split(/[^a-z'-]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  // Top-N by frequency. Phase E enrichment: rank vs corpus baseline
  // for distinctiveness — M10 candidate.
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K * 2)
    .map(([token]) => token);
}

/**
 * Pick representative seed_samples for prompt-injection exemplars.
 * Phase E heuristic: select messages that fall near the median
 * sentence length (so the model sees host's typical cadence, not
 * outliers). Caps at SEED_SAMPLES_COUNT.
 */
export function selectSeedSamples(messages: string[]): string[] {
  if (messages.length === 0) return [];
  if (messages.length <= SEED_SAMPLES_COUNT) return [...messages];

  // Sort by length; pick from middle ± 25%.
  const sorted = [...messages].sort((a, b) => a.length - b.length);
  const start = Math.floor(sorted.length * 0.375);
  const end = Math.floor(sorted.length * 0.625);
  const middleSlice = sorted.slice(start, end);
  return middleSlice.slice(0, SEED_SAMPLES_COUNT);
}
