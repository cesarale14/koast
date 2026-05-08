"use client";

/**
 * /chat — landing route, thin client shell (M8 C8 Step D).
 *
 * Per conventions v1.3 D1 (geometry locked) + v1.4 D1 (state store
 * convention) + Step D layout invert: the chat panel is at layout
 * scope (ChatBar + ChatClient mounted unconditionally in the dashboard
 * layout). This route's only responsibility is to expand the panel
 * when the host navigates to /chat directly.
 *
 * Step E (next) leaves this route as-is — there is no per-route data
 * to hydrate beyond "open the panel." The panel's empty state shows
 * the rail's empty conversation list (or whatever the store has) and
 * waits for the host to start a conversation.
 *
 * Replaces the prior server-component implementation that fetched
 * conversations + properties + history; that data flow now lives in
 * /chat/[conversation_id] (Step E) for deep-linked conversations and
 * in lazy ChatClient state otherwise.
 */

import { useEffect } from "react";
import { useChatStore } from "@/components/chat/ChatStore";

export default function ChatLandingPage() {
  const { dispatch } = useChatStore();
  useEffect(() => {
    dispatch({ type: "EXPAND" });
  }, [dispatch]);
  return null;
}
