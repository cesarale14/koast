/**
 * Review preferences fact payload schema — M9 Phase G E3 (v2.6).
 *
 * Locked at Phase G STEP 8.1: review_rules preferences move from the
 * dropped `review_rules` table to `memory_fact` on entity_type='host' +
 * sub_entity_type='reviews'. Fact value JSONB carries this payload
 * shape. Per-property scoping eliminated — preferences are now per-host
 * per D25 voice_mode locus precedent (v2.6 §1.3 E3 framing).
 *
 * Field mapping from dropped `review_rules` table (9 columns → 6 fields):
 *   - is_active           → is_active
 *   - auto_publish        → auto_publish
 *   - publish_delay_days  → publish_delay_days
 *   - tone                → tone
 *   - target_keywords[]   → target_keywords[]
 *   - bad_review_delay    → bad_review_delay
 *   - property_id         → DROPPED (per-host scoping; host_id implicit
 *                          via entity_type='host' + memory_facts.host_id)
 *   - id                  → DROPPED (memory_facts row id)
 *   - created_at          → DROPPED (memory_facts.learned_at)
 *
 * Defaults match the historical route fallbacks used when no
 * review_rules row existed (preserves existing UX behavior):
 *   tone='warm', target_keywords=['clean','location','comfortable'],
 *   auto_publish=false, publish_delay_days=3, bad_review_delay=true,
 *   is_active=true.
 *
 * Phase B F3 Zod boundary at reviews/generator.ts is preserved — the
 * generator consumes `{ tone, target_keywords }` subset; routes
 * derive that subset from this payload at call time.
 */

import { z } from "zod";

export const ReviewPreferencesPayloadSchema = z.object({
  /** When false, review automation is paused for this host. */
  is_active: z.boolean(),
  /**
   * When true, review draft auto-publishes after publish_delay_days
   * (subject to bad_review_delay gating). When false, review stays in
   * `draft_generated` status until host approves.
   */
  auto_publish: z.boolean(),
  /** Days to wait between review generation and auto-publish. */
  publish_delay_days: z.number().int().nonnegative(),
  /**
   * Voice register hint passed to the generator. Free-text per
   * historical schema (`warm` is the canonical default; other values
   * have been observed historically — kept open for forward-compat).
   */
  tone: z.string(),
  /** Target keywords the generator weaves into the public-review draft. */
  target_keywords: z.array(z.string()),
  /**
   * When true, bad reviews (rating below threshold) wait longer than
   * publish_delay_days before auto-publish — gives host time to flag
   * disputes. Generator consults `recommended` field to decide bad-vs-good
   * scope; route-level publish scheduling honors this flag.
   */
  bad_review_delay: z.boolean(),
});

export type ReviewPreferencesPayload = z.infer<
  typeof ReviewPreferencesPayloadSchema
>;

/**
 * Default review preferences payload — matches historical route
 * fallbacks (`generateGuestReview` + `generateReviewResponse` both
 * defaulted to these values when no `review_rules` row existed).
 * Preserves existing UX: any host without explicit preferences sees
 * the same generator behavior as before.
 */
export const DEFAULT_REVIEW_PREFERENCES_PAYLOAD: ReviewPreferencesPayload = {
  is_active: true,
  auto_publish: false,
  publish_delay_days: 3,
  tone: "warm",
  target_keywords: ["clean", "location", "comfortable"],
  bad_review_delay: true,
};
