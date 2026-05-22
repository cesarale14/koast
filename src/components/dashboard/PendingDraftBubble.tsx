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
import { KoastChip } from "@/components/polish/KoastChip";
import StatusDot from "@/components/polish/StatusDot";
import {
  CONFIDENCE_LABEL,
  type DraftEnvelope,
} from "@/components/dashboard/draft-envelope-labels";

interface PendingDraftBubbleMessage {
  id: string;
  ai_draft?: string | null;
  content: string;
  envelope?: DraftEnvelope | null;
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

  // M10 Phase D STEP 8 (S3): envelope-driven indicators. Display gates on
  // envelope presence (historical drafts NULL → clean per STEP 6 nullable-
  // permanent / M3-outcome-3-family 2nd instance).
  const envelope = msg.envelope;
  const confidenceCfg = envelope?.confidence
    ? CONFIDENCE_LABEL[envelope.confidence]
    : null;
  // judge_results verdict='fail' on any entry → review-needed indicator
  // (activates Phase B Q3 inert flag — first UI consumer of envelope.judge_results).
  const failJudge = envelope?.judge_results?.find((r) => r.verdict === "fail");

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
        {(confidenceCfg || failJudge) && (
          <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="draft-envelope-indicators">
            {confidenceCfg && (
              <KoastChip
                variant={confidenceCfg.variant}
                data-testid="draft-confidence-badge"
                aria-label={`Draft confidence: ${confidenceCfg.label}`}
              >
                {confidenceCfg.label}
              </KoastChip>
            )}
            {failJudge && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium"
                style={{ color: "rgba(247,243,236,0.9)" }}
                data-testid="draft-review-needed-indicator"
                title={`Review needed: ${failJudge.judge_id} — ${failJudge.reason}`}
                aria-label={`Review needed: ${failJudge.judge_id} flagged this draft (${failJudge.reason})`}
              >
                <StatusDot tone="alert" size={8} halo />
                Review
              </span>
            )}
          </div>
        )}
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
