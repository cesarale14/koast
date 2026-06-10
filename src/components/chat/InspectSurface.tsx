"use client";

/**
 * InspectSurface — wrapper for inspect-mode routes (M13 Phase 1.A;
 * everything that is NOT chat-primary).
 *
 * Renders `children` (the inspect-mode page). The chat store stays mounted
 * at layout scope (above this wrapper); conversation state survives
 * navigation across all inspect routes.
 *
 * P2.1: the Koast presence/back affordance on inspect routes is now the
 * bottom-docked CommandStrip (mounted by (dashboard)/layout.tsx as a flow
 * child below this content), which replaces the former top MiniChatBack
 * strip. So this wrapper is just the content host — no top strip, no
 * reserved top padding. ChatClient is NOT mounted here; the docked
 * companion (CommandThreadSheet → DockedChat) is the inspect-route chat.
 */

export type InspectSurfaceProps = {
  children: React.ReactNode;
};

export function InspectSurface({ children }: InspectSurfaceProps) {
  return <div className="h-full">{children}</div>;
}
