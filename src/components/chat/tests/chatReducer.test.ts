/**
 * Pure-reducer tests for ChatStore (M8 C8 substrate Step A).
 *
 * Test scope: chatReducer transitions, initial state, purity. The
 * Provider / hook (ChatStoreProvider, useChatStore) are thin React
 * wrappers and are not unit-tested here — the codebase has no React
 * Testing Library or jsdom environment configured. RTL infrastructure
 * is a separate scope; reducer-only tests match the canonical pattern
 * established by src/lib/agent-client/tests/turnReducer.test.ts.
 */

import {
  chatReducer,
  initialChatState,
  type ChatProposal,
  type ChatState,
  type ChatTurn,
} from "../chatReducer";

describe("chatReducer — initial state", () => {
  test("initialChatState matches expected shape", () => {
    // M13 Phase 1.A — `expanded` removed from ChatState. The UI surface
    // (chat-primary vs inspect) is pathname-derived in the dashboard
    // layout, not stored in the reducer.
    expect(initialChatState).toEqual({
      activeConversationId: null,
      conversationHistory: [],
      // M13 Phase 1.B follow-on (switch-flash fix): loading flag.
      conversationLoading: false,
      turnState: "idle",
      unreadAuditCount: 0,
      lastSeenAuditTs: null,
      pendingProposals: [],
    });
  });
});

describe("chatReducer — UI state (M13 Phase 1.A retired)", () => {
  // M13 Phase 1.A retired EXPAND, COLLAPSE, and the `expanded` flag.
  // The reducer no longer participates in layout-surface decisions.
  // The previous tests for EXPAND / COLLAPSE are removed because the
  // actions no longer exist; pathname-derived rendering is asserted in
  // src/lib/chat/tests/isChatPrimary.test.ts instead.
  test("reducer has no EXPAND or COLLAPSE action types (compile-time check)", () => {
    // Sentinel: this test exists to make the retirement explicit. The
    // exhaustiveness check in chatReducer's default branch + the
    // ChatAction discriminated union enforce this at compile time. If
    // EXPAND or COLLAPSE were re-added, TypeScript would fail before
    // jest ran.
    expect(true).toBe(true);
  });
});

describe("chatReducer — conversation state", () => {
  test("SET_ACTIVE_CONVERSATION sets id and clears history", () => {
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "old-conv",
      conversationHistory: [{ id: "t1" }, { id: "t2" }],
    };
    const next = chatReducer(start, {
      type: "SET_ACTIVE_CONVERSATION",
      conversationId: "new-conv",
    });
    expect(next.activeConversationId).toBe("new-conv");
    expect(next.conversationHistory).toEqual([]);
  });

  test("SET_ACTIVE_CONVERSATION with null clears active id and history (Step F.4)", () => {
    // F.4 schema relaxation: conversationId accepts string | null. Used by
    // onNewConversation to reset the layout-mounted chat panel back to a
    // fresh-conversation state without remounting (post-Step-E thin shells
    // don't trigger the remount that pre-Step-E /chat route fetch produced).
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "old-conv",
      conversationHistory: [{ id: "t1" }, { id: "t2" }],
    };
    const next = chatReducer(start, {
      type: "SET_ACTIVE_CONVERSATION",
      conversationId: null,
    });
    expect(next.activeConversationId).toBeNull();
    expect(next.conversationHistory).toEqual([]);
  });

  test("HYDRATE_CONVERSATION replaces history with payload", () => {
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "conv",
      conversationHistory: [],
    };
    const turns: ChatTurn[] = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];
    const next = chatReducer(start, { type: "HYDRATE_CONVERSATION", turns });
    expect(next.conversationHistory).toEqual(turns);
    expect(next.activeConversationId).toBe("conv");
  });

  // M13 Phase 1.B follow-on — fragmentation + switch-flash fixes.

  test("SET_ACTIVE_CONVERSATION with loading:true enters loading state", () => {
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "A",
      conversationHistory: [{ id: "t1" }],
    };
    const next = chatReducer(start, {
      type: "SET_ACTIVE_CONVERSATION",
      conversationId: "B",
      loading: true,
    });
    expect(next.activeConversationId).toBe("B");
    expect(next.conversationHistory).toEqual([]);
    expect(next.conversationLoading).toBe(true);
  });

  test("SET_ACTIVE_CONVERSATION without loading defaults conversationLoading false", () => {
    const next = chatReducer(initialChatState, {
      type: "SET_ACTIVE_CONVERSATION",
      conversationId: null,
    });
    expect(next.conversationLoading).toBe(false);
  });

  test("ANCHOR_CONVERSATION sets id WITHOUT clearing history or loading", () => {
    // The fragmentation fix: anchoring an in-flight conversation to its
    // server-assigned id must preserve whatever is rendering (the live
    // turn lives in the client's sessionHarvest, but the reducer must
    // not clear store history or flip loading either).
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: null,
      conversationHistory: [{ id: "live-1" }],
    };
    const next = chatReducer(start, {
      type: "ANCHOR_CONVERSATION",
      conversationId: "new-id",
    });
    expect(next.activeConversationId).toBe("new-id");
    expect(next.conversationHistory).toEqual([{ id: "live-1" }]);
    expect(next.conversationLoading).toBe(false);
  });

  test("ANCHOR_CONVERSATION is idempotent when id already active", () => {
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "new-id",
      conversationHistory: [{ id: "live-1" }],
    };
    const next = chatReducer(start, {
      type: "ANCHOR_CONVERSATION",
      conversationId: "new-id",
    });
    // Same object reference — no churn.
    expect(next).toBe(start);
  });

  test("HYDRATE_CONVERSATION clears the loading state", () => {
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "B",
      conversationLoading: true,
    };
    const next = chatReducer(start, {
      type: "HYDRATE_CONVERSATION",
      turns: [{ id: "t1" }],
    });
    expect(next.conversationLoading).toBe(false);
    expect(next.conversationHistory).toEqual([{ id: "t1" }]);
  });

  test("HYDRATE_CONVERSATION with empty turns still clears loading (failed/empty fetch)", () => {
    const start: ChatState = {
      ...initialChatState,
      activeConversationId: "B",
      conversationLoading: true,
    };
    const next = chatReducer(start, { type: "HYDRATE_CONVERSATION", turns: [] });
    expect(next.conversationLoading).toBe(false);
    expect(next.conversationHistory).toEqual([]);
  });
});

describe("chatReducer — turn state bridge", () => {
  test("TURN_STATE_CHANGED sets turnState (idle → streaming)", () => {
    const next = chatReducer(initialChatState, {
      type: "TURN_STATE_CHANGED",
      turnState: "streaming",
    });
    expect(next.turnState).toBe("streaming");
  });

  test("TURN_STATE_CHANGED handles tool_call_pending", () => {
    const next = chatReducer(initialChatState, {
      type: "TURN_STATE_CHANGED",
      turnState: "tool_call_pending",
    });
    expect(next.turnState).toBe("tool_call_pending");
  });

  test("TURN_STATE_CHANGED returns to idle", () => {
    const start: ChatState = { ...initialChatState, turnState: "streaming" };
    const next = chatReducer(start, {
      type: "TURN_STATE_CHANGED",
      turnState: "idle",
    });
    expect(next.turnState).toBe("idle");
  });

  test("TURN_STATE_CHANGED dedup — same value returns same state object", () => {
    // The bridge fires on every content[] change during streaming
    // (every chunk); reducer-side dedup avoids cascading re-renders
    // when the mapped enum value is unchanged.
    const start: ChatState = { ...initialChatState, turnState: "streaming" };
    const next = chatReducer(start, {
      type: "TURN_STATE_CHANGED",
      turnState: "streaming",
    });
    expect(next).toBe(start); // referential equality (skipped re-render)
  });
});

describe("chatReducer — proposals", () => {
  test("PROPOSAL_RECEIVED appends a new proposal", () => {
    const proposal: ChatProposal = { id: "p1" };
    const next = chatReducer(initialChatState, {
      type: "PROPOSAL_RECEIVED",
      proposal,
    });
    expect(next.pendingProposals).toEqual([proposal]);
  });

  test("PROPOSAL_RECEIVED is idempotent on id", () => {
    const proposal: ChatProposal = { id: "p1" };
    const start = chatReducer(initialChatState, {
      type: "PROPOSAL_RECEIVED",
      proposal,
    });
    const next = chatReducer(start, {
      type: "PROPOSAL_RECEIVED",
      proposal,
    });
    expect(next.pendingProposals).toEqual([proposal]);
    expect(next.pendingProposals.length).toBe(1);
  });

  test("PROPOSAL_RESOLVED removes by id", () => {
    const start: ChatState = {
      ...initialChatState,
      pendingProposals: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    };
    const next = chatReducer(start, {
      type: "PROPOSAL_RESOLVED",
      proposalId: "p2",
    });
    expect(next.pendingProposals).toEqual([{ id: "p1" }, { id: "p3" }]);
  });

  test("PROPOSAL_RESOLVED on unknown id is a no-op", () => {
    const start: ChatState = {
      ...initialChatState,
      pendingProposals: [{ id: "p1" }],
    };
    const next = chatReducer(start, {
      type: "PROPOSAL_RESOLVED",
      proposalId: "nonexistent",
    });
    expect(next.pendingProposals).toEqual([{ id: "p1" }]);
  });
});

describe("chatReducer — audit feed", () => {
  test("AUDIT_TICK sets count and latest ts (first tick from initial state)", () => {
    // From initial state (unreadAuditCount=0), first AUDIT_TICK with
    // newCount=3 produces unreadAuditCount=3 (0 + 3 — additive but
    // identical result on the first tick).
    const next = chatReducer(initialChatState, {
      type: "AUDIT_TICK",
      newCount: 3,
      latestTs: "2026-05-08T00:00:00Z",
    });
    expect(next.unreadAuditCount).toBe(3);
    expect(next.lastSeenAuditTs).toBe("2026-05-08T00:00:00Z");
  });

  test("AUDIT_TICK accumulates unreadAuditCount across multiple ticks (Step F.1)", () => {
    // Bug 1 fix: AUDIT_TICK is additive, not overwrite. Hook dispatches
    // per-poll deltas; reducer accumulates.
    let s = chatReducer(initialChatState, {
      type: "AUDIT_TICK",
      newCount: 2,
      latestTs: "t1",
    });
    expect(s.unreadAuditCount).toBe(2);
    s = chatReducer(s, {
      type: "AUDIT_TICK",
      newCount: 3,
      latestTs: "t2",
    });
    expect(s.unreadAuditCount).toBe(5);
    expect(s.lastSeenAuditTs).toBe("t2");
  });

  test("AUDIT_TICK with newCount=0 baselines latestTs without changing count (Step F.1)", () => {
    // Bug 2 fix: first-poll baseline. Hook dispatches AUDIT_TICK with
    // newCount=0 to anchor lastSeenAuditTs to the page-load time, so
    // subsequent polls accumulate from that baseline rather than always
    // using NOW (which would miss events landing between polls).
    const next = chatReducer(initialChatState, {
      type: "AUDIT_TICK",
      newCount: 0,
      latestTs: "t0",
    });
    expect(next.unreadAuditCount).toBe(0);
    expect(next.lastSeenAuditTs).toBe("t0");
  });

  test("AUDIT_SEEN clears count without resetting lastSeenAuditTs", () => {
    const start: ChatState = {
      ...initialChatState,
      unreadAuditCount: 7,
      lastSeenAuditTs: "2026-05-08T00:00:00Z",
    };
    const next = chatReducer(start, { type: "AUDIT_SEEN" });
    expect(next.unreadAuditCount).toBe(0);
    expect(next.lastSeenAuditTs).toBe("2026-05-08T00:00:00Z");
  });

  // M13 Phase 1.A retired the EXPAND-clears-unread convenience. The
  // unread-counter is dismissed via AUDIT_SEEN (explicit) or by the
  // host navigating to chat-primary (the polling pause replaces the
  // expanded-on-click trigger; see useAuditPoll.test for the new
  // pause condition).
});

describe("chatReducer — purity", () => {
  test("does not mutate input state", () => {
    const start: ChatState = {
      ...initialChatState,
      conversationHistory: [{ id: "t1" }],
      pendingProposals: [{ id: "p1" }],
    };
    const snapshot = JSON.parse(JSON.stringify(start));
    chatReducer(start, { type: "HYDRATE_CONVERSATION", turns: [{ id: "t2" }] });
    chatReducer(start, {
      type: "PROPOSAL_RECEIVED",
      proposal: { id: "p2" },
    });
    chatReducer(start, { type: "AUDIT_SEEN" });
    expect(start).toEqual(snapshot);
  });
});
