"use client";

/**
 * /chat/[conversation_id] — deep-linked conversation, thin client shell
 * (M8 C8 Step D minimal; Step E adds server-side fetch + hydration).
 *
 * Per (γ) Step E plan: this route is a thin client shell that triggers
 * EXPAND on mount. Step E expands it to wrap a server-component fetcher
 * that pulls conversation history server-side and hands data to a thin
 * client wrapper that dispatches SET_ACTIVE_CONVERSATION + HYDRATE_CONVERSATION.
 *
 * Step D minimal: just expand. Conversation data hydration deferred to Step E.
 */

import { useEffect } from "react";
import { useChatStore } from "@/components/chat/ChatStore";

export default function ChatConversationPage() {
  const { dispatch } = useChatStore();
  useEffect(() => {
    dispatch({ type: "EXPAND" });
  }, [dispatch]);
  return null;
}
