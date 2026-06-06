"use client";

/**
 * CommandPalette — universal nav primitive (M13 Phase 1.B Step 2).
 *
 * Per the Koast Operational Doctrine point 7 — "navigation is direct
 * first, agent-assisted second; tabs are one-click reachable from
 * anywhere" — the palette is mounted globally at the dashboard layout
 * scope (above the chat-primary / inspect-mode branch split) so ⌘K
 * (or Ctrl+K) opens it from every route in the app.
 *
 * Opens via:
 *   - ⌘K / Ctrl+K keyboard shortcut (document-level)
 *   - `koast:open-command-palette` CustomEvent (TopBarSearch on inspect
 *     routes; the chat ChatShell topbar's SearchAffordance on chat-
 *     primary; future mobile FAB if it lands)
 *
 * Data sources merged into one CmdKEntry[] index:
 *   - Properties (id + name + city + address_line1) — fetched from
 *     /api/cmdk/index, module-scoped cache with 5min TTL
 *   - Recent conversations (top-20) — same fetch
 *   - Static route catalog — STATIC_ROUTES (src/lib/cmdk/static.ts)
 *   - Static action catalog — STATIC_ACTIONS (same file)
 *
 * Filter: substring + token-prefix match on entry.keywords. Per the
 * M13 Phase 1.B STOP, no Fuse.js dependency at 1.B — plain matching
 * is fast (<5ms steady-state on a 287-entry index per the perf test)
 * and the field-expansion approach covers "tampa → Villa Jamaica"
 * without typo tolerance.
 *
 * Keyboard:
 *   - ⌘K / Ctrl+K opens / closes
 *   - ESC closes
 *   - ↑ / ↓ navigate results
 *   - Enter triggers the selected result
 *   - Tab cycles within the dialog (focus trap)
 *
 * Restores focus to the trigger element on close.
 * Respects prefers-reduced-motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, Compass, MessageSquare, Zap } from "lucide-react";
import type { CmdKEntry, CmdKKind } from "@/lib/cmdk/types";
import { filterEntries } from "@/lib/cmdk/filter";
import { useCmdKData } from "@/lib/cmdk/use-cmdk-data";

export const OPEN_EVENT = "koast:open-command-palette";

const MAX_RESULTS = 8;

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Fetch only after first open — palette is lazy.
  const { entries, loading, error } = useCmdKData(open);

  // Filtered + capped result list. Memo so typing doesn't re-allocate
  // when the cached entries are stable.
  const results = useMemo<CmdKEntry[]>(() => {
    if (!entries) return [];
    return filterEntries(entries, query).slice(0, MAX_RESULTS);
  }, [entries, query]);

  // Reduced-motion detection.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Global ⌘K/Ctrl+K + OPEN_EVENT listener.
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
    setActiveIdx(0);
    const el = returnFocusRef.current;
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  // Autofocus input on open; reset active row.
  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  // Reset active row when query changes (new filter set means index 0
  // is the new top match).
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const performSelect = useCallback(
    (entry: CmdKEntry) => {
      close();
      // Action dispatch FIRST — some actions need href as a fallback
      // (e.g. add-property has both an action tag AND href).
      if (entry.action) {
        switch (entry.action) {
          case "new-conversation":
            // Naive: navigate to / and dispatch a "new conversation"
            // event the ChatStore can listen to. At Phase 1.B the
            // simpler path is just navigate to / — the chat empty-
            // state surfaces if there's no active conversation. Wire
            // a proper "new" event when conversation list management
            // gets more sophisticated.
            router.push("/");
            return;
          case "add-property":
            router.push(entry.href ?? "/properties/new");
            return;
          case "show-today": {
            // The calendar reads ?date param; default behavior already
            // lands on today, so a plain navigate works.
            router.push("/calendar");
            return;
          }
        }
      }
      if (entry.href) {
        router.push(entry.href);
      }
    },
    [close, router],
  );

  // Keyboard: ESC / ↑ / ↓ / Enter / Tab.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        const target = results[activeIdx];
        if (target) {
          e.preventDefault();
          performSelect(target);
        }
        return;
      }
      if (e.key !== "Tab") return;
      // Focus trap.
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = shell.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
  }, [open, close, results, activeIdx, performSelect]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      data-testid="cmdk-palette"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,24,21,0.35)",
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
          margin: "12vh auto 0",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(15,24,21,0.25)",
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
            padding: "16px 20px",
            borderBottom: "1px solid var(--dry-sand)",
          }}
        >
          <Search size={18} color="var(--tideline)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Properties, conversations, tabs…"
            aria-label="Search query"
            aria-controls="cmdk-results"
            aria-activedescendant={results[activeIdx] ? `cmdk-row-${results[activeIdx].id}` : undefined}
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
        <div id="cmdk-results" role="listbox" style={{ maxHeight: "55vh", overflowY: "auto" }}>
          {entries === null && loading ? (
            <Empty message="Loading…" />
          ) : results.length === 0 ? (
            query.trim() === "" ? (
              <Empty message="Type to search properties, conversations, or tabs." />
            ) : (
              <Empty message={`No matches for "${query}".`} />
            )
          ) : (
            results.map((entry, idx) => (
              <ResultRow
                key={entry.id}
                entry={entry}
                active={idx === activeIdx}
                onHover={() => setActiveIdx(idx)}
                onClick={() => performSelect(entry)}
              />
            ))
          )}
          {error ? (
            <div style={{ padding: "12px 20px", fontSize: 11, color: "var(--coral-reef)" }}>
              Live data unavailable — showing tabs and actions only.
            </div>
          ) : null}
        </div>
        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 20px",
            background: "var(--shore-soft)",
            borderTop: "1px solid var(--dry-sand)",
            fontSize: 11,
            color: "var(--tideline)",
          }}
        >
          <span>↑↓ to move · Enter to open · ESC to close</span>
          <span>⌘K from anywhere</span>
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

function Empty({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        color: "var(--tideline)",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function ResultRow({
  entry,
  active,
  onHover,
  onClick,
}: {
  entry: CmdKEntry;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const Icon = ICON_BY_KIND[entry.kind];
  return (
    <button
      id={`cmdk-row-${entry.id}`}
      data-testid="cmdk-result"
      data-cmdk-kind={entry.kind}
      data-cmdk-id={entry.id}
      role="option"
      aria-selected={active}
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 20px",
        background: active ? "var(--shore-soft)" : "transparent",
        border: 0,
        textAlign: "left",
        cursor: "pointer",
        color: "var(--deep-sea)",
        transition: "background 80ms ease-out",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: KIND_TILE_BG[entry.kind],
          color: KIND_TILE_FG[entry.kind],
          flexShrink: 0,
        }}
      >
        <Icon size={14} strokeWidth={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.3,
            color: "var(--deep-sea)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {entry.label}
        </div>
        {entry.hint ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--tideline)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {entry.hint}
          </div>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 10,
          color: "var(--tideline)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {KIND_LABEL[entry.kind]}
      </span>
    </button>
  );
}

const ICON_BY_KIND: Record<CmdKKind, typeof Building2> = {
  property: Building2,
  route: Compass,
  conversation: MessageSquare,
  action: Zap,
};

const KIND_TILE_BG: Record<CmdKKind, string> = {
  property: "rgba(76,196,204,0.18)", // golden tint
  route: "rgba(61,107,82,0.15)", // tideline tint
  conversation: "rgba(26,122,90,0.15)", // lagoon tint
  action: "rgba(212,150,11,0.18)", // amber tide tint
};

const KIND_TILE_FG: Record<CmdKKind, string> = {
  property: "var(--coastal)",
  route: "var(--coastal)",
  conversation: "var(--coastal)",
  action: "var(--coastal)",
};

const KIND_LABEL: Record<CmdKKind, string> = {
  property: "Property",
  route: "Tab",
  conversation: "Chat",
  action: "Action",
};
