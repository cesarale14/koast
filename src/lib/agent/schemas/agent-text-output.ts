/**
 * AgentTextOutput — D22 envelope per M9 conventions v2.1.
 *
 * Every LLM call site that produces host-facing or guest-facing text
 * wraps its output in this envelope. Confidence metadata travels
 * alongside content via a parallel structured channel (D22 lock) —
 * NOT as fields inside the content schema and NOT as rendering-time
 * inference.
 *
 * Phase B scope (sites 1-4 per Path A sign-off):
 *   - The envelope is constructed by the generator function from
 *     caller context + LLM output. The LLM continues to return plain
 *     text; the generator extracts and wraps. F3 Zod enforces the
 *     wrapped envelope shape.
 *   - Confidence + source_attribution + sufficiency_signal are
 *     deterministic-from-context at Phase B; Phase C (D23) wires the
 *     sufficiency catalog and Phase E voice work touches `hedge`.
 *
 * Out of Phase B scope (covered separately):
 *   - Site 5 (agent loop) text-output enforcement → A5/D27 (Phase D)
 *   - Rendering layer consumption → starts Phase C
 *   - Tonal regression on `content` → D24 (Phase F)
 */

import { z } from "zod";

export const SourceRefSchema = z.object({
  /**
   * What kind of source backs this attribution. Examples:
   *   - "memory_fact" (memory_facts.id)
   *   - "channex_thread" (Channex message_thread_id)
   *   - "booking" (bookings.id)
   *   - "review" (guest_reviews.id)
   *   - "comp_set" (market_comps source_id)
   */
  type: z.string().min(1),
  /** Stable identifier in the source system (uuid, external id, etc). */
  id: z.string().min(1),
  /**
   * Optional human-readable label the rendering layer can surface
   * directly (e.g., "Villa Jamaica wifi password").
   */
  label: z.string().optional(),
});

export type SourceRef = z.infer<typeof SourceRefSchema>;

export const AgentTextOutputSchema = z.object({
  /** The text shown to the host (or to the guest, when host-to-guest context). */
  content: z.string().min(1),

  /**
   * Confidence tier per Method Belief 5 (Honest confidence):
   *   - confirmed: Koast knows this directly (memory-backed, retrieved)
   *   - high_inference: strong evidence; marked but not undercut
   *   - active_guess: limited information; hedge upfront
   */
  confidence: z.enum(["confirmed", "high_inference", "active_guess"]),

  /**
   * Sources backing the content. Required field; empty array allowed
   * when content is wholly model-generated (e.g., greeting, generic
   * acknowledgment). Phase C wires retrieval-time population.
   */
  source_attribution: z.array(SourceRefSchema),

  /**
   * Optional surface-rendered qualifier (e.g., "based on the last 30 days").
   * Voice doctrine §3.4 anti-pattern: hedges that undercut confirmed
   * knowledge are violations. Hedge is reserved for high_inference /
   * active_guess; rendering may suppress on confirmed.
   */
  hedge: z.string().optional(),

  /**
   * Memory-retrieval sufficiency signal from M8 read_memory pattern.
   * Phase C (D23) integrates this with the per-tool sufficiency catalog.
   */
  sufficiency_signal: z.enum(["rich", "sparse", "empty"]).optional(),
});

export type AgentTextOutput = z.infer<typeof AgentTextOutputSchema>;
