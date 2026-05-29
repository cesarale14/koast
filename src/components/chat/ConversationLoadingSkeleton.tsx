"use client";

/**
 * ConversationLoadingSkeleton — M13 Phase 1.B follow-on (switch-flash fix).
 *
 * Rendered by ChatClient while a DIFFERENT conversation's turns are
 * being fetched (chatStore.state.conversationLoading === true and no
 * content has arrived yet). Replaces the landing/empty state during a
 * switch so the host never sees the "new conversation" surface flash
 * between clicking a recent conversation and its turns landing.
 *
 * Visual: a few muted turn-shaped placeholder rows alternating
 * user/koast alignment. Respects prefers-reduced-motion (no shimmer
 * animation when reduced-motion is set — static muted blocks).
 *
 * Uses the chat shell's semantic tokens (--rule, --surface) so it
 * matches the active theme (light/dark) without hardcoding palette.
 */

import { useEffect, useState } from "react";

export function ConversationLoadingSkeleton() {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
      data-testid="conversation-loading"
      aria-busy="true"
      aria-label="Loading conversation"
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "24px 0",
      }}
    >
      <SkeletonTurn align="left" widthPct={62} reducedMotion={reducedMotion} />
      <SkeletonTurn align="right" widthPct={48} reducedMotion={reducedMotion} />
      <SkeletonTurn align="left" widthPct={70} reducedMotion={reducedMotion} />
      <style jsx>{`
        @keyframes koast-skel-pulse {
          0% {
            opacity: 0.45;
          }
          50% {
            opacity: 0.8;
          }
          100% {
            opacity: 0.45;
          }
        }
      `}</style>
    </div>
  );
}

function SkeletonTurn({
  align,
  widthPct,
  reducedMotion,
}: {
  align: "left" | "right";
  widthPct: number;
  reducedMotion: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          width: `${widthPct}%`,
          maxWidth: 520,
          height: 56,
          borderRadius: 12,
          background: "var(--surface, rgba(61,107,82,0.08))",
          border: "1px solid var(--rule, rgba(61,107,82,0.12))",
          animation: reducedMotion
            ? undefined
            : "koast-skel-pulse 1.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}
