"use client";

/**
 * ConversationHydrator — thin client wrapper for /chat/[conversation_id]
 * route's server-fetched data (M8 C8 substrate Step E, (γ) path lock).
 *
 * The route is a server component that fetches conversation history via
 * `loadTurnsForConversation` and renders this component with the data.
 * On mount, the hydrator dispatches:
 * - SET_ACTIVE_CONVERSATION (clears history pending the next dispatch)
 * - HYDRATE_CONVERSATION (replaces with the fetched turns)
 * - EXPAND (opens the chat panel; the host arrived at /chat/[id])
 *
 * Returns null — no UI; the chat panel at layout scope renders the
 * conversation surface.
 */

import { useEffect } from "react";
import { useChatStore, type ChatTurn } from "./ChatStore";

export type ConversationHydratorProps = {
  conversationId: string;
  history: ChatTurn[];
};

export function ConversationHydrator({
  conversationId,
  history,
}: ConversationHydratorProps) {
  const { dispatch } = useChatStore();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_CONVERSATION", conversationId });
    dispatch({ type: "HYDRATE_CONVERSATION", turns: history });
    dispatch({ type: "EXPAND" });
  }, [conversationId, history, dispatch]);
  return null;
}
