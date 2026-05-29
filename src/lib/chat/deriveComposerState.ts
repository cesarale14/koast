/**
 * deriveComposerState — pure mapping from turn lifecycle + draft to the
 * Composer's visual state.
 *
 * M13 Phase 1.B follow-on (X1 double-send fix). Extracted as a pure
 * function so the locking rule is unit-testable without React Testing
 * Library (this codebase has none; reducer/pure-helper tests are the
 * established pattern per the 1.A halt report).
 *
 * The X1 rule: the composer must be locked ("blocked") not only while a
 * turn is STREAMING but also during the submit→turn_started gap, where
 * the turn reducer's status is still "idle". `isPending` (from
 * useAgentTurn) covers that gap. Locking on (isPending || isStreaming)
 * closes the window where a second send would fire with a null
 * conversation_id and spawn a duplicate conversation.
 */

export type ComposerStateValue = "empty" | "typing" | "blocked";

export function deriveComposerState(args: {
  isPending: boolean;
  isStreaming: boolean;
  draftLength: number;
}): ComposerStateValue {
  // Locked the entire time a turn is in flight — from the synchronous
  // start of submit (isPending) through streaming (isStreaming).
  if (args.isPending || args.isStreaming) return "blocked";
  if (args.draftLength > 0) return "typing";
  return "empty";
}
