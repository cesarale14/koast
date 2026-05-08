"use client";

/**
 * ChatClient — the live orchestrator for the chat shell.
 *
 * Composition (per components.md hierarchy + D-Q6):
 *   <ChatShell>
 *     <Rail>     // grouped conversation list, RailHead/List/Foot
 *     <Surface>  // Topbar + scrolling turn list + Composer (+ optional RespondingRow)
 *
 * Inputs are server-loaded (D-Q8: listConversations + loadTurnsForConversation
 * called from the page server components). The orchestrator owns the live
 * SSE state machine via useAgentTurn, the composer's input value, and the
 * "completed-this-session" turn harvest.
 *
 * Conversation grouping rules (D-F2 / CF§10.9): "Today / Yesterday /
 * This week / Older". "This week" = rolling last-7-days minus today/yest.
 *
 * The composer state machine collapses 4 visual states to 3 inputs from
 * here (empty/typing/sending+blocked) — `sending` is a transient before
 * the first SSE byte; once `turn_started` lands the state is `blocked`
 * until done/error/refusal. We use `blocked` for both per the visual spec.
 */

import { type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatShell } from "./ChatShell";
import styles from "./ChatShell.module.css";
import { Rail, type ConversationGroup } from "./Rail";
import { Surface } from "./Surface";
import { Topbar } from "./Topbar";
import { Turn } from "./Turn";
import { Meta } from "./Meta";
import { UserMessage } from "./UserMessage";
import { KoastMessage } from "./KoastMessage";
import { ToolCall } from "./ToolCall";
import { Composer, type ComposerState } from "./Composer";
import { RespondingRow } from "./RespondingRow";
import { EmptyState } from "./EmptyState";
import { ErrorBlock } from "./ErrorBlock";
import { RefusalTag } from "./RefusalTag";
import { MemoryArtifact, type FactSpan } from "./MemoryArtifact";
import {
  GuestMessageProposal,
  type GuestMessageProposalState,
} from "./GuestMessageProposal";
import { useAgentTurn } from "@/lib/agent-client/useAgentTurn";
import type { PropertyOption } from "./PropertyContext";
import { useChatStoreOptional, type TurnState as ChatTurnState } from "./ChatStore";

type UITurnLite = {
  id: string;
  role: "user" | "koast";
  created_at: string;
  text: string | null;
  tool_calls: Array<{
    tool_use_id: string;
    tool_name: string;
    input_summary: string;
    success: boolean;
    result_summary: string;
  }>;
  refusal: { reason: string; suggested_next_step: string | null } | null;
  /**
   * M6 D23 + M7 D45 — artifacts attached to this turn (history-visible
   * states: emitted | edited | confirmed | superseded). 'dismissed' is
   * filtered server-side. M7 §6 amendment: post-Channex-failure
   * artifacts stay state='emitted' but carry commit_metadata.last_error
   * — the UI derives 'failed' visual from that.
   */
  pendingArtifacts?: Array<{
    artifact_id: string;
    audit_log_id: string;
    kind: string;
    payload: Record<string, unknown>;
    created_at: string;
    supersedes: string | null;
    state: "emitted" | "edited" | "confirmed" | "superseded";
    commit_metadata: Record<string, unknown> | null;
    /** M7 — derived canonical channel for guest_message_proposal. */
    derived_channel?: string;
  }>;
};

type ConvListItem = {
  id: string;
  last_turn_at: string;
  preview: string;
  propertyName: string;
};

export type ChatClientProps = {
  /** Server-provided initial list (rail). M8 C8 Step D: optional with default
   * `[]` so layout-level mount works without server prefetching. Step E
   * thin shells dispatch HYDRATE_CONVERSATION; rail data fetches lazily. */
  conversations?: ConvListItem[];
  /** Currently-active conversation id; null on the landing /chat page. */
  activeConversationId?: string | null;
  /** Server-provided history for the active conversation. Empty on landing. */
  history?: UITurnLite[];
  /** Host display info for the rail foot + user-message avatars. M8 C8
   * Step D: optional. Layout-level mount uses a placeholder until session
   * info is wired through (post-Step-E follow-up). */
  user?: { initials: string; name: string; org: string };
  /** Server-provided list of host properties for the topbar dropdown (D18). */
  properties?: PropertyOption[];
  /** Initial property selection id — typically null on landing; restored by sessionStorage hint. */
  initialPropertyId?: string | null;
};

/** Format an ISO timestamp into the rail's "2:14 pm" / "mon" / "sun" / "May 2" label. */
function formatRailTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) {
    return t
      .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      .toLowerCase();
  }
  const diffDays = Math.floor((now.getTime() - t.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return t.toLocaleDateString(undefined, { weekday: "short" }).toLowerCase();
  }
  return t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bucketLabel(iso: string, now: Date = new Date()): "Today" | "Yesterday" | "This week" | "Older" {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "Older";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tDay = new Date(t);
  tDay.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - tDay.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Older";
}

function groupConversations(
  list: ConvListItem[],
  now: Date,
): ConversationGroup[] {
  const buckets = new Map<string, ConversationGroup>();
  const order: Array<"Today" | "Yesterday" | "This week" | "Older"> = [
    "Today",
    "Yesterday",
    "This week",
    "Older",
  ];
  for (const label of order) buckets.set(label, { label, items: [] });
  for (const c of list) {
    const label = bucketLabel(c.last_turn_at, now);
    buckets.get(label)!.items.push({
      id: c.id,
      name: c.propertyName,
      meta: c.preview,
      timeLabel: formatRailTime(c.last_turn_at, now),
    });
  }
  return order.map((l) => buckets.get(l)!).filter((g) => g.items.length > 0);
}

/**
 * Parse the wire-level "key=value · key=value" input_summary back into
 * the Record<string, string> shape ToolCall consumes. Tolerates malformed
 * pieces by skipping them.
 */
function parseParams(raw: string | null | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const parts = raw.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k.length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function formatTurnStamp(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}

/**
 * Map a write_memory_fact payload to the alternating key/val FactSpan
 * shape MemoryArtifact renders. v1's only artifact kind is
 * property_knowledge_confirmation (M6 §5); future kinds get their own
 * branches when they land.
 */
function payloadToFactSpans(payload: Record<string, unknown> | { sub_entity_type?: string; attribute?: string; fact_value?: unknown }): FactSpan[] {
  const subEntityType = (payload as { sub_entity_type?: unknown }).sub_entity_type;
  const attribute = (payload as { attribute?: unknown }).attribute;
  const factValue = (payload as { fact_value?: unknown }).fact_value;
  const valueText =
    typeof factValue === "string"
      ? factValue
      : factValue === null || factValue === undefined
        ? ""
        : JSON.stringify(factValue);
  const spans: FactSpan[] = [];
  if (typeof subEntityType === "string" && subEntityType.length > 0) {
    spans.push({ kind: "key", text: subEntityType });
  }
  if (typeof attribute === "string" && attribute.length > 0) {
    spans.push({ kind: "key", text: attribute });
  }
  if (valueText.length > 0) {
    spans.push({ kind: "val", text: valueText });
  }
  return spans;
}

/** Key for the per-host last-selected property (sessionStorage). */
const PROPERTY_PREF_KEY = "koast.chat.activePropertyId";

export function ChatClient({
  conversations = [],
  activeConversationId: propsActiveConversationId = null,
  history: propsHistory = [],
  user = { initials: "K", name: "Host", org: "koast" },
  properties = [],
  initialPropertyId = null,
}: ChatClientProps) {
  const router = useRouter();
  const { state, isStreaming, submit, cancel, reset } = useAgentTurn();

  // M8 C8 Step C — reflect useAgentTurn's TurnState into the chat store
  // per (i) MAP DOWN locked mapping. The store's 3-state enum
  // (idle | streaming | tool_call_pending) is fed from useAgentTurn's
  // 5-state status: terminal states (done/error/refusal) and idle all
  // collapse to "idle" from the store's perspective; "tool_call_pending"
  // is derived by inspecting content[] for an in-flight tool block while
  // status === "streaming".
  //
  // Optional store handles the pre-Step-D transitional state where
  // ChatClient may be in a tree without ChatStoreProvider (e.g., the
  // /chat route still mounts ChatClient directly until Step D inverts
  // the dashboard layout). Null context → no-op.
  //
  // Reducer-side dedup on TURN_STATE_CHANGED prevents wasted dispatches
  // when content[] changes (every chunk) but the mapped enum is unchanged.
  const chatStore = useChatStoreOptional();
  const chatStoreDispatch = chatStore?.dispatch;

  // M8 C8 Step E — effective conversation state. Prefer store-driven
  // values (hydrated by /chat/[conversation_id] server-fetch +
  // ConversationHydrator dispatches) when the store is mounted; fall
  // back to props for the transitional state where ChatClient is in a
  // tree without ChatStoreProvider. After Step D layout invert, store
  // is always mounted at dashboard scope; props are residual.
  const activeConversationId =
    chatStore?.state.activeConversationId ?? propsActiveConversationId;
  const history: UITurnLite[] =
    chatStore && chatStore.state.conversationHistory.length > 0
      ? (chatStore.state.conversationHistory as UITurnLite[])
      : propsHistory;

  useEffect(() => {
    if (!chatStoreDispatch) return;
    let mapped: ChatTurnState;
    if (state.status === "streaming") {
      const hasInFlightTool = state.content.some(
        (b) => b.kind === "tool" && b.status === "in-flight",
      );
      mapped = hasInFlightTool ? "tool_call_pending" : "streaming";
    } else {
      mapped = "idle";
    }
    chatStoreDispatch({ type: "TURN_STATE_CHANGED", turnState: mapped });
  }, [state.status, state.content, chatStoreDispatch]);

  const [draft, setDraft] = useState("");
  /** Turns harvested from the live stream during this session (in addition to server-loaded history). */
  const [sessionHarvest, setSessionHarvest] = useState<UITurnLite[]>([]);
  /** The user-message text we just sent — kept so we can render it as a Turn while koast streams. */
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  /** Once the live stream resolves to a real conversation_id, navigate to /chat/{id}. */
  const navigatedRef = useRef<string | null>(null);
  /** Active property selection (D18) — drives ui_context.active_property_id on submit. */
  const [activePropertyId, setActivePropertyId] = useState<string | null>(
    initialPropertyId,
  );
  const [propertyMenuOpen, setPropertyMenuOpen] = useState(false);
  // Mobile drawer state (visible only at <768px via media query). Closed
  // by default; toggled via Topbar hamburger; auto-closes on conversation
  // select / scrim tap / swipe-left-on-drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Auto-scroll anchor (CF§10.8) — refs the scroll container so we can stick to bottom while streaming. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef<boolean>(true);

  /**
   * M6 Issue C — interactive tool-call expansion. ToolCall.tsx's
   * component spec includes expanded/onToggleExpand/resultBody props
   * (chevron renders, isInteractive when state='completed'), but M5's
   * ChatClient never wired them. Cesar's CP4 observation: tool-call
   * rows render with chevrons but clicks did nothing. Wiring it here
   * with a Set<tool_use_id> of currently-expanded rows + a toggle
   * handler. Live + history paths both consume.
   */
  const [expandedTools, setExpandedTools] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const toggleToolExpanded = useCallback((toolUseId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolUseId)) next.delete(toolUseId);
      else next.add(toolUseId);
      return next;
    });
  }, []);

  /**
   * M6 D33 — KoastMark milestone trigger. When the host approves a
   * memory write, we receive `action_completed` (action_kind=
   * 'memory_write') via the artifact endpoint's SSE response (M7 D39
   * rename of memory_write_saved) and flip the most-recent koast turn's
   * avatar to 'milestone' for ~2s (matches k-milestone-* keyframe
   * duration). prefers-reduced-motion suppresses the trigger entirely
   * (data-state stays idle) so reduced-motion users get the saved-
   * state semantic transition without the visual celebration.
   */
  const [milestoneActive, setMilestoneActive] = useState(false);
  const fireMilestone = useCallback(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    setMilestoneActive(true);
    window.setTimeout(() => setMilestoneActive(false), 2000);
  }, []);

  // Restore last-selected property from sessionStorage on mount
  // (preserves selection across /chat → /chat/[id] navigation).
  useEffect(() => {
    if (initialPropertyId !== null) return;
    try {
      const stored = sessionStorage.getItem(PROPERTY_PREF_KEY);
      if (stored && properties.some((p) => p.id === stored)) {
        setActivePropertyId(stored);
      }
    } catch {
      /* sessionStorage unavailable — non-fatal */
    }
  }, [initialPropertyId, properties]);

  const persistActiveProperty = useCallback((id: string | null) => {
    setActivePropertyId(id);
    try {
      if (id) sessionStorage.setItem(PROPERTY_PREF_KEY, id);
      else sessionStorage.removeItem(PROPERTY_PREF_KEY);
    } catch {
      /* non-fatal */
    }
  }, []);

  /**
   * M6 D35 — host-action handler for MemoryArtifact Save/Discard.
   * POST /api/agent/artifact; on approve, consumes the SSE stream
   * (action_completed + done); on discard, consumes the JSON ack.
   * For step 18 the resulting state isn't fed back into the reducer
   * directly — page refresh re-reads the substrate via
   * loadTurnsForConversation. Future iteration: consume the saved
   * event back into useAgentTurn or a sibling hook so the in-memory
   * state stays live without refresh.
   */
  const handleArtifactAction = useCallback(
    async (auditLogId: string, action: "approve" | "discard") => {
      try {
        const res = await fetch("/api/agent/artifact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audit_id: auditLogId, action }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: res.statusText }));
          console.error("[chat-client] artifact action failed", action, errBody);
          return;
        }
        if (action === "approve") {
          // SSE response — drain the stream and watch for the
          // action_completed event so we can fire the milestone
          // animation before refreshing. Each SSE record is
          // `data: <json>\n\n` per the protocol.
          const reader = res.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let buf = "";
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              // Process any complete event records (terminated by \n\n).
              let sep = buf.indexOf("\n\n");
              while (sep !== -1) {
                const record = buf.slice(0, sep).trim();
                buf = buf.slice(sep + 2);
                if (record.startsWith("data: ")) {
                  try {
                    const event = JSON.parse(record.slice(6));
                    // M7 D39: milestone fires only on the memory_write
                    // branch of action_completed; guest_message uses no
                    // motion (per conventions §11 — sent visual is the
                    // signal, not a deposit animation).
                    if (
                      event &&
                      event.type === "action_completed" &&
                      event.action_kind === "memory_write"
                    ) {
                      fireMilestone();
                    }
                  } catch {
                    /* malformed; ignore */
                  }
                }
                sep = buf.indexOf("\n\n");
              }
            }
          }
          // Defer refresh past the milestone animation so the
          // animation visibly completes before the page re-renders
          // (the new render comes from the substrate state, not
          // the optimistic in-memory state).
          window.setTimeout(() => router.refresh(), 2000);
          return;
        }
        // Discard path: refresh immediately — no animation to honor.
        router.refresh();
      } catch (err) {
        console.error("[chat-client] artifact action threw", err);
      }
    },
    [router],
  );

  /**
   * M7 D38 — host-action handler for GuestMessageProposal Edit-Save.
   * POSTs action='edit' with edited_text; the route updates
   * agent_artifacts.payload.edited_text + state='edited' (committed_at
   * stays NULL — 'edited' is non-terminal). On success, router.refresh
   * picks up the new state from the substrate (CF #40 — in-place
   * mutation deferred). Errors logged to console; no toast (M5 anti-
   * pattern: no toast errors).
   */
  const handleArtifactEdit = useCallback(
    async (auditLogId: string, editedText: string) => {
      try {
        const res = await fetch("/api/agent/artifact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audit_id: auditLogId,
            action: "edit",
            edited_text: editedText,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: res.statusText }));
          console.error("[chat-client] artifact edit failed", errBody);
          return;
        }
        // Edit returns JSON {ok, state, edited_text}; pull state into
        // the substrate via router.refresh.
        router.refresh();
      } catch (err) {
        console.error("[chat-client] artifact edit threw", err);
      }
    },
    [router],
  );

  // Group rail data; recompute when the list changes.
  const groups = useMemo(
    () => groupConversations(conversations, new Date()),
    [conversations],
  );

  // Harvest completed turns + auto-navigate when a fresh conversation is born.
  useEffect(() => {
    if (state.status === "streaming") return;
    if (state.status === "idle") return;
    // done | error | refusal — produce harvested turn(s) and reset.
    const stamp = new Date().toISOString();
    const harvested: UITurnLite[] = [];
    if (pendingUserText) {
      harvested.push({
        id: `live-user-${stamp}`,
        role: "user",
        created_at: stamp,
        text: pendingUserText,
        tool_calls: [],
        refusal: null,
      });
    }
    // M6 fix (Issue A — propose-flow harvest gap): preserve
    // memory_artifact ContentBlocks that landed via action_proposed
    // events during streaming. Without this, the artifact disappears
    // post-stream until a router.refresh, which only fires on Save/
    // Discard — propose-only turns would lose the artifact visually.
    // M7 extends the same harvest to guest_message_artifact blocks.
    type LiveArtifact = {
      artifact_id: string;
      audit_log_id: string;
      kind: string;
      payload: Record<string, unknown>;
      created_at: string;
      supersedes: string | null;
      state: "emitted" | "edited" | "confirmed" | "superseded";
      commit_metadata: Record<string, unknown> | null;
    };
    const liveArtifacts: LiveArtifact[] = [];
    for (const b of state.content) {
      if (b.kind === "memory_artifact") {
        const dbState =
          b.state === "pending"
            ? "emitted"
            : b.state === "saved"
              ? "confirmed"
              : b.state === "superseded"
                ? "superseded"
                : null; // 'failed' shouldn't reach harvest; skip
        if (dbState === null) continue;
        liveArtifacts.push({
          artifact_id: b.artifact_id,
          audit_log_id: b.audit_log_id,
          kind: "property_knowledge_confirmation",
          payload: b.payload as Record<string, unknown>,
          created_at: stamp,
          supersedes: null,
          state: dbState,
          commit_metadata: null,
        });
      } else if (b.kind === "guest_message_artifact") {
        // Map reducer's GuestMessageArtifactState → agent_artifacts.state
        // shape. M7 §6 amendment: 'failed' substrate state stays
        // 'emitted' but commit_metadata.last_error carries the signal.
        const dbState: "emitted" | "edited" | "confirmed" =
          b.state === "sent"
            ? "confirmed"
            : b.state === "edited"
              ? "edited"
              : "emitted"; // pending OR failed → 'emitted'
        const commitMetadata: Record<string, unknown> = {};
        if (b.channex_message_id) {
          commitMetadata.channex_message_id = b.channex_message_id;
        }
        if (b.error) {
          commitMetadata.last_error = { message: b.error.message };
        }
        liveArtifacts.push({
          artifact_id: b.artifact_id,
          audit_log_id: b.audit_log_id,
          kind: "guest_message_proposal",
          payload: b.payload as Record<string, unknown>,
          created_at: stamp,
          supersedes: null,
          state: dbState,
          commit_metadata:
            Object.keys(commitMetadata).length > 0 ? commitMetadata : null,
        });
      }
    }

    const koastTurn: UITurnLite = {
      id: state.turn_id ?? `live-koast-${stamp}`,
      role: "koast",
      created_at: stamp,
      text: state.content
        .filter((b) => b.kind === "paragraph")
        .map((b) => (b as { kind: "paragraph"; text: string }).text)
        .join("")
        .trim() || null,
      tool_calls: state.content
        .filter((b) => b.kind === "tool" && b.status === "completed")
        .map((b) => {
          const tc = b as Extract<typeof b, { kind: "tool" }>;
          return {
            tool_use_id: tc.tool_use_id,
            tool_name: tc.tool_name,
            input_summary: tc.input_summary,
            success: tc.success ?? false,
            result_summary: tc.result_summary ?? "",
          };
        }),
      refusal: state.refusal,
      pendingArtifacts: liveArtifacts.length > 0 ? liveArtifacts : undefined,
    };
    harvested.push(koastTurn);
    setSessionHarvest((prev) => [...prev, ...harvested]);
    setPendingUserText(null);

    // First completed turn on /chat (no active id) → navigate to the new conversation URL.
    if (
      !activeConversationId &&
      state.conversation_id &&
      navigatedRef.current !== state.conversation_id
    ) {
      navigatedRef.current = state.conversation_id;
      router.replace(`/chat/${state.conversation_id}`);
    }

    reset();
    // Only fire on status transitions, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const onSubmit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    setPendingUserText(text);
    setDraft("");
    // Stick to bottom on submit — user just took an action that produces new content.
    stickToBottomRef.current = true;
    void submit(text, {
      conversation_id: activeConversationId,
      ui_context: activePropertyId
        ? { active_property_id: activePropertyId }
        : undefined,
    });
  }, [draft, submit, activeConversationId, activePropertyId]);

  const onEscape = useCallback(() => {
    cancel();
  }, [cancel]);

  const onSelectConversation = useCallback(
    (id: string) => {
      // Auto-close mobile drawer on selection (no-op on desktop where
      // the drawer state isn't visually expressed).
      setDrawerOpen(false);
      router.push(`/chat/${id}`);
    },
    [router],
  );

  const onNewConversation = useCallback(() => {
    setDrawerOpen(false);
    router.push("/chat");
  }, [router]);

  // Swipe-left-on-drawer to close. Threshold = 60px leftward delta;
  // disabled if user is mid-vertical-scroll (delta-y > delta-x).
  const drawerTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onDrawerTouchStart = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    drawerTouchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onDrawerTouchEnd = useCallback((e: TouchEvent) => {
    const start = drawerTouchStartRef.current;
    drawerTouchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dx < -60 && Math.abs(dx) > dy) {
      setDrawerOpen(false);
    }
  }, []);

  const composerState: ComposerState = (() => {
    if (isStreaming) return "blocked";
    if (draft.length > 0) return "typing";
    return "empty";
  })();

  // CF§10.8 — auto-scroll rule: stick to bottom while streaming IF the
  // user is within ~120px of bottom. Once they scroll up further, stop
  // auto-following so they can read earlier turns without being yanked.
  // Re-enables on submit (handled in onSubmit).
  const SCROLL_STICKY_THRESHOLD_PX = 120;
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickToBottomRef.current = distanceFromBottom <= SCROLL_STICKY_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
    // Re-run on every state change that affects rendered content length.
  }, [state.content, state.status, sessionHarvest.length, pendingUserText]);

  // Active property → topbar pill copy.
  const activeProperty = properties.find((p) => p.id === activePropertyId);
  const propertyForTopbar = activeProperty
    ? { name: activeProperty.name, meta: activeProperty.meta || undefined }
    : undefined;

  const hasAnyTurns =
    history.length > 0 || sessionHarvest.length > 0 || pendingUserText !== null;

  // M8 C8 Step D — visibility wrapper. When ChatStoreProvider is mounted
  // (Step D layout invert) and the chat panel is collapsed, hide ChatClient
  // via display:none. This preserves React state (Composer input,
  // sessionHarvest, etc.) across collapse/expand. When no store is in tree
  // (legacy /chat route mount, pre-Step-D), render normally.
  const isHiddenByStore =
    chatStore !== null && chatStore.state.expanded === false;

  return (
    <div
      style={
        isHiddenByStore
          ? { display: "none" }
          : { display: "contents" }
      }
    >
    <ChatShell>
      <div
        className={`${styles["rail-wrap"]}${drawerOpen ? ` ${styles["is-open"]}` : ""}`}
        onTouchStart={onDrawerTouchStart}
        onTouchEnd={onDrawerTouchEnd}
      >
        <Rail
          groups={groups}
          user={user}
          activeConversationId={activeConversationId ?? undefined}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      </div>
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close conversations"
          className={styles.scrim}
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <Surface
        scrollRef={scrollRef}
        onScroll={onScroll}
        topbar={
          <Topbar
            property={propertyForTopbar}
            propertyOptions={properties}
            selectedPropertyId={activePropertyId}
            propertyMenuOpen={propertyMenuOpen}
            onTogglePropertyMenu={() => setPropertyMenuOpen((v) => !v)}
            onClosePropertyMenu={() => setPropertyMenuOpen(false)}
            onSelectProperty={(id) => persistActiveProperty(id)}
            onNewThread={onNewConversation}
            onToggleDrawer={() => setDrawerOpen((v) => !v)}
            onDismiss={
              chatStoreDispatch
                ? () => chatStoreDispatch({ type: "COLLAPSE" })
                : undefined
            }
          />
        }
        composer={
          <Composer
            state={composerState}
            value={draft}
            onChange={setDraft}
            onSubmit={onSubmit}
            onEscape={onEscape}
          />
        }
        responding={isStreaming ? <RespondingRow onStop={cancel} /> : undefined}
      >
        {!hasAnyTurns ? (
          <EmptyState />
        ) : (
          <>
            {(() => {
              // Compute the index of the most-recent koast turn so the
              // milestone animation fires on the right avatar (last
              // koast turn across history + sessionHarvest combined).
              //
              // M7 dedup (post-CP4 smoke fix): when router.refresh()
              // re-loads history after a host action (Approve / Edit /
              // Discard), the same turn can appear in BOTH `history`
              // (refreshed substrate) AND `sessionHarvest` (stale local
              // copy from the original stream). Duplicate `key={t.id}`
              // produces undefined React reconciliation; the smoke
              // surfaced sessionHarvest's stale 'pending' artifact
              // winning over history's 'confirmed' state. Iterate
              // history first, drop sessionHarvest entries whose turn
              // id already appeared — history is the authoritative
              // source post-refresh.
              const seen = new Set<string>();
              const all: UITurnLite[] = [];
              for (const t of history) {
                if (seen.has(t.id)) continue;
                seen.add(t.id);
                all.push(t);
              }
              for (const t of sessionHarvest) {
                if (seen.has(t.id)) continue;
                seen.add(t.id);
                all.push(t);
              }
              let lastKoastIdx = -1;
              for (let i = all.length - 1; i >= 0; i--) {
                if (all[i].role === "koast") {
                  lastKoastIdx = i;
                  break;
                }
              }
              return all.map((t, idx) => (
                <HistoryTurnView
                  key={t.id}
                  turn={t}
                  userInitials={user.initials}
                  onArtifactAction={handleArtifactAction}
                  onArtifactEdit={handleArtifactEdit}
                  avatarMilestone={milestoneActive && idx === lastKoastIdx}
                  expandedTools={expandedTools}
                  onToggleToolExpanded={toggleToolExpanded}
                />
              ));
            })()}
            {pendingUserText !== null && (
              <Turn
                role="user"
                meta={
                  <Meta
                    role="user"
                    who="You"
                    time={formatTurnStamp(new Date().toISOString())}
                    initials={user.initials}
                  />
                }
              >
                <UserMessage>{pendingUserText}</UserMessage>
              </Turn>
            )}
            {isStreaming && (
              <Turn
                role="koast"
                meta={
                  <Meta
                    role="koast"
                    who="Koast"
                    time={formatTurnStamp(new Date().toISOString())}
                    avatarState="active"
                  />
                }
              >
                <KoastMessage>
                  {state.content.map((block, i) => {
                    if (block.kind === "paragraph") {
                      // Streaming paragraphs render as plain text; final harvest will normalize.
                      return <p key={i}>{block.text}</p>;
                    }
                    if (block.kind === "guest_message_artifact") {
                      // M7 D43 — live GuestMessageProposal rendering
                      // from the turnReducer's guest_message_artifact
                      // block (built from action_proposed{action_kind:
                      // 'guest_message'}). State maps directly: reducer
                      // already uses pending|edited|sent|failed.
                      const gm = block;
                      return (
                        <GuestMessageProposal
                          key={`guest-msg-${gm.artifact_id}`}
                          state={gm.state}
                          messageText={gm.payload.message_text}
                          editedText={gm.payload.edited_text}
                          channexMessageId={gm.channex_message_id}
                          errorMessage={gm.error?.message}
                          onApprove={
                            gm.state === "pending" || gm.state === "edited"
                              ? () =>
                                  handleArtifactAction(
                                    gm.audit_log_id,
                                    "approve",
                                  )
                              : undefined
                          }
                          onEdit={
                            gm.state === "pending"
                              ? () => {
                                  /* component-local edit toggle; Save
                                     fires onSaveEdit below */
                                }
                              : undefined
                          }
                          onDiscard={
                            gm.state === "pending" ||
                            gm.state === "edited" ||
                            gm.state === "failed"
                              ? () =>
                                  handleArtifactAction(
                                    gm.audit_log_id,
                                    "discard",
                                  )
                              : undefined
                          }
                          onRetry={
                            gm.state === "failed"
                              ? () =>
                                  handleArtifactAction(
                                    gm.audit_log_id,
                                    "approve",
                                  )
                              : undefined
                          }
                          onSaveEdit={
                            gm.state === "pending"
                              ? (newText) =>
                                  handleArtifactEdit(gm.audit_log_id, newText)
                              : undefined
                          }
                        />
                      );
                    }
                    if (block.kind === "tool") {
                      const failed =
                        block.status === "failed" ||
                        (block.status === "completed" && block.success === false);
                      const tcState =
                        block.status === "in-flight"
                          ? "in-flight"
                          : failed
                            ? "failed"
                            : "completed";
                      return (
                        <ToolCall
                          key={block.tool_use_id}
                          name={block.tool_name}
                          params={parseParams(block.input_summary)}
                          state={tcState}
                          durationMs={block.duration_ms}
                          expanded={expandedTools.has(block.tool_use_id)}
                          onToggleExpand={() => toggleToolExpanded(block.tool_use_id)}
                          resultBody={
                            block.result_summary ? (
                              <pre className="whitespace-pre-wrap">{block.result_summary}</pre>
                            ) : undefined
                          }
                        />
                      );
                    }
                    // M6 D35: live memory_artifact block from the
                    // turnReducer. Save/Discard fire POST /api/agent/artifact;
                    // the response stream's action_completed event is
                    // consumed back into the same reducer (or the saved
                    // state lands directly via fetch ack on the saved ack).
                    return (
                      <MemoryArtifact
                        key={`memory-${block.artifact_id}`}
                        state={block.state}
                        fact={payloadToFactSpans(block.payload)}
                        onSave={
                          block.state === "pending"
                            ? () => handleArtifactAction(block.audit_log_id, "approve")
                            : undefined
                        }
                        onDiscard={
                          block.state === "pending"
                            ? () => handleArtifactAction(block.audit_log_id, "discard")
                            : undefined
                        }
                        errorMessage={block.error?.message}
                      />
                    );
                  })}
                  {state.status === "error" && state.error && (
                    <ErrorBlock
                      kind="connection"
                      message={state.error.message}
                      onDismiss={reset}
                    />
                  )}
                </KoastMessage>
              </Turn>
            )}
          </>
        )}
      </Surface>
    </ChatShell>
    </div>
  );
}

function HistoryTurnView({
  turn,
  userInitials,
  onArtifactAction,
  onArtifactEdit,
  avatarMilestone = false,
  expandedTools,
  onToggleToolExpanded,
}: {
  turn: UITurnLite;
  userInitials: string;
  onArtifactAction?: (auditLogId: string, action: "approve" | "discard") => void;
  /** M7 D38 — host-edit handler for guest_message_proposal artifacts. */
  onArtifactEdit?: (auditLogId: string, editedText: string) => void;
  /** When true and turn.role='koast', flips the avatar to data-state='milestone'. */
  avatarMilestone?: boolean;
  /** M6 Issue C — set of currently-expanded tool_use_ids. */
  expandedTools?: Set<string>;
  /** M6 Issue C — toggle expansion for a tool_use_id. */
  onToggleToolExpanded?: (toolUseId: string) => void;
}) {
  if (turn.role === "user") {
    return (
      <Turn
        role="user"
        meta={
          <Meta
            role="user"
            who="You"
            time={formatTurnStamp(turn.created_at)}
            initials={userInitials}
          />
        }
      >
        <UserMessage>{turn.text ?? ""}</UserMessage>
      </Turn>
    );
  }
  return (
    <Turn
      role="koast"
      meta={
        <Meta
          role="koast"
          who="Koast"
          time={formatTurnStamp(turn.created_at)}
          avatarState={avatarMilestone ? "milestone" : "idle"}
        />
      }
    >
      <KoastMessage>
        {turn.tool_calls.map((tc) => (
          <ToolCall
            key={tc.tool_use_id}
            name={tc.tool_name}
            params={parseParams(tc.input_summary)}
            state={tc.success ? "completed" : "failed"}
            expanded={expandedTools?.has(tc.tool_use_id) ?? false}
            onToggleExpand={
              onToggleToolExpanded
                ? () => onToggleToolExpanded(tc.tool_use_id)
                : undefined
            }
            resultBody={
              tc.result_summary ? (
                <pre className="whitespace-pre-wrap">{tc.result_summary}</pre>
              ) : undefined
            }
          />
        ))}
        {turn.text && <p>{turn.text}</p>}
        {(turn.pendingArtifacts ?? []).map((a) => {
          // M7 D43 — kind-specific component routing. M6's only kind
          // was 'property_knowledge_confirmation' (MemoryArtifact);
          // M7 adds 'guest_message_proposal' (GuestMessageProposal).
          if (a.kind === "guest_message_proposal") {
            // M7 §11 amendment: derive 'failed' from
            // commit_metadata.last_error presence (substrate state
            // stays 'emitted' on Channex failure).
            const lastError = (a.commit_metadata as { last_error?: { message?: string } } | null)
              ?.last_error;
            const channexMessageId = (a.commit_metadata as { channex_message_id?: string } | null)
              ?.channex_message_id;
            let gmState: GuestMessageProposalState;
            if (a.state === "confirmed") {
              gmState = "sent";
            } else if (lastError) {
              gmState = "failed";
            } else if (a.state === "edited") {
              gmState = "edited";
            } else {
              gmState = "pending";
            }
            const payload = a.payload as {
              booking_id: string;
              message_text: string;
              edited_text?: string;
            };
            return (
              <GuestMessageProposal
                key={`history-guest-msg-${a.artifact_id}`}
                state={gmState}
                messageText={payload.message_text}
                editedText={payload.edited_text}
                channel={a.derived_channel}
                channexMessageId={channexMessageId}
                errorMessage={lastError?.message}
                onApprove={
                  (gmState === "pending" || gmState === "edited") && onArtifactAction
                    ? () => onArtifactAction(a.audit_log_id, "approve")
                    : undefined
                }
                onEdit={
                  gmState === "pending" && onArtifactEdit
                    ? () => {
                        /* component-local edit toggle; Save fires onSaveEdit */
                      }
                    : undefined
                }
                onDiscard={
                  (gmState === "pending" ||
                    gmState === "edited" ||
                    gmState === "failed") &&
                  onArtifactAction
                    ? () => onArtifactAction(a.audit_log_id, "discard")
                    : undefined
                }
                onRetry={
                  gmState === "failed" && onArtifactAction
                    ? () => onArtifactAction(a.audit_log_id, "approve")
                    : undefined
                }
                onSaveEdit={
                  gmState === "pending" && onArtifactEdit
                    ? (newText) => onArtifactEdit(a.audit_log_id, newText)
                    : undefined
                }
              />
            );
          }
          // Default branch: 'property_knowledge_confirmation' (M6).
          // Map agent_artifacts.state → MemoryArtifact's state union.
          // M7 union widened to include 'edited', but memory artifacts
          // are editable=false and shouldn't reach that state in
          // practice; defensive fallback to 'pending' if it ever does.
          const memState =
            a.state === "emitted" || a.state === "edited"
              ? "pending"
              : a.state === "confirmed"
                ? "saved"
                : "superseded";
          return (
            <MemoryArtifact
              key={`history-memory-${a.artifact_id}`}
              state={memState}
              fact={payloadToFactSpans(a.payload)}
              onSave={
                memState === "pending" && onArtifactAction
                  ? () => onArtifactAction(a.audit_log_id, "approve")
                  : undefined
              }
              onDiscard={
                memState === "pending" && onArtifactAction
                  ? () => onArtifactAction(a.audit_log_id, "discard")
                  : undefined
              }
            />
          );
        })}
        {turn.refusal && <RefusalTag scope={[]} />}
      </KoastMessage>
    </Turn>
  );
}
