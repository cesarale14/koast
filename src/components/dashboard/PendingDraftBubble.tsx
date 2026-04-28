"use client";

// Session 8a.1 polish — pending automation draft, rendered as a
// chat bubble in the same visual language as a sent outgoing
// message. The draft IS the message the host is about to send;
// treating it like a banner/card was the wrong frame.
//
// Differences from a normal outgoing bubble:
//   - Inline "SUGGESTED · PENDING APPROVAL" tag at the top of
//     the bubble (Sparkles + uppercase tracking + dimmed white)
//   - 92% container opacity so it reads as not-yet-committed
//   - Approve & Send + Discard buttons inside the bubble below
//     the body text — Approve is white-on-coastal (inverted),
//     Discard is transparent with a subtle outline
//
// Animation states reserved for future polish:
//   - On Approve & Send: bubble transitions to full opacity +
//     tag fades out + buttons slide out, then becomes a normal
//     sent bubble.
//   - On Discard: bubble fades to 0 opacity + slides up/away,
//     container collapses.
// Current implementation: state changes are immediate (no
// transitions). Animation work tracked separately.

import { Sparkles } from "lucide-react";

interface PendingDraftBubbleMessage {
  id: string;
  ai_draft?: string | null;
  content: string;
}

export default function PendingDraftBubble({
  msg,
  onApprove,
  onDiscard,
}: {
  msg: PendingDraftBubbleMessage;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const body = (msg.ai_draft ?? msg.content ?? "").trim();
  return (
    <div className="flex justify-end items-end gap-2">
      <div
        className="max-w-[60%] px-4 py-2.5"
        style={{
          borderRadius: 14,
          backgroundColor: "var(--coastal)",
          color: "var(--shore)",
          fontSize: 13,
          lineHeight: 1.45,
          opacity: 0.92,
        }}
      >
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase mb-2"
          style={{ color: "rgba(247,243,236,0.72)", letterSpacing: "0.08em" }}
        >
          <Sparkles size={10} strokeWidth={2.25} />
          Suggested · Pending approval
        </div>
        <p className="whitespace-pre-wrap">{body}</p>
      </div>

      {/* Actions sit to the right of the bubble in the conversation gutter,
          stacked vertically and aligned with the bubble's bottom edge. */}
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onApprove}
          className="px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors"
          style={{
            background: "var(--coastal)",
            color: "var(--shore)",
            border: "1px solid var(--coastal)",
          }}
        >
          Approve & Send
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors"
          style={{
            background: "transparent",
            color: "var(--tideline)",
            border: "1px solid var(--hairline)",
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
