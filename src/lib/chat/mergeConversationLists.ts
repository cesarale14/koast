/**
 * mergeConversationLists — reconcile a server/loaded conversation list
 * with optimistic entries, deduped by id and sorted most-recent-first.
 *
 * M13 Phase 1.B follow-on (new-conversation-doesn't-appear-until-reload
 * fix). When the first turn from the landing surface anchors a new
 * conversation, ChatClient optimistically prepends a list entry so the
 * conversation appears in the rail immediately — without a reload or a
 * server round-trip. This helper merges those optimistic entries with
 * the server set.
 *
 * Reconciliation contract: when the server list contains a conversation
 * whose id matches an optimistic entry, the SERVER row WINS (it carries
 * the real preview/title + canonical last_turn_at). That is how the
 * optimistic "New conversation" entry seamlessly becomes its real titled
 * entry on the next genuine fetch/reload — no duplicate, no flicker.
 *
 * Generic over any row carrying `id` + `last_turn_at` so it doesn't
 * couple to ChatClient's ConvListItem shape (keeps this module pure +
 * import-light for unit tests).
 */

export type MergeableConversation = {
  id: string;
  last_turn_at: string;
};

export function mergeConversationLists<T extends MergeableConversation>(
  server: T[],
  optimistic: T[],
): T[] {
  const byId = new Map<string, T>();
  // Optimistic first so server entries overwrite on id collision —
  // the server row is authoritative when both exist.
  for (const c of optimistic) byId.set(c.id, c);
  for (const c of server) byId.set(c.id, c);
  return Array.from(byId.values()).sort((a, b) =>
    b.last_turn_at.localeCompare(a.last_turn_at),
  );
}
