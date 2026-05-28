"use client";

/**
 * ChatURLSync — pathname → conversation hydration binding.
 *
 * M13 Phase 1.B follow-on (deep-link conversation loading bug fix).
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
 *   1. watches `usePathname()` via React state binding (Next.js's
 *      usePathname() updates on soft navigations)
 *   2. extracts the conversation_id via conversationIdFromPathname()
 *   3. when conversation_id changes:
 *      - dispatches SET_ACTIVE_CONVERSATION (clears prior history)
 *      - if conversation_id is non-null: fetches
 *        /api/agent/conversations/[id]/turns and dispatches
 *        HYDRATE_CONVERSATION with the result
 *      - if conversation_id is null (host on /): dispatches
 *        HYDRATE_CONVERSATION with [] (empty / new conversation)
 *
 * Renders null — pure side-effect component.
 *
 * Fetch lifecycle:
 *   - Race protection via an effect-scoped cancellation flag — if
 *     pathname changes mid-fetch, the in-flight result is discarded.
 *     Without this, fast successive navigations could land an older
 *     conversation's data into the store after a newer nav.
 *   - 404 / failed fetch — surfaces as empty conversation history
 *     (HYDRATE_CONVERSATION with []) + activeConversationId stays
 *     set so the host sees "fetch failed" in the UI rather than the
 *     prior conversation persisting silently.
 *   - No retry. The user can navigate again if they hit a transient
 *     network failure. Avoids retry storms.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useChatStore, type ChatTurn } from "./ChatStore";
import { conversationIdFromPathname } from "@/lib/chat/conversationIdFromPathname";

export function ChatURLSync() {
  const pathname = usePathname();
  const { dispatch } = useChatStore();
  const conversationId = conversationIdFromPathname(pathname);

  useEffect(() => {
    let cancelled = false;

    // Always set the active conversation first — clears the prior
    // history so the UI shows the "switching" state instead of a stale
    // conversation while the fetch is in flight.
    dispatch({ type: "SET_ACTIVE_CONVERSATION", conversationId });

    if (conversationId === null) {
      // Landing path. Reset history; no fetch needed.
      dispatch({ type: "HYDRATE_CONVERSATION", turns: [] });
      return;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/agent/conversations/${encodeURIComponent(conversationId)}/turns`,
          { credentials: "include" },
        );
        if (cancelled) return;
        if (!res.ok) {
          // 404 / 401 / 500 — surface as empty history. The host's
          // current activeConversationId is still the requested id;
          // the chat surface renders "this conversation is empty" /
          // an empty state. Better than silently keeping the prior
          // conversation visible under a URL that doesn't match.
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
  }, [conversationId, dispatch]);

  return null;
}
