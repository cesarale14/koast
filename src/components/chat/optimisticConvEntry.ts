/**
 * optimisticConvEntry — the optimistic conversation-rail entry built on
 * first-send (ChatClient), extracted as a PURE function so the reconcile-by-id
 * WIRING is unit-testable without React/component-test infra.
 *
 * Contract (the load-bearing line): the entry's id MUST be the SERVER
 * conversation id (state.conversation_id). That is what lets
 * mergeConversationLists reconcile this optimistic entry against the server row
 * BY ID — same id → one rail entry, no duplicate. A temp/client id here breaks
 * reconcile-by-id silently: the create-append item-5 e2e only checks PERSISTENCE
 * post-reload (where the optimistic state has reset) and does NOT catch it; the
 * merge function's own unit tests feed correctly-matching ids. This builder's
 * unit test is the gate for that wiring seam — the `id` break turns it RED.
 */
export type OptimisticConvEntry = {
  id: string;
  last_turn_at: string;
  preview: string;
  propertyName: string;
};

export function buildOptimisticConvEntry(
  conversationId: string,
  preview: string,
): OptimisticConvEntry {
  return {
    // The SERVER conversation id, verbatim — NEVER a temp/client id (the merge
    // dedups by id, so a mismatch here duplicates the rail entry).
    id: conversationId,
    last_turn_at: new Date().toISOString(),
    preview,
    propertyName: "",
  };
}
