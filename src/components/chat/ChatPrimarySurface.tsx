"use client";

/**
 * ChatPrimarySurface — full-screen chat surface at chat-primary routes
 * (`/` and `/chat/*`; M13 Phase 1.A keystone).
 *
 * Composes: PropertyContextBar (top) + ChatClient (body) + FooterLine
 * (bottom). All three live inside the dashboard layout's main content
 * region; the sidebar + topbar wrap this surface unchanged.
 *
 * Wedge scope: pricing conversation. Property context surfaces the
 * "what we're talking about" anchor; ChatClient runs the conversation
 * with the agent + tool loop. No inspect-mode chrome here — the host
 * is on the spine.
 *
 * Pathname-derived rendering: this component is mounted by
 * `(dashboard)/layout.tsx` ONLY when `isChatPrimary(pathname)` returns
 * true. The reducer no longer tracks an `expanded` flag (M13 Phase 1.A
 * binding: pathname IS the layout state).
 */

import { ChatClient } from "./ChatClient";
import { PropertyContextBar } from "./PropertyContextBar";
import { FooterLine } from "./FooterLine";

export type ChatPrimarySurfaceProps = {
  propertyName: string | null;
  monthsActive?: number | null;
  conversationCount?: number | null;
};

export function ChatPrimarySurface({
  propertyName,
  monthsActive,
  conversationCount,
}: ChatPrimarySurfaceProps) {
  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--shore)" }}
    >
      <PropertyContextBar propertyName={propertyName} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatClient />
      </div>
      <FooterLine
        monthsActive={monthsActive}
        conversationCount={conversationCount}
      />
    </div>
  );
}
