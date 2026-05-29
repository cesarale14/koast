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
 * whose id matches an optimistic entry, the SERVER row WINS PER FIELD —
 * it carries the real preview/title + canonical last_turn_at — EXCEPT a
 * populated optimistic field is NEVER clobbered by an EMPTY server field.
 *
 * Why the field-level caveat (M13 Phase 1.B Phase-1 close): a naive
 * whole-row server-wins reintroduced the rail-preview race. The optimistic
 * entry carries the real preview (the user's first message); a server list
 * read that lands before the first user turn is visible returns that
 * conversation with an EMPTY preview, and whole-row server-wins overwrote
 * the good optimistic preview with "". The rail (fetched once) then showed
 * an unlabeled entry until a reload. Field-level reconciliation kills that
 * race deterministically: an empty server field can't win over a populated
 * optimistic one. This is GENERAL — it protects any field that populates
 * asynchronously server-side (preview today; auto-generated title next),
 * so the next async-populated field doesn't repeat the bug.
 *
 * A populated server field still wins over the optimistic placeholder
 * (that's how "New conversation" becomes the real preview/title), and
 * non-colliding rows pass through unchanged. Recency sort uses the
 * (always-populated) server last_turn_at when present.
 *
 * Generic over any row carrying `id` + `last_turn_at` so it doesn't
 * couple to ChatClient's ConvListItem shape (keeps this module pure +
 * import-light for unit tests).
 */

export type MergeableConversation = {
  id: string;
  last_turn_at: string;
};

/** A field is "empty" (and so must not clobber a populated counterpart)
 * when it's null/undefined or a blank string. */
function isEmptyField(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function mergeConversationLists<T extends MergeableConversation>(
  server: T[],
  optimistic: T[],
): T[] {
  const byId = new Map<string, T>();
  // Seed with optimistic entries; server reconciles them per-field below.
  for (const c of optimistic) byId.set(c.id, c);
  for (const s of server) {
    const existing = byId.get(s.id);
    if (!existing) {
      byId.set(s.id, s);
      continue;
    }
    // Field-level reconciliation: server wins per field, but a populated
    // optimistic field is never overwritten by an empty server field.
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, serverVal] of Object.entries(s as Record<string, unknown>)) {
      const optimisticVal = (existing as Record<string, unknown>)[key];
      merged[key] =
        isEmptyField(serverVal) && !isEmptyField(optimisticVal)
          ? optimisticVal
          : serverVal;
    }
    byId.set(s.id, merged as T);
  }
  return Array.from(byId.values()).sort((a, b) =>
    b.last_turn_at.localeCompare(a.last_turn_at),
  );
}
