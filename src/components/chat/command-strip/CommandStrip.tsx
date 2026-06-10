"use client";

/**
 * CommandStrip — the persistent "Ask Koast…" companion docked at the bottom of
 * every inspect host page (P2.1). Chat demotes from a destination to a verb
 * layer: collapsed it's a single input-looking row; tapping it expands the
 * CommandThreadSheet (a modal over the current page).
 *
 * Mount: a flow flex child at the bottom of the inspect content column (see
 * (dashboard)/layout.tsx) so page content scrolls/sizes ABOVE it — no collision
 * with the Messages composer or the Calendar's bottom rows (the chat-composer
 * collision the grounding flagged). It is structurally absent from /clean and
 * the auth pages (those never render the dashboard layout). On chat-primary
 * routes (/ and /chat/*) the full chat surface already IS the companion, so the
 * strip is not mounted there.
 *
 * Replaces MiniChatBack as the inspect-route Koast presence affordance.
 */

import { useState } from "react";
import { KoastMark } from "@/components/chat/KoastMark";
import { CommandThreadSheet } from "./CommandThreadSheet";

export function CommandStrip() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--hairline)",
          background: "var(--shore)",
          padding: "8px 12px calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Koast"
          aria-haspopup="dialog"
          aria-expanded={open}
          style={{
            width: "100%",
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid var(--hairline)",
            background: "var(--shore-soft)",
            color: "var(--tideline)",
            cursor: "text",
            fontSize: 14,
            textAlign: "left",
          }}
        >
          <KoastMark size={20} />
          <span>Ask Koast…</span>
        </button>
      </div>

      <CommandThreadSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
