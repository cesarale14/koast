"use client";

/**
 * ChatStore — layout-scoped Context+useReducer state store for the
 * persistent chat surface (M8 C8 substrate Step A).
 *
 * Pattern: Context + useReducer hybrid. The codebase has Context
 * (Toast.tsx) and useReducer (useAgentTurn.ts) separately. ChatStore
 * is the first composition: Context distributes state across the
 * dashboard layout (D1 spec); useReducer gives state-machine semantics
 * for the multi-slice ChatState shape.
 *
 * Per M8 conventions v1.4 D1 (post-Phase-B-C8-audit): chat state lives
 * at layout scope so it survives navigation between dashboard routes.
 *
 * State ownership boundaries:
 * - Turn state is REFLECTED here from useAgentTurn via a Step C bridge,
 *   not owned. The TURN_STATE_CHANGED action takes a new turnState as
 *   payload; the store never advances turn state on its own.
 * - Audit-tick state (unreadAuditCount, lastSeenAuditTs) is store-native;
 *   Step F's polling dispatches AUDIT_TICK / AUDIT_SEEN directly.
 * - Conversation state, expanded/collapsed UI, and proposals are
 *   store-native, dispatched by their respective consumers.
 *
 * The pure reducer + types live in `./chatReducer.ts` so tests can
 * import without crossing the JSX boundary. This file is the React
 * composition: Context, Provider, hook.
 *
 * Step A scope: types + reducer + Provider + hook. Steps B-F consume.
 */

import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  chatReducer,
  initialChatState,
  type ChatAction,
  type ChatProposal,
  type ChatState,
  type ChatTurn,
} from "./chatReducer";

// Re-export types for consumers that import from ChatStore as the
// canonical entry point.
export type {
  ChatAction,
  ChatProposal,
  ChatState,
  ChatTurn,
  TurnState,
} from "./chatReducer";
export { chatReducer, initialChatState } from "./chatReducer";

// ----------------------------------------------------------------------
// Context + Provider + hook
// ----------------------------------------------------------------------

type ChatStoreValue = {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
};

const ChatStoreContext = createContext<ChatStoreValue | null>(null);

export type ChatStoreProviderProps = {
  /** Server-hydrated initial conversation id (null on landing). */
  initialConversationId?: string | null;
  /** Server-hydrated initial conversation history. */
  initialHistory?: ChatTurn[];
  /** Server-hydrated initial pending proposals (typically empty). */
  initialProposals?: ChatProposal[];
  children: ReactNode;
};

export function ChatStoreProvider({
  initialConversationId = null,
  initialHistory = [],
  initialProposals = [],
  children,
}: ChatStoreProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialChatState,
    activeConversationId: initialConversationId,
    conversationHistory: initialHistory,
    pendingProposals: initialProposals,
  });
  return (
    <ChatStoreContext.Provider value={{ state, dispatch }}>
      {children}
    </ChatStoreContext.Provider>
  );
}

/**
 * Subscribe to chat store state + dispatch. Throws if used outside
 * ChatStoreProvider — failing loud is the right discipline. Silent
 * fallback to default state would mask layout-misconfiguration bugs.
 */
export function useChatStore(): ChatStoreValue {
  const ctx = useContext(ChatStoreContext);
  if (ctx === null) {
    throw new Error(
      "useChatStore must be called inside ChatStoreProvider — likely the dashboard layout is missing the provider wrapping (M8 C8 D1 substrate).",
    );
  }
  return ctx;
}

/**
 * Optional variant for components that need to coexist with both
 * pre-Provider mount (e.g., ChatClient at /chat route before Step D's
 * layout invert lands) and post-Provider mount. Returns null when no
 * Provider is in tree; consumer code branches gracefully.
 *
 * Removed once Step D lands — at that point Provider is always at
 * layout scope and useChatStore (the throw-on-missing variant) is
 * the only correct hook. Tracked as a transitional API.
 */
export function useChatStoreOptional(): ChatStoreValue | null {
  return useContext(ChatStoreContext);
}
