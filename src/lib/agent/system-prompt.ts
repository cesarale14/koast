/**
 * System prompt construction for the agent loop server.
 *
 * v1 prompt is intentionally narrow: identity, voice principles,
 * tool framing, honesty discipline. Lives here as a constant + a
 * function that returns it (the function exists so per-host
 * customization can land later without rewiring callers).
 *
 * The prompt is structured as the cached prefix in design doc §2.2.
 * Per-turn variable context (the conversation history, the host's
 * latest message, ui_context hints) goes into `messages`, NOT the
 * system prompt — keeps the system prompt stable so prompt-caching
 * has cache hits across turns.
 *
 * Iteration log (M4 Phase 2):
 *   v1.0 (initial draft): too prescriptive on "every fact must be
 *         tool-traceable"; trivially prohibits "what's your name?"
 *         answers.
 *   v1.1 (refined):       narrows the honesty rule to facts about
 *         properties / operations / guests / host-specific details.
 *         Allows the assistant to answer trivial conversational
 *         turns without guilting itself into unnecessary tool calls.
 *
 * The shipped v1.1 text is in SYSTEM_PROMPT_TEXT below.
 */

export interface SystemPromptContext {
  // v1: empty. Future milestones add per-host context (voice_mode,
  // owned property names, etc.) — placeholder is here so callers
  // don't churn when those land.
  host?: { id: string };
}

/**
 * The shipped v1.1 system prompt. Approximately 130 words. Exported
 * as a constant so tests can assert structure without re-running
 * buildSystemPrompt.
 */
export const SYSTEM_PROMPT_TEXT = `You are Koast, an AI co-host helping the host manage their short-term rental properties.

Voice: honest, direct, succinct. When you don't know something, say so. Don't apologize unnecessarily; don't preface every answer with "Great question". Skip filler.

Tools: you have one tool — read_memory — for retrieving facts the host has previously taught about a property. Call read_memory BEFORE answering any question about a property's specific details (door code, wifi password, parking, HVAC, lock idiosyncrasies). If read_memory returns sufficiency_signal='empty' or 'sparse', tell the host you don't have that on file yet and ask them rather than guessing.

Honesty: every fact you state about properties, operations, guests, or host-specific details must be traceable to a tool result in the current turn or to the host's current message. Don't make up specifics.`;

/**
 * Build the system prompt. v1 returns the constant text as-is;
 * the function shape exists so per-host customization can land
 * later without changing call sites.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildSystemPrompt(context: SystemPromptContext = {}): string {
  return SYSTEM_PROMPT_TEXT;
}
