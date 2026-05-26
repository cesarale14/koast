"use client";

/**
 * InspectSurface — wrapper for inspect-mode routes (M13 Phase 1.A;
 * everything that is NOT chat-primary).
 *
 * Renders `children` (the inspect-mode page) plus MiniChatBack as the
 * persistent navigation back-affordance. The chat store stays mounted
 * at layout scope (above this wrapper); conversation state survives
 * navigation across all inspect routes.
 *
 * Wedge scope: at Phase 1.A every existing dashboard route (Calendar,
 * Properties, Pricing, Reviews, Turnovers, Market Intel, Comp Sets, etc.)
 * is inspect-mode. MiniChatBack sits above them as a slim top-strip
 * desktop / 48px FAB mobile (msg 3518 Q3 lock).
 *
 * No overlay; no display:none toggle. ChatClient is NOT mounted here —
 * it lives only inside ChatPrimarySurface. The store continues polling
 * via useAuditPoll for unread audit count, which the MiniChatBack badge
 * surfaces.
 */

import { MiniChatBack } from "./MiniChatBack";

export type InspectSurfaceProps = {
  children: React.ReactNode;
};

export function InspectSurface({ children }: InspectSurfaceProps) {
  return (
    <>
      <MiniChatBack />
      {/* Top padding reserves space for the desktop strip (36px); FAB on
          mobile overlays content at bottom-right and needs no padding
          since the existing layout already reserves bottom space. */}
      <div className="md:pt-9 h-full">{children}</div>
    </>
  );
}
