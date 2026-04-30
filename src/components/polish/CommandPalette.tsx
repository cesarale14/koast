"use client";

/**
 * CommandPalette — overlay shell for the future global search.
 *
 * Self-contained: manages its own open state, handles the ⌘K /
 * Ctrl+K keyboard shortcut (document-level), traps focus, restores
 * focus to the element that opened it, and respects
 * prefers-reduced-motion.
 *
 * Opening from outside: dispatch a "koast:open-command-palette"
 * CustomEvent (TopBarSearch does this on click). That decouples the
 * trigger from the overlay — the palette works even when the
 * trigger button is hidden (mobile).
 *
 * Real search results, fuzzy indexing, and keyboard nav land in a
 * future session. For now this is a placeholder shell with copy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export const OPEN_EVENT = "koast:open-command-palette";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Initial reduced-motion detection (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    apply();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Global ⌘K/Ctrl+K listener + open-event listener.
  useEffect(() => {
    const openPalette = () => {
      returnFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, openPalette);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    // Focus returns to the trigger that opened the palette.
    const el = returnFocusRef.current;
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  // Autofocus the input when opening.
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  // ESC close + focus trap while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = shell.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(19,46,32,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        opacity: reducedMotion ? 1 : 0,
        animation: reducedMotion ? undefined : "koast-cp-fade-in 180ms forwards",
      }}
    >
      <div
        ref={shellRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: "calc(100% - 32px)",
          margin: "15vh auto 0",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(19,46,32,0.25)",
          overflow: "hidden",
          transform: reducedMotion ? "scale(1)" : "scale(0.98)",
          animation: reducedMotion ? undefined : "koast-cp-scale-in 220ms cubic-bezier(0.4,0,0.2,1) forwards",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 20px",
            borderBottom: "1px solid var(--dry-sand)",
          }}
        >
          <Search size={18} color="var(--tideline)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, guests, messages…"
            aria-label="Search query"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 16,
              fontWeight: 400,
              color: "var(--deep-sea)",
            }}
          />
          <kbd
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 10,
              color: "var(--tideline)",
              background: "rgba(61,107,82,0.1)",
              padding: "2px 6px",
              borderRadius: 4,
              letterSpacing: "0.04em",
            }}
          >
            ESC
          </kbd>
        </header>
        <div style={{ minHeight: 280, padding: 24, color: "var(--tideline)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {query === "" ? <EmptyState /> : <ComingSoonState query={query} />}
        </div>
        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            background: "var(--shore-soft)",
            borderTop: "1px solid var(--dry-sand)",
            fontSize: 11,
            color: "var(--tideline)",
          }}
        >
          <span>⌘K to open · ESC to close</span>
          <span>Global search coming soon</span>
        </footer>
      </div>
      <style jsx global>{`
        @keyframes koast-cp-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes koast-cp-scale-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", maxWidth: 360 }}>
      <div
        style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
          fontSize: 18,
          fontStyle: "italic",
          color: "var(--tideline)",
          lineHeight: 1.3,
          marginBottom: 10,
        }}
      >
        Global search is coming.
      </div>
      <p style={{ fontSize: 13, color: "var(--tideline)", lineHeight: 1.5, margin: 0 }}>
        Soon you&apos;ll be able to jump to any property, guest, message, calendar date, or setting from here. For now, use the sidebar.
      </p>
    </div>
  );
}

function ComingSoonState({ query }: { query: string }) {
  return (
    <div style={{ textAlign: "center", fontSize: 13, color: "var(--tideline)", lineHeight: 1.5 }}>
      Searching for &lsquo;{query}&rsquo;… (not yet wired up)
    </div>
  );
}
