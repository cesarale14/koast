"use client";

/**
 * DockedChat — the focused conversation thread inside the command-strip sheet
 * (P2.1). It is NOT a second chat surface: it reuses the SAME agent via the
 * SAME `useAgentTurn` hook + the SAME `RenderCard` registry the full surface
 * uses, in a compact thread-only layout. The full power surface (conversation
 * rail, audit drawer, gated-action lifecycle) stays at /chat/[id] — reachable
 * via "Open full chat".
 *
 * Why a focused renderer (not the 1480-line ChatClient): the companion shows
 * the quick ask + its answer in place, carrying page context. Answers render
 * as the app's own components through RenderCard (the P2.2 registry), exactly
 * as on the full surface, so there's no card-rendering drift. Gated action
 * proposals (memory/guest-message) are rare in a quick ask; when one appears
 * the companion nudges to the full surface to review+approve (P2.3 will render
 * proposals inline here).
 *
 * Conversation continuity: the first message from a fresh companion anchors
 * the store's activeConversationId to the server-assigned id (ANCHOR pattern,
 * mirroring ChatClient) so "Open full chat" lands on the same conversation and
 * the next companion ask continues it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowUp } from "lucide-react";
import { useAgentTurn } from "@/lib/agent-client/useAgentTurn";
import { useChatStore } from "@/components/chat/ChatStore";
import { RenderCard } from "@/components/chat/RenderCard";
import type { ContentBlock } from "@/lib/agent-client/types";
import type { RenderPayload } from "@/lib/agent/render/types";
import { usePageContext } from "./usePageContext";

type HarvestedTurn = {
  id: number;
  userText: string;
  koastText: string;
  renderPayload?: RenderPayload;
  refusalText: string | null;
  errored: boolean;
  hasArtifacts: boolean;
};

function paragraphsOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { kind: "paragraph" }> => b.kind === "paragraph")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

function hasArtifacts(content: ContentBlock[]): boolean {
  return content.some(
    (b) => b.kind === "memory_artifact" || b.kind === "guest_message_artifact",
  );
}

function Prose({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", lineHeight: 1.5 }}>
          {p}
        </p>
      ))}
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "9px 13px",
          borderRadius: "14px 14px 4px 14px",
          background: "var(--deep-sea)",
          color: "white",
          fontSize: 14,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function KoastBlock({
  text,
  renderPayload,
  refusalText,
  errored,
  showArtifactNudge,
  onOpenFull,
}: {
  text: string;
  renderPayload?: RenderPayload;
  refusalText?: string | null;
  errored?: boolean;
  showArtifactNudge?: boolean;
  onOpenFull: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {text && (
        <div style={{ color: "var(--deep-sea)", fontSize: 14 }}>
          <Prose text={text} />
        </div>
      )}
      {renderPayload && <RenderCard payload={renderPayload} />}
      {refusalText && (
        <div style={{ color: "var(--tideline)", fontSize: 13, fontStyle: "italic" }}>
          {refusalText}
        </div>
      )}
      {errored && (
        <div style={{ color: "var(--coral-reef)", fontSize: 13 }}>
          Something went wrong — try again, or open full chat.
        </div>
      )}
      {showArtifactNudge && (
        <button
          onClick={onOpenFull}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--koast-trench)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Koast has a suggestion — review in full chat
          <ArrowUpRight size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function DockedChat({ onRequestClose }: { onRequestClose?: () => void }) {
  const router = useRouter();
  const { state, isPending, isStreaming, submit, reset } = useAgentTurn();
  const { state: chatState, dispatch } = useChatStore();
  const pageContext = usePageContext();

  const [draft, setDraft] = useState("");
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [harvest, setHarvest] = useState<HarvestedTurn[]>([]);
  const harvestSeqRef = useRef(0);
  const pendingHarvestRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeConversationId = chatState.activeConversationId;
  const busy = isPending || isStreaming;

  // Anchor a fresh companion conversation to its server-assigned id as soon
  // as turn_started lands — so "Open full chat" + the next ask continue the
  // same conversation (mirrors ChatClient's ANCHOR pattern; clears nothing).
  useEffect(() => {
    const newId = state.conversation_id;
    if (newId && activeConversationId === null) {
      dispatch({ type: "ANCHOR_CONVERSATION", conversationId: newId });
    }
  }, [state.conversation_id, activeConversationId, dispatch]);

  // Harvest a finished turn into the local thread, then reset the live turn so
  // only the harvested copy renders (guarded by pendingHarvestRef so this runs
  // exactly once per turn and never loops on the reset → idle transition).
  useEffect(() => {
    const terminal =
      state.status === "done" || state.status === "error" || state.status === "refusal";
    if (!terminal || !pendingHarvestRef.current) return;
    pendingHarvestRef.current = false;
    const refusalText = state.refusal?.reason ?? state.refusalEnvelope?.reason ?? null;
    setHarvest((prev) => [
      ...prev,
      {
        id: ++harvestSeqRef.current,
        userText: pendingUserText ?? "",
        koastText: paragraphsOf(state.content),
        renderPayload: state.renderPayload,
        refusalText: state.status === "refusal" ? refusalText : null,
        errored: state.status === "error",
        hasArtifacts: hasArtifacts(state.content),
      },
    ]);
    setPendingUserText(null);
    reset();
  }, [
    state.status,
    state.content,
    state.renderPayload,
    state.refusal,
    state.refusalEnvelope,
    pendingUserText,
    reset,
  ]);

  // Keep the newest content in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [harvest, pendingUserText, state.content, state.renderPayload]);

  const onOpenFull = useCallback(() => {
    onRequestClose?.();
    router.push(activeConversationId ? `/chat/${activeConversationId}` : "/");
  }, [router, activeConversationId, onRequestClose]);

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setPendingUserText(text);
    pendingHarvestRef.current = true;
    void submit(text, {
      conversation_id: activeConversationId,
      ui_context: {
        active_route: pageContext.active_route,
        active_property_id: pageContext.active_property_id,
        active_date_range: pageContext.active_date_range,
      },
    });
  }, [draft, busy, submit, activeConversationId, pageContext]);

  const liveText = paragraphsOf(state.content);
  const liveStreaming = state.status === "streaming" || isPending;
  const empty = harvest.length === 0 && pendingUserText === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Open-full-chat affordance */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "0 4px 6px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onOpenFull}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--tideline)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          Open full chat
          <ArrowUpRight size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "4px 2px",
        }}
      >
        {empty && (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              color: "var(--tideline)",
              fontSize: 14,
              maxWidth: 280,
              lineHeight: 1.5,
            }}
          >
            Ask about turnovers, rates, guests, or this page — Koast answers with
            the live data.
          </div>
        )}

        {harvest.map((h) => (
          <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {h.userText && <UserBubble text={h.userText} />}
            <KoastBlock
              text={h.koastText}
              renderPayload={h.renderPayload}
              refusalText={h.refusalText}
              errored={h.errored}
              showArtifactNudge={h.hasArtifacts}
              onOpenFull={onOpenFull}
            />
          </div>
        ))}

        {pendingUserText !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <UserBubble text={pendingUserText} />
            {liveText || state.renderPayload ? (
              <KoastBlock
                text={liveText}
                renderPayload={state.renderPayload}
                onOpenFull={onOpenFull}
              />
            ) : liveStreaming ? (
              <div style={{ color: "var(--tideline)", fontSize: 14 }}>Koast is thinking…</div>
            ) : null}
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: 8,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder="Ask Koast…"
          autoFocus
          style={{
            flex: 1,
            resize: "none",
            maxHeight: 120,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--hairline)",
            background: "var(--shore-soft)",
            color: "var(--deep-sea)",
            fontSize: 14,
            lineHeight: 1.4,
            outline: "none",
          }}
        />
        <button
          onClick={onSend}
          disabled={!draft.trim() || busy}
          aria-label="Send"
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: 12,
            border: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: !draft.trim() || busy ? "default" : "pointer",
            background: !draft.trim() || busy ? "var(--shell)" : "var(--coastal)",
            color: !draft.trim() || busy ? "var(--tideline)" : "white",
            transition: "background 120ms ease",
          }}
        >
          <ArrowUp size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
