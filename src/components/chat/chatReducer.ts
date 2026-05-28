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

/**
 * M13 Phase 1.A — pathname-derived layout state machine (operator msg 3515
 * R1 binding refinement): the reducer holds CONVERSATION state only. The
 * UI surface (chat-primary vs inspect) is derived from pathname in
 * `(dashboard)/layout.tsx`, NOT stored in this reducer. Browser
 * back/forward is correct for free; no mode/URL desync risk.
 *
 * RETIRED at M13 Phase 1.A: `expanded: boolean`, `EXPAND` action,
 * `COLLAPSE` action. The previous overlay-on-click pattern (M8 C8 Step D)
 * is replaced by chat-primary-as-default-at-/ + inspect-on-routes.
 */
export type ChatState = {
  // Conversation
  activeConversationId: string | null;
  conversationHistory: ChatTurn[];
  /**
   * M13 Phase 1.B follow-on (switch-flash fix): true while a DIFFERENT
   * conversation is being hydrated from the server. Distinguishes
   * "mid-switch, content arriving" from "genuinely new/empty
   * conversation." The chat surface renders a loading skeleton when
   * this is true; the landing/empty state renders ONLY when
   * activeConversationId is null AND not loading. Set true by
   * SET_ACTIVE_CONVERSATION when its `loading` flag is passed; reset
   * to false by HYDRATE_CONVERSATION.
   */
  conversationLoading: boolean;
  // Turn (REFLECTED from useAgentTurn via Step C bridge; not store-owned)
  turnState: TurnState;
  // Audit feed (store-native; Step F populates)
  unreadAuditCount: number;
  lastSeenAuditTs: string | null;
  // Pending proposals (M7 carry-forward; Step C/D populate)
  pendingProposals: ChatProposal[];
};

export type ChatAction =
  | {
      type: "SET_ACTIVE_CONVERSATION";
      conversationId: string | null;
      /**
       * When true, the surface enters the loading state (clears history
       * + sets conversationLoading) — a genuine switch to a different
       * conversation whose turns are about to be fetched. Omitted/false
       * for landing (null) transitions, which render the empty state.
       */
      loading?: boolean;
    }
  // M13 Phase 1.B follow-on (fragmentation fix): anchor an in-flight
  // conversation to its newly-assigned id WITHOUT clearing history or
  // entering the loading state. Used when the first turn from the
  // landing surface gets its conversation_id from turn_started — the
  // live turn is already rendering from the local session harvest, so
  // we must NOT clear or re-fetch. Distinct from SET_ACTIVE_CONVERSATION
  // (which clears) so the ongoing exchange stays coherent as ONE
  // conversation in history + Cmd+K recents.
  | { type: "ANCHOR_CONVERSATION"; conversationId: string }
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
  conversationLoading: false,
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
    case "SET_ACTIVE_CONVERSATION":
      // Switching conversation clears history pending HYDRATE_CONVERSATION.
      // M13 Phase 1.B follow-on: when `loading` is set (a switch to a
      // different conversation that will be hydrated from the server),
      // enter the loading state so the surface renders a skeleton rather
      // than the landing/empty state mid-switch.
      return {
        ...state,
        activeConversationId: action.conversationId,
        conversationHistory: [],
        conversationLoading: action.loading === true,
      };
    case "ANCHOR_CONVERSATION":
      // M13 Phase 1.B follow-on: assign the id to an in-flight
      // conversation WITHOUT clearing history or entering loading. The
      // live turn is rendering from the session harvest; clearing or
      // re-fetching here would wipe it. Idempotent — anchoring the id
      // that's already active is a no-op.
      if (state.activeConversationId === action.conversationId) return state;
      return {
        ...state,
        activeConversationId: action.conversationId,
        conversationLoading: false,
      };
    case "HYDRATE_CONVERSATION":
      // Hydration always ends the loading state — the turns (possibly
      // empty on a failed/empty fetch) are now authoritative.
      return {
        ...state,
        conversationHistory: action.turns,
        conversationLoading: false,
      };
    case "TURN_STATE_CHANGED":
      // Dedup: if the bridged value matches the current store value,
      // return the same state object so React skips re-renders. The
      // useAgentTurn → store bridge fires on every content[] change
      // during streaming (every chunk), but the mapped enum value
      // changes much less often. Without dedup, every chunk would
      // dispatch and trigger downstream re-renders. Lock per
      // Cesar's Step B/C sign-off note.
      if (state.turnState === action.turnState) return state;
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
      // Additive — newCount is the count of new events from THIS poll,
      // not the cumulative since-last-seen. The hook (useAuditPoll)
      // dispatches the per-poll delta; the reducer accumulates across
      // polls. lastSeenAuditTs always sets to the latest poll's ts so
      // subsequent server queries (`occurred_at > lastSeenAuditTs`) only
      // return strictly-newer events. (Step F.1 fix.)
      return {
        ...state,
        unreadAuditCount: state.unreadAuditCount + action.newCount,
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
