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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatShell } from "./ChatShell";
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
import { useAgentTurn } from "@/lib/agent-client/useAgentTurn";
import type { PropertyOption } from "./PropertyContext";

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
};

type ConvListItem = {
  id: string;
  last_turn_at: string;
  preview: string;
  propertyName: string;
};

export type ChatClientProps = {
  /** Server-provided initial list (rail). */
  conversations: ConvListItem[];
  /** Currently-active conversation id; null on the landing /chat page. */
  activeConversationId: string | null;
  /** Server-provided history for the active conversation. Empty on landing. */
  history: UITurnLite[];
  /** Host display info for the rail foot + user-message avatars. */
  user: { initials: string; name: string; org: string };
  /** Server-provided list of host properties for the topbar dropdown (D18). */
  properties: PropertyOption[];
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

/** Key for the per-host last-selected property (sessionStorage). */
const PROPERTY_PREF_KEY = "koast.chat.activePropertyId";

export function ChatClient({
  conversations,
  activeConversationId,
  history,
  user,
  properties,
  initialPropertyId = null,
}: ChatClientProps) {
  const router = useRouter();
  const { state, isStreaming, submit, cancel, reset } = useAgentTurn();
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
  /** Auto-scroll anchor (CF§10.8) — refs the scroll container so we can stick to bottom while streaming. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef<boolean>(true);

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
      router.push(`/chat/${id}`);
    },
    [router],
  );

  const onNewConversation = useCallback(() => {
    router.push("/chat");
  }, [router]);

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

  return (
    <ChatShell>
      <Rail
        groups={groups}
        user={user}
        activeConversationId={activeConversationId ?? undefined}
        onSelectConversation={onSelectConversation}
        onNewConversation={onNewConversation}
      />
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
            {history.map((t) => (
              <HistoryTurnView key={t.id} turn={t} userInitials={user.initials} />
            ))}
            {sessionHarvest.map((t) => (
              <HistoryTurnView key={t.id} turn={t} userInitials={user.initials} />
            ))}
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
                    const failed = block.status === "completed" && block.success === false;
                    const tcState =
                      block.status === "completed"
                        ? failed
                          ? "failed"
                          : "completed"
                        : "in-flight";
                    return (
                      <ToolCall
                        key={block.tool_use_id}
                        name={block.tool_name}
                        params={parseParams(block.input_summary)}
                        state={tcState}
                        durationMs={block.duration_ms}
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
  );
}

function HistoryTurnView({
  turn,
  userInitials,
}: {
  turn: UITurnLite;
  userInitials: string;
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
          />
        ))}
        {turn.text && <p>{turn.text}</p>}
        {turn.refusal && <RefusalTag scope={[]} />}
      </KoastMessage>
    </Turn>
  );
}
