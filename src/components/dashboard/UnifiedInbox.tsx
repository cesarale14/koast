"use client";

// MSG-S2 — UnifiedInbox with active composer + optimistic send + retry +
// mark-read on thread open + Airbnb content-filter preview warning.
//
// Slice 1 served threads + messages read-only with the composer
// disabled. Slice 2 turns send on:
//   * Composer wired to POST /api/messages/threads/[id]/send.
//   * Optimistic UI: clientId-tagged temp message inserted immediately
//     with status='sending', flips to 'sent' on success or 'failed'
//     with retry button on error.
//   * Mark-read: opening a thread fires POST /api/messages/threads/[id]/mark-read
//     and zeroes the local unread badge in the same React render.
//   * Content-filter preview: Airbnb-channel composer surfaces a
//     non-blocking warning when the body contains a phone number,
//     email, or URL (Airbnb's anti-disintermediation auto-filters).
//   * Closed BDC threads: composer renders normally; failures surface
//     via the optimistic-failed state. No special pre-send gate.
//
// thread_kind badges (per MESSAGING_DESIGN §F.4):
//   - 'inquiry' → neutral badge "Inquiry"
//   - 'reservation_request' → amber badge "Reservation request"
//   - 'message' → no badge (default)
//
// The Koast-AI "K" button stays disabled (slice 3 wires AI drafts).

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Send, Phone, MoreHorizontal, MessageCircle, User, RotateCcw, AlertTriangle, ChevronLeft } from "lucide-react";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

// ============ Types ============

export interface ThreadRow {
  id: string;
  channex_thread_id: string;
  property_id: string;
  property_name: string;
  property_cover_photo_url: string | null;
  property_city: string | null;
  booking_id: string | null;
  guest_display_name: string;
  check_in: string | null;
  check_out: string | null;
  total_price: number | null;
  num_guests: number | null;
  platform: string;
  channel_code: string;
  provider_raw: string;
  title: string | null;
  last_message_preview: string | null;
  last_message_received_at: string | null;
  message_count: number;
  unread_count: number;
  is_closed: boolean;
  status: string;
  thread_kind: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  channex_message_id: string | null;
  direction: string | null;
  sender: string | null;
  sender_name: string | null;
  content: string;
  attachments: unknown[];
  read_at: string | null;
  channex_inserted_at: string | null;
  created_at: string;
  // Optimistic-UI state — only set on temp rows. Slice 2.
  __optimistic?: { status: "sending" | "sent" | "failed"; clientId: string; error?: string };
}

interface PropertyInfo {
  id: string;
  name: string;
  city: string | null;
  state?: string | null;
  cover_photo_url?: string | null;
}

interface UnifiedInboxProps {
  threads: ThreadRow[];
  properties: PropertyInfo[];
}

type Filter = "all" | "unread" | "needs_reply" | "ai_drafted";

// ============ Helpers ============

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initialsFor(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw || /guest$/i.test(raw)) return "G";
  return raw.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "G";
}

function firstNameLastInitial(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw || /guest$/i.test(raw)) return "Guest";
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const lastInitial = parts[1]?.[0];
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

function shortDateRange(ci: string, co: string): string {
  const a = new Date(ci + "T00:00:00");
  const b = new Date(co + "T00:00:00");
  const aFmt = a.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const bFmt = b.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${aFmt} – ${bFmt}`;
}

function nightsBetween(ci: string, co: string): number {
  return Math.max(
    1,
    Math.round(
      (Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10)) -
        Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10))) /
        86400000,
    ),
  );
}

function dateDividerLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const msgDay = new Date(d);
  msgDay.setHours(0, 0, 0, 0);
  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeOfDay(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ============ Main ============

export default function UnifiedInbox({ threads: initialThreads, properties }: UnifiedInboxProps) {
  const [threads, setThreads] = useState<ThreadRow[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [activeMessages, setActiveMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Per-thread composer state — keyed by thread.id. Stays mounted
  // when the host switches conversations so half-typed drafts survive.
  const [composers, setComposers] = useState<Record<string, string>>({});
  // True while a send is in flight for the current thread — disables the
  // send button to prevent double-submit (paired with the route-level
  // in-flight dedup).
  const [sending, setSending] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const filtered = useMemo(() => {
    let result = threads;
    if (filter === "unread") result = result.filter((t) => (t.unread_count ?? 0) > 0);
    if (filter === "needs_reply") {
      // Slice-2 heuristic: a thread "needs reply" when the last activity
      // was inbound (unread > 0). Tighter rule once outbound mark-read
      // semantics evolve.
      result = result.filter((t) => (t.unread_count ?? 0) > 0);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.guest_display_name.toLowerCase().includes(q)
            || t.property_name.toLowerCase().includes(q)
            || (t.title?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [threads, filter, search]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );

  // Fetch messages on activeId change AND fire mark-read.
  useEffect(() => {
    if (!activeId) { setActiveMessages([]); return; }
    let cancelled = false;
    setLoadingMessages(true);
    fetch(`/api/messages/threads/${activeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setActiveMessages((data?.messages ?? []) as MessageRow[]);
      })
      .catch(() => { if (!cancelled) setActiveMessages([]); })
      .finally(() => { if (!cancelled) setLoadingMessages(false); });

    // Mark-read: optimistic local update first, then fire-and-forget POST.
    setThreads((prev) => prev.map((t) => t.id === activeId ? { ...t, unread_count: 0 } : t));
    fetch(`/api/messages/threads/${activeId}/mark-read`, { method: "POST" }).catch((err) => {
      // Local state stays optimistic; the next sync reconciles. Per
      // MESSAGING_DESIGN §6.2 + slice-2 brief D.3 edge case.
      console.warn("[UnifiedInbox] mark-read failed (non-fatal):", err);
    });

    return () => { cancelled = true; };
  }, [activeId]);

  // Auto-scroll the thread to the bottom on message changes
  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [activeId, activeMessages.length]);

  const activeProperty = activeThread ? propMap.get(activeThread.property_id) : null;
  const activeComposer = activeId ? (composers[activeId] ?? "") : "";

  const setActiveComposer = useCallback((value: string) => {
    if (!activeId) return;
    setComposers((prev) => ({ ...prev, [activeId]: value }));
  }, [activeId]);

  // Send: optimistic insert → POST → resolve / fail / retry.
  const sendMessage = useCallback(async (bodyOverride?: string, retryOf?: string) => {
    if (!activeThread) return;
    const body = (bodyOverride ?? activeComposer).trim();
    if (!body) return;
    if (sending && !retryOf) return; // gate spam-clicks

    setSending(true);
    const clientId = retryOf ?? `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic temp message — appears immediately in the thread.
    if (!retryOf) {
      const tempMsg: MessageRow = {
        id: clientId,
        thread_id: activeThread.id,
        channex_message_id: null,
        direction: "outbound",
        sender: "property",
        sender_name: "Host",
        content: body,
        attachments: [],
        read_at: null,
        channex_inserted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        __optimistic: { status: "sending", clientId },
      };
      setActiveMessages((prev) => [...prev, tempMsg]);
      setComposers((prev) => ({ ...prev, [activeThread.id]: "" }));
    } else {
      // Retry — flip the existing failed row back to sending.
      setActiveMessages((prev) => prev.map((m) =>
        m.__optimistic?.clientId === retryOf
          ? { ...m, __optimistic: { status: "sending", clientId } }
          : m,
      ));
    }

    try {
      const res = await fetch(`/api/messages/threads/${activeThread.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errText = data?.channex_body
          ? extractChannexError(data.channex_body) ?? data?.error ?? "Send failed"
          : data?.error ?? `Send failed (${res.status})`;
        setActiveMessages((prev) => prev.map((m) =>
          m.__optimistic?.clientId === clientId
            ? { ...m, __optimistic: { status: "failed", clientId, error: errText } }
            : m,
        ));
        return;
      }

      // Success — replace the temp row with the real one returned
      // from the route. The webhook echo a few seconds later is a
      // no-op upsert (channex_message_id matches).
      const real = data.message as MessageRow;
      setActiveMessages((prev) => prev.map((m) =>
        m.__optimistic?.clientId === clientId
          ? { ...real, __optimistic: { status: "sent", clientId } }
          : m,
      ));
      // Bump the thread's last-activity in the inbox list.
      setThreads((prev) => prev.map((t) =>
        t.id === activeThread.id
          ? { ...t, last_message_received_at: real.channex_inserted_at, last_message_preview: body.slice(0, 200), message_count: (t.message_count ?? 0) + 1 }
          : t,
      ));
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Network error";
      setActiveMessages((prev) => prev.map((m) =>
        m.__optimistic?.clientId === clientId
          ? { ...m, __optimistic: { status: "failed", clientId, error: errText } }
          : m,
      ));
    } finally {
      setSending(false);
    }
  }, [activeThread, activeComposer, sending]);

  const retrySend = useCallback((failedMsg: MessageRow) => {
    if (!failedMsg.__optimistic) return;
    void sendMessage(failedMsg.content, failedMsg.__optimistic.clientId);
  }, [sendMessage]);

  return (
    <div className="flex h-full bg-white" style={{ borderTop: "1px solid var(--dry-sand)" }}>
      <style jsx global>{`
        @keyframes koast-convo-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        .koast-convo-item { opacity: 0; animation: koast-convo-in 0.4s ease-out forwards; }
      `}</style>

      <ConversationList
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        threads={filtered}
        activeId={activeId}
        onSelect={setActiveId}
        mounted={mounted}
      />

      <ThreadColumn
        thread={activeThread}
        messages={activeMessages}
        loading={loadingMessages}
        threadScrollRef={threadScrollRef}
        mounted={mounted}
        composer={activeComposer}
        setComposer={setActiveComposer}
        onSend={() => void sendMessage()}
        onRetry={retrySend}
        sending={sending}
        onBack={() => setActiveId(null)}
      />

      <GuestContextPanel thread={activeThread} property={activeProperty ?? null} mounted={mounted} />
    </div>
  );
}

// ============ Helpers (Phase C content filter + error parse) ============

const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_RE = /\b(?:https?:\/\/|www\.|[\w-]+\.(?:com|net|org|io|co|app|me|us|uk))\b/i;

function detectFilteredContent(body: string): { phone: boolean; email: boolean; url: boolean; any: boolean } {
  const phone = PHONE_RE.test(body);
  const email = EMAIL_RE.test(body);
  const url = URL_RE.test(body);
  return { phone, email, url, any: phone || email || url };
}

function extractChannexError(channexBody: unknown): string | null {
  if (!channexBody) return null;
  if (typeof channexBody === "string") return channexBody.slice(0, 200);
  if (typeof channexBody === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = channexBody as any;
    if (obj.errors) {
      if (Array.isArray(obj.errors)) {
        return obj.errors.map((e: unknown) => typeof e === "string" ? e : JSON.stringify(e)).join("; ").slice(0, 200);
      }
      return JSON.stringify(obj.errors).slice(0, 200);
    }
    if (obj.error) return String(obj.error).slice(0, 200);
    if (obj.message) return String(obj.message).slice(0, 200);
  }
  return null;
}

// ============ Left: Conversation list ============

function ConversationList({
  filter, setFilter, search, setSearch, threads, activeId, onSelect, mounted,
}: {
  filter: Filter; setFilter: (f: Filter) => void;
  search: string; setSearch: (s: string) => void;
  threads: ThreadRow[]; activeId: string | null;
  onSelect: (id: string) => void; mounted: boolean;
}) {
  const filters: { key: Filter; label: string; disabled?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "needs_reply", label: "Needs Reply" },
    { key: "ai_drafted", label: "AI Drafted", disabled: true },
  ];

  // Mobile: full-width when no thread active; hidden when one is open
  // (the ThreadColumn takes the full screen instead). Desktop (md+):
  // always visible at 340px.
  const mobileVisibility = activeId ? "hidden md:flex" : "flex";
  return (
    <aside
      className={`flex-shrink-0 flex-col w-full md:w-[340px] ${mobileVisibility} ${mounted ? "animate-fadeSlideIn" : "opacity-0"}`}
      style={{ borderRight: "1px solid var(--dry-sand)", animationDelay: "0ms" }}
    >
      <div className="p-4 pb-3">
        <div className="relative">
          <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--tideline)" }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guests..."
            className="w-full outline-none transition-all"
            style={{ padding: "9px 12px 9px 34px", border: "1.5px solid var(--dry-sand)", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "var(--coastal)", backgroundColor: "rgba(255,255,255,0.7)" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--golden)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--dry-sand)"; e.currentTarget.style.boxShadow = ""; }}
          />
        </div>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const active = filter === f.key;
          const disabled = f.disabled;
          return (
            <button
              key={f.key} type="button" disabled={disabled}
              onClick={() => !disabled && setFilter(f.key)}
              className="text-[11px] font-semibold transition-colors"
              style={{
                padding: "5px 10px", borderRadius: 12,
                backgroundColor: active ? "var(--coastal)" : disabled ? "rgba(237,231,219,0.4)" : "var(--shore)",
                color: active ? "var(--shore)" : disabled ? "var(--shell)" : "var(--tideline)",
                border: active ? "1px solid var(--coastal)" : "1px solid var(--dry-sand)",
                opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer",
              }}
              title={disabled ? "Coming soon" : undefined}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ borderTop: "1px solid var(--dry-sand)" }}>
        {threads.length === 0 ? (
          <div className="p-6 text-center text-[13px]" style={{ color: "var(--tideline)" }}>
            No conversations yet
          </div>
        ) : (
          threads.map((t, i) => (
            <ConversationItem key={t.id} t={t} active={activeId === t.id} index={i} onSelect={() => onSelect(t.id)} />
          ))
        )}
      </div>
    </aside>
  );
}

function ThreadKindBadge({ kind }: { kind: string }) {
  if (kind === "inquiry") {
    return (
      <span className="inline-flex items-center px-1.5 rounded text-[10px] font-semibold flex-shrink-0"
        style={{ height: 16, backgroundColor: "var(--shore)", color: "var(--tideline)", border: "1px solid var(--dry-sand)" }}
        title="Pre-booking inquiry"
      >
        Inquiry
      </span>
    );
  }
  if (kind === "reservation_request") {
    return (
      <span className="inline-flex items-center px-1.5 rounded text-[10px] font-bold flex-shrink-0"
        style={{ height: 16, backgroundColor: "rgba(212,150,11,0.12)", color: "var(--amber-tide)" }}
        title="Reservation request — time-sensitive (Airbnb 24h response gate)"
      >
        Reservation request
      </span>
    );
  }
  return null;
}

function ConversationItem({ t, active, index, onSelect }: {
  t: ThreadRow; active: boolean; index: number; onSelect: () => void;
}) {
  const platformKey = platformKeyFrom(t.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;
  const isUnread = (t.unread_count ?? 0) > 0;

  return (
    <button
      type="button" onClick={onSelect}
      className="koast-convo-item w-full text-left flex items-start gap-3 px-4 py-3 transition-colors"
      style={{
        borderBottom: "1px solid rgba(237,231,219,0.5)",
        backgroundColor: active ? "rgba(196,154,90,0.06)" : "transparent",
        borderLeft: active ? "3px solid var(--golden)" : "3px solid transparent",
        animationDelay: `${index * 50}ms`,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "rgba(237,231,219,0.3)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <div className="relative flex-shrink-0">
        <div className="flex items-center justify-center text-white font-bold"
          style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, var(--mangrove), var(--tideline))", fontSize: 13 }}
        >
          {initialsFor(t.guest_display_name)}
        </div>
        {platform && (
          <div className="absolute"
            style={{ right: -2, bottom: -2, width: 18, height: 18, borderRadius: 5, backgroundColor: platform.color, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}
            title={platform.name}
          >
            <Image src={platform.iconWhite} alt={platform.name} width={9} height={9} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-semibold truncate" style={{ color: "var(--coastal)" }}>
              {t.guest_display_name}
            </span>
            <ThreadKindBadge kind={t.thread_kind} />
          </div>
          <span className="text-[11px] flex-shrink-0" style={{ color: "var(--tideline)" }}>
            {relativeTime(t.last_message_received_at)}
          </span>
        </div>
        <div className="text-[11px] truncate mt-[1px]" style={{ color: "var(--tideline)" }}>
          {t.property_name}
        </div>
        <div className="flex items-start gap-2 mt-1">
          <p className="text-[12px] flex-1 line-clamp-2 leading-[1.35]" style={{ color: "var(--tideline)" }}>
            {t.last_message_preview ?? ""}
          </p>
          {isUnread && (
            <span className="flex-shrink-0 mt-[5px] rounded-full"
              style={{ width: 8, height: 8, backgroundColor: "var(--golden)" }} />
          )}
        </div>
      </div>
    </button>
  );
}

// ============ Center: Thread ============

function ThreadColumn({
  thread, messages, loading, threadScrollRef, mounted,
  composer, setComposer, onSend, onRetry, sending, onBack,
}: {
  thread: ThreadRow | null;
  messages: MessageRow[];
  loading: boolean;
  threadScrollRef: React.RefObject<HTMLDivElement>;
  mounted: boolean;
  composer: string;
  setComposer: (v: string) => void;
  onSend: () => void;
  onRetry: (msg: MessageRow) => void;
  sending: boolean;
  onBack: () => void;
}) {
  const messagesByDay = useMemo(() => {
    const groups: { label: string; messages: MessageRow[] }[] = [];
    let currentLabel = "";
    for (const msg of messages) {
      const ts = msg.channex_inserted_at ?? msg.created_at;
      const label = dateDividerLabel(ts);
      if (label !== currentLabel) { groups.push({ label, messages: [] }); currentLabel = label; }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [messages]);

  // Mobile: hidden when no thread selected (ConversationList takes
  // full screen); full-width and active when one is open.
  // Desktop: flex-1 fills the middle column always; renders
  // EmptyThreadState when nothing is selected.
  if (!thread) {
    return (
      <div className="hidden md:flex flex-1 min-w-0">
        <EmptyThreadState />
      </div>
    );
  }

  const platformKey = platformKeyFrom(thread.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;

  return (
    <div className={`flex flex-1 min-w-0 flex-col ${mounted ? "animate-fadeSlideIn" : "opacity-0"}`} style={{ animationDelay: "150ms" }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 py-4 flex items-center justify-between bg-white" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        <div className="min-w-0 flex items-center gap-2">
          {/* Mobile-only back button — returns to the conversation list */}
          <button
            type="button"
            onClick={onBack}
            className="md:hidden flex items-center justify-center flex-shrink-0 rounded-lg transition-colors"
            style={{ width: 34, height: 34, color: "var(--coastal)", backgroundColor: "rgba(196,154,90,0.08)" }}
            aria-label="Back to inbox"
          >
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-bold truncate" style={{ color: "var(--coastal)" }}>
              {thread.guest_display_name}
            </span>
            {platform && (
              <span className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold flex-shrink-0"
                style={{ height: 18, backgroundColor: platform.colorLight, color: platform.color }}
              >
                <Image src={platform.icon} alt={platform.name} width={10} height={10} />
                {platform.name}
              </span>
            )}
            <ThreadKindBadge kind={thread.thread_kind} />
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: "var(--tideline)" }}>
            {thread.property_name}
          </div>
          </div>
        </div>
        {/* Phone + more buttons hidden on mobile (the back button takes priority); shown on md+ */}
        <div className="hidden md:flex items-center gap-1 flex-shrink-0">
          <button type="button" disabled
            className="flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: 34, height: 34, color: "var(--tideline)", border: "1px solid var(--dry-sand)", backgroundColor: "#fff" }}
            title="Coming soon"
          >
            <Phone size={14} strokeWidth={2} />
          </button>
          <button type="button" disabled
            className="flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: 34, height: 34, color: "var(--tideline)", border: "1px solid var(--dry-sand)", backgroundColor: "#fff" }}
            title="Coming soon"
          >
            <MoreHorizontal size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={threadScrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5" style={{ backgroundColor: "var(--shore)" }}>
        {loading && messages.length === 0 ? (
          <div className="text-center text-[13px]" style={{ color: "var(--tideline)" }}>Loading…</div>
        ) : messagesByDay.length === 0 ? (
          <div className="text-center text-[13px]" style={{ color: "var(--tideline)" }}>No messages in this conversation yet.</div>
        ) : (
          messagesByDay.map((group) => (
            <div key={group.label}>
              <DateDivider label={group.label} />
              <div className="mt-3 space-y-3">
                {group.messages.map((msg) => (
                  <MessageBubble key={msg.__optimistic?.clientId ?? msg.id} msg={msg} platform={platform} onRetry={onRetry} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Content filter warning (Airbnb only — anti-disintermediation) */}
      <ContentFilterWarning composer={composer} platform={thread.platform} />

      {/* Compose bar — slice 2. Optimistic UI; failures surface inline on the bubble (see MessageBubble). */}
      <div className="flex-shrink-0 bg-white" style={{ borderTop: "1px solid var(--dry-sand)" }}>
        <div className="px-4 py-3 flex items-end gap-2">
          <button type="button" disabled
            className="flex items-center justify-center flex-shrink-0 self-center"
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg, var(--golden), #a87d3a)",
              color: "var(--deep-sea)", fontWeight: 800, fontSize: 15,
              opacity: 0.45, cursor: "not-allowed",
              boxShadow: "0 2px 8px rgba(196,154,90,0.25)",
            }}
            title="Koast AI — coming in slice 3"
          >
            K
          </button>
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 outline-none transition-all resize-none"
            style={{
              padding: "11px 14px", border: "1.5px solid var(--dry-sand)", borderRadius: 12,
              fontSize: 13, fontWeight: 500, color: "var(--coastal)",
              backgroundColor: "rgba(255,255,255,0.7)",
              minHeight: 44, maxHeight: 160, fontFamily: "inherit",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--golden)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--dry-sand)"; e.currentTarget.style.boxShadow = ""; }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(160, el.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setComposer("");
                return;
              }
              const sendCombo = e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey);
              if (sendCombo) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!composer.trim() || sending}
            className="flex items-center justify-center flex-shrink-0 self-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "var(--coastal)", color: "var(--shore)" }}
            title={sending ? "Sending…" : "Send"}
          >
            <Send size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ContentFilterWarning({ composer, platform }: { composer: string; platform: string }) {
  if (platform !== "airbnb") return null;
  const detection = detectFilteredContent(composer);
  if (!detection.any) return null;
  const matched = [
    detection.phone && "phone numbers",
    detection.email && "emails",
    detection.url && "external links",
  ].filter(Boolean).join(", ");
  return (
    <div
      className="flex-shrink-0 px-4 py-2 flex items-start gap-2"
      style={{
        backgroundColor: "rgba(212,150,11,0.08)",
        borderTop: "1px solid rgba(212,150,11,0.18)",
        color: "var(--amber-tide)",
      }}
    >
      <AlertTriangle size={13} strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
      <p className="text-[12px] leading-[1.4]">
        Airbnb may filter {matched} from this message. Send anyway if needed.
      </p>
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1" style={{ height: 1, backgroundColor: "var(--dry-sand)" }} />
      <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--tideline)" }}>{label}</div>
      <div className="flex-1" style={{ height: 1, backgroundColor: "var(--dry-sand)" }} />
    </div>
  );
}

function MessageBubble({ msg, platform, onRetry }: {
  msg: MessageRow;
  platform: { name: string; color: string; colorLight: string; icon: string } | null;
  onRetry: (msg: MessageRow) => void;
}) {
  const isInbound = msg.direction === "inbound";
  const attribution = isInbound && platform ? `via ${platform.name}` : null;
  const ts = msg.channex_inserted_at ?? msg.created_at;
  const status = msg.__optimistic?.status;
  // Visual: muted bubble while sending, coral border + retry on failed.
  const bubbleOpacity = status === "sending" ? 0.55 : 1;
  const bubbleBorder = status === "failed" ? "1.5px solid var(--coral-reef)" : "none";

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[70%] flex flex-col" style={{ alignItems: isInbound ? "flex-start" : "flex-end" }}>
        <div className="px-4 py-2.5"
          style={{
            borderRadius: 14,
            backgroundColor: isInbound ? "#fff" : "var(--coastal)",
            color: isInbound ? "var(--coastal)" : "var(--shore)",
            boxShadow: isInbound ? "var(--shadow-card)" : "none",
            fontSize: 13, lineHeight: 1.45,
            opacity: bubbleOpacity,
            border: bubbleBorder,
            transition: "opacity 0.2s ease-out",
          }}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        <div className="text-[10px] mt-1 flex items-center gap-1.5 flex-wrap justify-end" style={{ color: "var(--tideline)" }}>
          <span>{timeOfDay(ts)}</span>
          {attribution && <span>· {attribution}</span>}
          {!isInbound && status === "sending" && <span>· Sending…</span>}
          {!isInbound && (status === "sent" || !status) && <span>· Sent</span>}
          {!isInbound && status === "failed" && (
            <>
              <span style={{ color: "var(--coral-reef)" }}>· Failed</span>
              <button
                type="button"
                onClick={() => onRetry(msg)}
                className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-md transition-colors"
                style={{
                  backgroundColor: "rgba(196,64,64,0.08)",
                  color: "var(--coral-reef)",
                  fontSize: 10,
                  fontWeight: 600,
                  border: "1px solid rgba(196,64,64,0.2)",
                }}
                title={msg.__optimistic?.error ?? "Retry"}
              >
                <RotateCcw size={9} strokeWidth={2} />
                Retry
              </button>
            </>
          )}
        </div>
        {!isInbound && status === "failed" && msg.__optimistic?.error && (
          <p className="text-[10px] mt-1 max-w-[280px] text-right" style={{ color: "var(--coral-reef)" }}>
            {msg.__optimistic.error}
          </p>
        )}
      </div>
    </div>
  );
}

// ============ Right: Guest context ============

function GuestContextPanel({ thread, property, mounted }: {
  thread: ThreadRow | null;
  property: PropertyInfo | null;
  mounted: boolean;
}) {
  if (!thread) return null;
  const todayStr = new Date().toISOString().split("T")[0];
  const platformKey = platformKeyFrom(thread.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;

  let bookingStatus: "Checked in" | "Upcoming" | "Checked out" | null = null;
  let statusColor: "lagoon" | "golden" | "tideline" = "tideline";
  if (thread.check_in && thread.check_out) {
    if (thread.check_in <= todayStr && thread.check_out > todayStr) { bookingStatus = "Checked in"; statusColor = "lagoon"; }
    else if (thread.check_in > todayStr) { bookingStatus = "Upcoming"; statusColor = "golden"; }
    else { bookingStatus = "Checked out"; statusColor = "tideline"; }
  }

  return (
    <aside
      // Hidden on mobile entirely (the inbox is a two-column experience
      // there: list ↔ thread, no context panel). Shown at 300px on md+.
      className={`flex-shrink-0 hidden md:flex flex-col bg-white overflow-y-auto md:w-[300px] ${mounted ? "animate-fadeSlideIn" : "opacity-0"}`}
      style={{ borderLeft: "1px solid var(--dry-sand)", animationDelay: "300ms" }}
    >
      <div className="p-5" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        <SectionLabel label="Guest info" />
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center text-white font-bold"
            style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, var(--mangrove), var(--tideline))", fontSize: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}
          >
            {initialsFor(thread.guest_display_name)}
          </div>
          <div className="mt-3 text-[15px] font-bold" style={{ color: "var(--coastal)" }}>
            {firstNameLastInitial(thread.guest_display_name)}
          </div>
          {platform && (
            <span className="mt-1.5 inline-flex items-center gap-1 px-2 rounded text-[10px] font-semibold"
              style={{ height: 18, backgroundColor: platform.colorLight, color: platform.color }}
            >
              <Image src={platform.icon} alt={platform.name} width={10} height={10} />
              {platform.name}
            </span>
          )}
          <div className="mt-2 text-[11px]" style={{ color: "var(--tideline)" }}>
            via {platform?.name ?? thread.provider_raw}
          </div>
        </div>
      </div>

      {thread.check_in && thread.check_out && property && bookingStatus && (
        <div className="p-5" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
          <SectionLabel label="Current booking" />
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 overflow-hidden" style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "var(--dry-sand)" }}>
              {property.cover_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={property.cover_photo_url} alt={property.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-shell"><User size={16} /></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate" style={{ color: "var(--coastal)" }}>{property.name}</div>
              <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
                {[property.city, property.state].filter(Boolean).join(", ")}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 text-[12px]" style={{ color: "var(--tideline)" }}>
            <div className="flex items-center justify-between">
              <span>Dates</span>
              <span className="font-semibold" style={{ color: "var(--coastal)" }}>
                {shortDateRange(thread.check_in, thread.check_out)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Nights</span>
              <span className="font-semibold" style={{ color: "var(--coastal)" }}>
                {nightsBetween(thread.check_in, thread.check_out)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Guests</span>
              <span className="font-semibold" style={{ color: "var(--coastal)" }}>{thread.num_guests ?? 1}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Payout</span>
              <span className="font-bold tabular-nums" style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}>
                ${(thread.total_price ?? 0).toLocaleString("en-US")}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold"
              style={{
                backgroundColor: statusColor === "lagoon" ? "rgba(26,122,90,0.1)" : statusColor === "golden" ? "rgba(196,154,90,0.1)" : "rgba(61,107,82,0.1)",
                color: `var(--${statusColor})`,
              }}
            >
              <span className="rounded-full" style={{ width: 6, height: 6, backgroundColor: `var(--${statusColor})` }} />
              {bookingStatus}
            </span>
          </div>
        </div>
      )}

      <div className="p-5">
        <SectionLabel label="Quick actions" />
        <div className="space-y-2">
          {thread.booking_id && (
            <Link href={`/calendar?property=${thread.property_id}`}
              className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors"
              style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--dry-sand)", backgroundColor: "#fff", color: "var(--coastal)" }}
            >
              View booking
            </Link>
          )}
          <button type="button" disabled
            className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--dry-sand)", backgroundColor: "#fff", color: "var(--coastal)" }}
            title="Coming soon"
          >
            Notify cleaner
          </button>
          <button type="button" disabled
            className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--dry-sand)", backgroundColor: "#fff", color: "var(--coastal)" }}
            title="Coming soon"
          >
            Request review
          </button>
          <button type="button" disabled
            className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(196,64,64,0.2)", backgroundColor: "rgba(196,64,64,0.04)", color: "var(--coral-reef)" }}
            title="Coming soon"
          >
            Report issue
          </button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="mb-3 text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: "var(--golden)" }}>
      {label}
    </div>
  );
}

function EmptyThreadState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8" style={{ backgroundColor: "var(--shore)" }}>
      <div className="flex items-center justify-center mb-5"
        style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "rgba(196,154,90,0.1)", color: "var(--golden)" }}
      >
        <MessageCircle size={30} strokeWidth={1.5} />
      </div>
      <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--coastal)" }}>
        Select a conversation
      </h2>
      <p className="text-[13px] max-w-[320px]" style={{ color: "var(--tideline)" }}>
        Choose a conversation from the list to view messages.
      </p>
    </div>
  );
}
