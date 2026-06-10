"use client";

/**
 * CommandThreadSheet — the expanded companion overlay for the command strip
 * (P2.1). A bottom sheet over the current page; the page stays mounted
 * beneath (this is a transient modal affordance, NOT a route change and NOT a
 * chat surface-state change — it does not touch isChatPrimary / the pathname
 * surface invariant). Collapses on ESC, scrim tap, the close button, or a
 * swipe-down on the handle.
 *
 * Mobile/PWA: anchored to the bottom with safe-area-inset padding; max height
 * ~72dvh so the page header stays visible above it. z below CommandPalette
 * (1000) so ⌘K still layers over everything.
 *
 * Mount-on-open: DockedChat mounts when the sheet opens and unmounts on close
 * — the quick-ask thread is a per-open session. Conversation continuity is
 * server-side (the store's activeConversationId persists), so reopening + the
 * next ask continues the same conversation, and "Open full chat" shows the
 * full history.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DockedChat } from "./DockedChat";

const DISMISS_THRESHOLD = 90;

export function CommandThreadSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startYRef.current;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
    }
    setDragY(0);
    startYRef.current = null;
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      role="dialog"
      aria-modal="true"
      aria-label="Ask Koast"
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(19,46,32,0.32)",
          animation: "koast-fade-in 160ms ease-out",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          height: "72dvh",
          maxHeight: "72dvh",
          background: "var(--shore)",
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 -8px 40px rgba(19,46,32,0.22)",
          display: "flex",
          flexDirection: "column",
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? "transform 200ms ease-out" : "none",
          animation: "koast-sheet-up 220ms cubic-bezier(0.16,1,0.3,1)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Handle + close (drag target) */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            position: "relative",
            flexShrink: 0,
            padding: "10px 12px 6px",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 40,
              height: 4,
              borderRadius: 99,
              background: "var(--shell)",
              margin: "0 auto",
            }}
          />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              width: 30,
              height: 30,
              borderRadius: 99,
              border: "none",
              background: "transparent",
              color: "var(--tideline)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Thread + composer */}
        <div style={{ flex: 1, minHeight: 0, padding: "0 14px 12px" }}>
          <DockedChat onRequestClose={onClose} />
        </div>
      </div>
    </div>
  );
}
