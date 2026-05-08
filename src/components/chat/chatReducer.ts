/**
 * chatReducer — pure reducer for the layout-scoped chat state store
 * (M8 C8 substrate Step A).
 *
 * The reducer + types live in this `.ts` file (no JSX) so tests can
 * import without the React rendering boundary. The Context, Provider,
 * and hook live in `./ChatStore.tsx` and re-export these types.
 *
 * Pattern matches `src/lib/agent-client/turnReducer.ts` — pure reducer
 * isolated from the hook that consumes it. See `ChatStore.tsx` for the
 * provider composition + state-ownership notes.
 */

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

/**
 * Minimal turn shape stored in conversationHistory. Step C will refine
 * by bridging the full `UITurnLite` shape from ChatClient. The Step A
 * reducer treats turns opaquely — it assigns from payloads, never
 * mutates fields — so this loose contract is safe.
 */
export type ChatTurn = {
  id: string;
};

/**
 * Minimal proposal shape stored in pendingProposals. Step C/D refine
 * with the M7 propose_guest_message artifact shape. Step A indexes by
 * id to support PROPOSAL_RESOLVED removal.
 */
export type ChatProposal = {
  id: string;
};

export type TurnState = "idle" | "streaming" | "tool_call_pending";

export type ChatState = {
  // Conversation
  activeConversationId: string | null;
  conversationHistory: ChatTurn[];
  // UI
  expanded: boolean;
  // Turn (REFLECTED from useAgentTurn via Step C bridge; not store-owned)
  turnState: TurnState;
  // Audit feed (store-native; Step F populates)
  unreadAuditCount: number;
  lastSeenAuditTs: string | null;
  // Pending proposals (M7 carry-forward; Step C/D populate)
  pendingProposals: ChatProposal[];
};

export type ChatAction =
  | { type: "EXPAND" }
  | { type: "COLLAPSE" }
  | { type: "SET_ACTIVE_CONVERSATION"; conversationId: string }
  | { type: "HYDRATE_CONVERSATION"; turns: ChatTurn[] }
  | { type: "TURN_STATE_CHANGED"; turnState: TurnState }
  | { type: "PROPOSAL_RECEIVED"; proposal: ChatProposal }
  | { type: "PROPOSAL_RESOLVED"; proposalId: string }
  | { type: "AUDIT_TICK"; newCount: number; latestTs: string }
  | { type: "AUDIT_SEEN" };

// ----------------------------------------------------------------------
// Initial state
// ----------------------------------------------------------------------

export const initialChatState: ChatState = {
  activeConversationId: null,
  conversationHistory: [],
  expanded: false,
  turnState: "idle",
  unreadAuditCount: 0,
  lastSeenAuditTs: null,
  pendingProposals: [],
};

// ----------------------------------------------------------------------
// Reducer (pure)
// ----------------------------------------------------------------------

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "EXPAND":
      // Expanding clears the unread indicator: the host is now seeing
      // the surface where new audit events would land.
      return { ...state, expanded: true, unreadAuditCount: 0 };
    case "COLLAPSE":
      return { ...state, expanded: false };
    case "SET_ACTIVE_CONVERSATION":
      // Switching conversation clears history pending HYDRATE_CONVERSATION.
      return {
        ...state,
        activeConversationId: action.conversationId,
        conversationHistory: [],
      };
    case "HYDRATE_CONVERSATION":
      return { ...state, conversationHistory: action.turns };
    case "TURN_STATE_CHANGED":
      return { ...state, turnState: action.turnState };
    case "PROPOSAL_RECEIVED":
      // Idempotent on id — re-receiving the same proposal does not duplicate.
      if (state.pendingProposals.some((p) => p.id === action.proposal.id)) {
        return state;
      }
      return {
        ...state,
        pendingProposals: [...state.pendingProposals, action.proposal],
      };
    case "PROPOSAL_RESOLVED":
      return {
        ...state,
        pendingProposals: state.pendingProposals.filter(
          (p) => p.id !== action.proposalId,
        ),
      };
    case "AUDIT_TICK":
      return {
        ...state,
        unreadAuditCount: action.newCount,
        lastSeenAuditTs: action.latestTs,
      };
    case "AUDIT_SEEN":
      return { ...state, unreadAuditCount: 0 };
    default: {
      // Exhaustiveness check — TypeScript errors if a new action type
      // is added without a case branch.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
