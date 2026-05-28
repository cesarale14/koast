"use client";

/**
 * ChatURLSync — pathname → conversation hydration binding.
 *
 * M13 Phase 1.B follow-on (deep-link conversation loading bug fix +
 * fragmentation/switch-flash coordination).
 *
 * The M13 Phase 1.A chat-primary surface owns the viewport and does NOT
 * render Next.js `{children}`. That means /chat/[id]/page.tsx's
 * <ConversationHydrator> never mounts; soft navigations between
 * conversations change the URL but the loaded conversation never
 * updates. Cmd+K's recent-conversation results land the same way:
 * URL changes, surface doesn't.
 *
 * This component fixes the binding. Mounted inside the chat-primary
 * branch's ChatStoreProvider (sibling to AuditPollMount), it:
 *   1. watches `usePathname()` (updates on soft navigations)
 *   2. extracts the conversation_id via conversationIdFromPathname()
 *   3. hydrates ONLY when the URL id differs from the already-active
 *      in-memory conversation (see no-op guard below)
 *
 * NO-OP GUARD (fragmentation fix — operator msg 3544):
 *   When the URL conversation_id already equals the store's active
 *   conversation id, ChatURLSync does NOTHING. This is the critical
 *   coordination with the first-send anchor: when the landing surface
 *   sends its first turn, ChatClient dispatches ANCHOR_CONVERSATION
 *   (store id := newId) and router.replace('/chat/newId'). That URL
 *   change fires this effect — but because store id already === newId,
 *   we no-op. Without the guard we'd SET_ACTIVE (wiping the in-flight
 *   streaming turn) and re-fetch from the server, fragmenting the
 *   exchange and flashing empty.
 *
 *   Hydration therefore happens only for a GENUINELY DIFFERENT
 *   conversation than the one already active — a real switch (Cmd+K
 *   recent, rail click, browser back/forward) or a cold deep-link.
 *
 * LOADING STATE (switch-flash fix — operator msg 3544):
 *   On a genuine switch to a non-null id, the SET_ACTIVE dispatch
 *   carries `loading: true` so the surface renders a skeleton rather
 *   than the landing/empty state while turns are in flight. HYDRATE
 *   clears the loading flag.
 *
 * Renders null — pure side-effect component.
 *
 * Fetch lifecycle:
 *   - Race protection via an effect-scoped cancellation flag.
 *   - 404 / failed fetch → HYDRATE([]) (clears loading; surface shows
 *     empty rather than an infinite skeleton). No retry.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useChatStore, type ChatTurn } from "./ChatStore";
import { conversationIdFromPathname } from "@/lib/chat/conversationIdFromPathname";

export function ChatURLSync() {
  const pathname = usePathname();
  const { state, dispatch } = useChatStore();
  const conversationId = conversationIdFromPathname(pathname);

  // The effect reacts ONLY to URL (conversationId) changes — NOT to
  // store changes. This is load-bearing for the first-send anchor:
  //
  //   1. turn_started → ChatClient dispatches ANCHOR_CONVERSATION(newId),
  //      so store.activeConversationId becomes newId while the URL is
  //      STILL `/` (router.replace is async — usePathname hasn't updated).
  //   2. If this effect depended on activeConversationId, that store
  //      change would fire it with conversationId=null (stale URL) ≠
  //      newId, and the null-branch below would SET_ACTIVE(null) and
  //      WIPE the just-anchored conversation.
  //
  // So we read the live store id through a ref (updated every render)
  // and key the effect only on conversationId. A store-only change
  // (the anchor) never re-runs the effect; only an actual URL change
  // does. When the URL finally catches up to /chat/newId, the no-op
  // guard (URL id === store id) short-circuits — no wipe, no refetch.
  const activeConversationIdRef = useRef(state.activeConversationId);
  activeConversationIdRef.current = state.activeConversationId;

  useEffect(() => {
    // NO-OP GUARD: the URL already matches the active conversation.
    // Covers (a) the anchor's router.replace landing after the store was
    // already set, and (b) any re-entry where URL and store agree.
    // Re-hydrating here would wipe live/streaming content.
    if (conversationId === activeConversationIdRef.current) return;

    let cancelled = false;

    if (conversationId === null) {
      // Switched to the landing path (e.g. browser back to `/`, or the
      // host opened a new conversation). Reset to empty; not a loading
      // state — this IS the genuinely-new/empty surface.
      dispatch({ type: "SET_ACTIVE_CONVERSATION", conversationId: null });
      dispatch({ type: "HYDRATE_CONVERSATION", turns: [] });
      return;
    }

    // Genuine switch to a different conversation — enter the loading
    // state (clears history + sets conversationLoading) so the surface
    // shows a skeleton, not the landing flash, while turns arrive.
    dispatch({
      type: "SET_ACTIVE_CONVERSATION",
      conversationId,
      loading: true,
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/agent/conversations/${encodeURIComponent(conversationId)}/turns`,
          { credentials: "include" },
        );
        if (cancelled) return;
        if (!res.ok) {
          // 404 / 401 / 500 — surface as empty history. HYDRATE clears
          // the loading flag so the host sees an empty state rather than
          // an infinite skeleton or the prior conversation under a
          // mismatched URL.
          dispatch({ type: "HYDRATE_CONVERSATION", turns: [] });
          return;
        }
        const body = (await res.json()) as { turns?: ChatTurn[] };
        if (cancelled) return;
        dispatch({
          type: "HYDRATE_CONVERSATION",
          turns: body.turns ?? [],
        });
      } catch {
        if (cancelled) return;
        dispatch({ type: "HYDRATE_CONVERSATION", turns: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally keyed ONLY on conversationId (the URL). See the
    // ref note above — depending on activeConversationId would let the
    // anchor's store update fire this effect with a stale URL and wipe
    // the in-flight conversation.
  }, [conversationId, dispatch]);

  return null;
}
