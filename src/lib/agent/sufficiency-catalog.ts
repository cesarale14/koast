/**
 * D23 per-generator-call sufficiency catalog — M9 Phase C (Option B).
 *
 * Formalizes Phase B's inline `buildEnvelope` heuristics into a
 * catalog of per-generator threshold specs. Each generator declares
 * its required input shape + an `evaluate` function that returns
 * `{ confidence, output_grounding }` for the AgentTextOutput envelope.
 *
 * Scope per Phase C sign-off (Q-C4 = Option B per-generator-call):
 *   - Covers Sites 1-4 LLM generators (generateDraft + 3 review
 *     generators). Site 2's two SDK calls have separate entries
 *     (review_text + private_note) per Q-B3 two-envelope resolution.
 *   - Site 5 (agent loop chat-text) OUT of scope per Phase B Path A.
 *
 * Distinct from:
 *   - M8 C3 `classifySufficiency` (`src/lib/agent/sufficiency.ts`) —
 *     host-level onboarding rollup feeding system-prompt context.
 *     Different scope (host-onboarding vs output-grounding). G8-6
 *     boundary: same `memory_facts` substrate, distinct consuming
 *     surfaces; D23 catalog does NOT call `classifySufficiency`.
 *   - M3 `read_memory` tool's `data_sufficiency.sufficiency_signal` —
 *     same `rich | sparse | empty` vocabulary because read_memory is
 *     the upstream substrate this catalog inherits grounding values
 *     from when memory retrieval underlies the generated content.
 *     Phase C lands the catalog substrate; Phase C/D wiring through
 *     to read_memory is a future enhancement (current entries derive
 *     grounding from caller-provided context, mirroring Phase B's
 *     inline heuristics).
 *
 * D23 catalog evaluation produces:
 *   - confidence: per Method Belief 5 honest-confidence tiers
 *     (confirmed / high_inference / active_guess)
 *   - output_grounding: per the rename in v2.3 conventions
 *     (rich / sparse / empty)
 *
 * Each entry is exported individually so generator buildEnvelope
 * helpers import the specific entry rather than reaching into a
 * registry by string key. Type-safe at call site; entries are static.
 */

import type { AgentTextOutput } from "./schemas/agent-text-output";

// ---- Result shape ----

export type ConfidenceLevel = NonNullable<AgentTextOutput["confidence"]>;
export type OutputGrounding = NonNullable<AgentTextOutput["output_grounding"]>;

export interface GroundingResult {
  confidence: ConfidenceLevel;
  output_grounding: OutputGrounding;
}

export interface GeneratorThreshold<TInput> {
  /** Canonical generator name — used for telemetry, debugging, future
   *  catalog inspection / introspection surfaces. */
  generator: string;
  evaluate: (input: TInput) => GroundingResult;
}

// ---- Standard 3-axis pattern shared by Sites 1, 2-review, 3, 4 ----

/**
 * The standard pattern across Sites 1, 2-review, 3, 4 maps "count of
 * relevant inputs present" to a 3-tier gradient:
 *   - all required present  → confirmed / rich
 *   - some present          → high_inference / sparse
 *   - none present          → active_guess / empty
 *
 * Generators with different gradients (e.g., Site 2-note, which is
 * universally context-thin) declare their own evaluator.
 */
function gradient3(presentCount: number, totalCount: number): GroundingResult {
  if (totalCount === 0) {
    return { confidence: "active_guess", output_grounding: "empty" };
  }
  if (presentCount === totalCount) {
    return { confidence: "confirmed", output_grounding: "rich" };
  }
  if (presentCount > 0) {
    return { confidence: "high_inference", output_grounding: "sparse" };
  }
  return { confidence: "active_guess", output_grounding: "empty" };
}

// ---- Site 1: generateDraft ----

export interface GenerateDraftCatalogInput {
  details: {
    wifi_network: string | null;
    door_code: string | null;
    parking_instructions: string | null;
    checkin_time: string | null;
  } | null;
}

const DRAFT_REQUIRED_KEYS = [
  "wifi_network",
  "door_code",
  "parking_instructions",
  "checkin_time",
] as const;

export const generateDraftThreshold: GeneratorThreshold<GenerateDraftCatalogInput> = {
  generator: "generateDraft",
  evaluate: ({ details }) => {
    if (!details) return gradient3(0, DRAFT_REQUIRED_KEYS.length);
    const presentCount = DRAFT_REQUIRED_KEYS.filter((k) => {
      const v = details[k];
      return v != null && v !== "";
    }).length;
    return gradient3(presentCount, DRAFT_REQUIRED_KEYS.length);
  },
};

// ---- Site 2 (first call): generateGuestReview review_text ----

export interface GenerateGuestReviewCatalogInput {
  rule: { tone: string; target_keywords: string[] };
  booking: { guest_name: string | null };
}

export const generateGuestReviewThreshold: GeneratorThreshold<GenerateGuestReviewCatalogInput> = {
  generator: "generateGuestReview",
  evaluate: ({ rule, booking }) => {
    const hasKeywords = rule.target_keywords.length > 0;
    const hasTone = rule.tone.trim().length > 0;
    const hasGuestName =
      booking.guest_name != null && booking.guest_name !== "";
    const present = [hasKeywords, hasTone, hasGuestName].filter(Boolean).length;
    return gradient3(present, 3);
  },
};

// ---- Site 2 (second call): generateGuestReview private_note ----

/**
 * Private notes have minimal context-dependence — the prompt only
 * takes guest_name + property_name + nights, all universally
 * available. Static "active_guess / sparse" assignment because the
 * content is generic (a thank-you), and there's no learned host
 * preference feeding this output.
 */
export const generatePrivateNoteThreshold: GeneratorThreshold<Record<string, never>> = {
  generator: "generateGuestReview.privateNote",
  evaluate: () => ({
    confidence: "active_guess",
    output_grounding: "sparse",
  }),
};

// ---- Site 3: generateReviewResponse ----

export interface GenerateReviewResponseCatalogInput {
  incomingText: string;
  incomingRating: number;
}

export const generateReviewResponseThreshold: GeneratorThreshold<GenerateReviewResponseCatalogInput> = {
  generator: "generateReviewResponse",
  evaluate: ({ incomingText, incomingRating }) => {
    const hasText = incomingText.trim().length > 0;
    const hasRating = Number.isFinite(incomingRating);
    const present = [hasText, hasRating].filter(Boolean).length;
    return gradient3(present, 2);
  },
};

// ---- Site 4: generateGuestReviewFromIncoming ----

export interface GenerateGuestReviewFromIncomingCatalogInput {
  incoming_text: string | null;
  incoming_rating: number | null;
}

export const generateGuestReviewFromIncomingThreshold: GeneratorThreshold<GenerateGuestReviewFromIncomingCatalogInput> = {
  generator: "generateGuestReviewFromIncoming",
  evaluate: ({ incoming_text, incoming_rating }) => {
    const hasText = incoming_text != null && incoming_text.trim().length > 0;
    const hasRating = incoming_rating != null;
    const present = [hasText, hasRating].filter(Boolean).length;
    return gradient3(present, 2);
  },
};
