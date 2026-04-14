"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Send, Phone, MoreHorizontal, MessageCircle, User } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_TEMPLATES, fillTemplate } from "@/lib/templates/messages";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

// ============ Types ============

interface Message {
  id: string;
  property_id: string;
  booking_id: string | null;
  platform: string;
  direction: string;
  sender_name: string | null;
  content: string;
  ai_draft: string | null;
  ai_draft_status: string;
  created_at: string;
}

interface ConversationGroup {
  key: string;
  propertyId: string;
  propertyName: string;
  bookingId: string | null;
  guestName: string;
  platform: string;
  messages: Message[];
  lastMessage: Message;
  unread: boolean;
  needsReply: boolean;
}

interface PropertyInfo {
  id: string;
  name: string;
  city: string | null;
  state?: string | null;
  cover_photo_url?: string | null;
}

interface BookingInfo {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  property_id: string;
  total_price?: number | null;
  num_guests?: number | null;
}

interface UnifiedInboxProps {
  messages: Message[];
  properties: PropertyInfo[];
  bookings: BookingInfo[];
}

type Filter = "all" | "unread" | "needs_reply" | "ai_drafted";

// ============ Helpers ============

function relativeTime(dateStr: string): string {
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
        86400000
    )
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

export default function UnifiedInbox({
  messages: initialMessages,
  properties,
  bookings,
}: UnifiedInboxProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState(initialMessages);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const bookingMap = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  // Group messages into conversations — logic preserved from the old inbox.
  const conversations = useMemo(() => {
    const groups = new Map<string, ConversationGroup>();

    const propInboundNames = new Map<string, string[]>();
    for (const msg of messages) {
      if (msg.direction === "inbound" && msg.sender_name && msg.sender_name !== "Host") {
        if (!propInboundNames.has(msg.property_id)) propInboundNames.set(msg.property_id, []);
        const names = propInboundNames.get(msg.property_id)!;
        if (!names.includes(msg.sender_name)) names.push(msg.sender_name);
      }
    }

    for (const msg of messages) {
      let key: string;
      if (msg.booking_id) {
        key = `${msg.property_id}:${msg.booking_id}`;
      } else if (msg.direction === "inbound" && msg.sender_name) {
        key = `${msg.property_id}:${msg.sender_name}`;
      } else {
        const knownGuests = propInboundNames.get(msg.property_id) ?? [];
        const matched = knownGuests.find((name) => msg.content?.includes(name));
        key = `${msg.property_id}:${matched ?? "thread"}`;
      }

      if (!groups.has(key)) {
        const prop = propMap.get(msg.property_id);
        const booking = msg.booking_id ? bookingMap.get(msg.booking_id) : null;
        const guestName =
          booking?.guest_name ?? (msg.direction === "inbound" ? msg.sender_name : null) ?? "Guest";

        groups.set(key, {
          key,
          propertyId: msg.property_id,
          propertyName: prop?.name ?? "Unknown Property",
          bookingId: msg.booking_id,
          guestName,
          platform: msg.platform,
          messages: [],
          lastMessage: msg,
          unread: false,
          needsReply: false,
        });
      }

      groups.get(key)!.messages.push(msg);
    }

    for (const convo of Array.from(groups.values())) {
      convo.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      convo.lastMessage = convo.messages[convo.messages.length - 1];
      convo.needsReply = convo.lastMessage.direction === "inbound";
      convo.unread = convo.needsReply;
      if (convo.guestName === "Guest" || convo.guestName === "Host") {
        const inbound = convo.messages.find(
          (m) => m.direction === "inbound" && m.sender_name && m.sender_name !== "Host"
        );
        if (inbound?.sender_name) convo.guestName = inbound.sender_name;
      }
    }

    return Array.from(groups.values()).sort((a, b) =>
      b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
    );
  }, [messages, propMap, bookingMap]);

  const filtered = useMemo(() => {
    let result = conversations;
    if (filter === "unread") result = result.filter((c) => c.unread);
    if (filter === "needs_reply") result = result.filter((c) => c.needsReply);
    if (filter === "ai_drafted") {
      result = result.filter((c) => c.messages.some((m) => !!m.ai_draft));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.guestName.toLowerCase().includes(q) || c.propertyName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [conversations, filter, search]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.key === activeConvo) ?? null,
    [conversations, activeConvo]
  );

  // Scroll thread to bottom when conversation changes or new messages arrive
  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeConvo, activeConversation?.messages.length]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConversation || !content.trim()) return;
      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: activeConversation.propertyId,
            bookingId: activeConversation.bookingId,
            platform: activeConversation.platform,
            content: content.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const newMsg: Message = {
          id: data.id,
          property_id: activeConversation.propertyId,
          booking_id: activeConversation.bookingId,
          platform: activeConversation.platform,
          direction: "outbound",
          sender_name: "Host",
          content: content.trim(),
          ai_draft: null,
          ai_draft_status: "none",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newMsg]);
        setComposing("");
        toast("Message sent");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Send failed", "error");
      }
    },
    [activeConversation, toast]
  );

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
      if (!template || !activeConversation) return;
      const booking = activeConversation.bookingId
        ? bookingMap.get(activeConversation.bookingId)
        : null;
      const prop = propMap.get(activeConversation.propertyId);
      const filled = fillTemplate(template.content, {
        property_name: prop?.name,
        guest_name: booking?.guest_name ?? activeConversation.guestName,
        property_city: prop?.city ?? undefined,
      });
      setComposing(filled);
      setSelectedTemplate("");
    },
    [activeConversation, bookingMap, propMap]
  );

  const booking = activeConversation?.bookingId ? bookingMap.get(activeConversation.bookingId) : null;
  const activeProperty = activeConversation ? propMap.get(activeConversation.propertyId) : null;

  return (
    <div className="flex h-full bg-white" style={{ borderTop: "1px solid var(--dry-sand)" }}>
      <style jsx global>{`
        @keyframes koast-convo-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes koast-thread-in { from { opacity: 0; } to { opacity: 1; } }
        .koast-convo-item { opacity: 0; animation: koast-convo-in 0.4s ease-out forwards; }
        .koast-thread { opacity: 0; animation: koast-thread-in 0.4s ease-out 300ms forwards; }
        .koast-context { opacity: 0; animation: koast-thread-in 0.4s ease-out 400ms forwards; }
      `}</style>

      <ConversationList
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        conversations={filtered}
        activeConvo={activeConvo}
        onSelect={setActiveConvo}
      />

      <ThreadColumn
        conversation={activeConversation}
        messages={activeConversation?.messages ?? []}
        composing={composing}
        setComposing={setComposing}
        onSend={() => sendMessage(composing)}
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        applyTemplate={applyTemplate}
        threadScrollRef={threadScrollRef}
      />

      <GuestContextPanel
        conversation={activeConversation}
        booking={booking}
        property={activeProperty ?? null}
      />
    </div>
  );
}

// ============ Left: Conversation list ============

function ConversationList({
  filter,
  setFilter,
  search,
  setSearch,
  conversations,
  activeConvo,
  onSelect,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  search: string;
  setSearch: (s: string) => void;
  conversations: ConversationGroup[];
  activeConvo: string | null;
  onSelect: (key: string) => void;
}) {
  const filters: { key: Filter; label: string; disabled?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "needs_reply", label: "Needs Reply" },
    { key: "ai_drafted", label: "AI Drafted", disabled: true },
  ];

  return (
    <aside
      className="flex-shrink-0 flex flex-col"
      style={{ width: 340, borderRight: "1px solid var(--dry-sand)" }}
    >
      {/* Search */}
      <div className="p-4 pb-3">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--tideline)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guests..."
            className="w-full outline-none transition-all"
            style={{
              padding: "9px 12px 9px 34px",
              border: "1.5px solid var(--dry-sand)",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--coastal)",
              backgroundColor: "rgba(255,255,255,0.7)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--golden)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--dry-sand)";
              e.currentTarget.style.boxShadow = "";
            }}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const active = filter === f.key;
          const disabled = f.disabled;
          return (
            <button
              key={f.key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setFilter(f.key)}
              className="text-[11px] font-semibold transition-colors"
              style={{
                padding: "5px 10px",
                borderRadius: 12,
                backgroundColor: active ? "var(--coastal)" : disabled ? "rgba(237,231,219,0.4)" : "var(--shore)",
                color: active ? "var(--shore)" : disabled ? "var(--shell)" : "var(--tideline)",
                border: active ? "1px solid var(--coastal)" : "1px solid var(--dry-sand)",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
              title={disabled ? "Coming soon" : undefined}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto" style={{ borderTop: "1px solid var(--dry-sand)" }}>
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-[13px]" style={{ color: "var(--tideline)" }}>
            No conversations
          </div>
        ) : (
          conversations.map((convo, i) => (
            <ConversationItem
              key={convo.key}
              convo={convo}
              active={activeConvo === convo.key}
              index={i}
              onSelect={() => onSelect(convo.key)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function ConversationItem({
  convo,
  active,
  index,
  onSelect,
}: {
  convo: ConversationGroup;
  active: boolean;
  index: number;
  onSelect: () => void;
}) {
  const platformKey = platformKeyFrom(convo.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="koast-convo-item w-full text-left flex items-start gap-3 px-4 py-3 transition-colors"
      style={{
        borderBottom: "1px solid rgba(237,231,219,0.5)",
        backgroundColor: active ? "rgba(196,154,90,0.06)" : "transparent",
        borderLeft: active ? "3px solid var(--golden)" : "3px solid transparent",
        animationDelay: `${index * 50}ms`,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "rgba(237,231,219,0.3)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* Avatar + platform badge */}
      <div className="relative flex-shrink-0">
        <div
          className="flex items-center justify-center text-white font-bold"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--mangrove), var(--tideline))",
            fontSize: 13,
          }}
        >
          {initialsFor(convo.guestName)}
        </div>
        {platform && (
          <div
            className="absolute"
            style={{
              right: -2,
              bottom: -2,
              width: 18,
              height: 18,
              borderRadius: 5,
              backgroundColor: platform.color,
              border: "2px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={platform.name}
          >
            <Image src={platform.iconWhite} alt={platform.name} width={9} height={9} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--coastal)" }}
          >
            {convo.guestName}
          </span>
          <span
            className="text-[11px] flex-shrink-0 ml-2"
            style={{ color: "var(--tideline)" }}
          >
            {relativeTime(convo.lastMessage.created_at)}
          </span>
        </div>
        <div
          className="text-[11px] truncate mt-[1px]"
          style={{ color: "var(--tideline)" }}
        >
          {convo.propertyName}
        </div>
        <div className="flex items-start gap-2 mt-1">
          <p
            className="text-[12px] flex-1 line-clamp-2 leading-[1.35]"
            style={{ color: "var(--tideline)" }}
          >
            {convo.lastMessage.content}
          </p>
          {convo.unread && (
            <span
              className="flex-shrink-0 mt-[5px] rounded-full"
              style={{ width: 8, height: 8, backgroundColor: "var(--golden)" }}
            />
          )}
        </div>
      </div>
    </button>
  );
}

// ============ Center: Thread ============

function ThreadColumn({
  conversation,
  messages,
  composing,
  setComposing,
  onSend,
  selectedTemplate,
  setSelectedTemplate,
  applyTemplate,
  threadScrollRef,
}: {
  conversation: ConversationGroup | null;
  messages: Message[];
  composing: string;
  setComposing: (v: string) => void;
  onSend: () => void;
  selectedTemplate: string;
  setSelectedTemplate: (v: string) => void;
  applyTemplate: (id: string) => void;
  threadScrollRef: React.RefObject<HTMLDivElement>;
}) {
  // Build date-grouped message list — must run unconditionally before
  // any early return so hook order stays stable.
  const messagesByDay = useMemo(() => {
    const groups: { label: string; messages: Message[] }[] = [];
    let currentLabel = "";
    for (const msg of messages) {
      const label = dateDividerLabel(msg.created_at);
      if (label !== currentLabel) {
        groups.push({ label, messages: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [messages]);

  if (!conversation) return <EmptyThreadState />;

  const platformKey = platformKeyFrom(conversation.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;

  return (
    <div className="flex-1 min-w-0 flex flex-col koast-thread">
      {/* Header */}
      <div
        className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-white"
        style={{ borderBottom: "1px solid var(--dry-sand)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[16px] font-bold truncate"
              style={{ color: "var(--coastal)" }}
            >
              {conversation.guestName}
            </span>
            {platform && (
              <span
                className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold flex-shrink-0"
                style={{
                  height: 18,
                  backgroundColor: platform.colorLight,
                  color: platform.color,
                }}
              >
                <Image src={platform.icon} alt={platform.name} width={10} height={10} />
                {platform.name}
              </span>
            )}
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: "var(--tideline)" }}>
            {conversation.propertyName}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 34,
              height: 34,
              color: "var(--tideline)",
              border: "1px solid var(--dry-sand)",
              backgroundColor: "#fff",
            }}
            title="Call guest"
          >
            <Phone size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 34,
              height: 34,
              color: "var(--tideline)",
              border: "1px solid var(--dry-sand)",
              backgroundColor: "#fff",
            }}
            title="More actions"
          >
            <MoreHorizontal size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={threadScrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5"
        style={{ backgroundColor: "var(--shore)" }}
      >
        {messagesByDay.map((group) => (
          <div key={group.label}>
            <DateDivider label={group.label} />
            <div className="mt-3 space-y-3">
              {group.messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} platform={platform} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Compose bar */}
      <div
        className="flex-shrink-0 bg-white"
        style={{ borderTop: "1px solid var(--dry-sand)" }}
      >
        <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(237,231,219,0.5)" }}>
          <select
            value={selectedTemplate}
            onChange={(e) => {
              setSelectedTemplate(e.target.value);
              if (e.target.value) applyTemplate(e.target.value);
            }}
            className="text-[11px] font-semibold transition-colors"
            style={{
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid var(--dry-sand)",
              color: "var(--tideline)",
              backgroundColor: "#fff",
            }}
          >
            <option value="">Templates…</option>
            {DEFAULT_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="px-4 py-3 flex items-end gap-2">
          <button
            type="button"
            disabled
            className="flex items-center justify-center flex-shrink-0 self-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--golden), #a87d3a)",
              color: "var(--deep-sea)",
              fontWeight: 800,
              fontSize: 15,
              opacity: 0.45,
              cursor: "not-allowed",
              boxShadow: "0 2px 8px rgba(196,154,90,0.25)",
            }}
            title="Koast AI — coming soon"
          >
            K
          </button>
          <textarea
            value={composing}
            onChange={(e) => setComposing(e.target.value)}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 outline-none transition-all resize-none"
            style={{
              padding: "11px 14px",
              border: "1.5px solid var(--dry-sand)",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--coastal)",
              backgroundColor: "rgba(255,255,255,0.7)",
              minHeight: 44,
              maxHeight: 160,
              fontFamily: "inherit",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--golden)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--dry-sand)";
              e.currentTarget.style.boxShadow = "";
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(160, el.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!composing.trim()}
            className="flex items-center justify-center flex-shrink-0 self-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "var(--coastal)",
              color: "var(--shore)",
            }}
            title="Send"
          >
            <Send size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1" style={{ height: 1, backgroundColor: "var(--dry-sand)" }} />
      <div
        className="text-[10px] font-bold uppercase tracking-[0.08em]"
        style={{ color: "var(--tideline)" }}
      >
        {label}
      </div>
      <div className="flex-1" style={{ height: 1, backgroundColor: "var(--dry-sand)" }} />
    </div>
  );
}

function MessageBubble({
  msg,
  platform,
}: {
  msg: Message;
  platform: { name: string; color: string; colorLight: string; icon: string } | null;
}) {
  const isInbound = msg.direction === "inbound";
  const attribution = isInbound && platform ? `via ${platform.name}` : null;

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[70%] flex flex-col" style={{ alignItems: isInbound ? "flex-start" : "flex-end" }}>
        <div
          className="px-4 py-2.5"
          style={{
            borderRadius: 14,
            backgroundColor: isInbound ? "#fff" : "var(--coastal)",
            color: isInbound ? "var(--coastal)" : "var(--shore)",
            boxShadow: isInbound ? "var(--shadow-card)" : "none",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        <div
          className="text-[10px] mt-1 flex items-center gap-1.5"
          style={{ color: "var(--tideline)" }}
        >
          <span>{timeOfDay(msg.created_at)}</span>
          {attribution && <span>· {attribution}</span>}
          {!isInbound && <span>· Sent</span>}
        </div>
      </div>
    </div>
  );
}

// ============ Right: Guest context ============

function GuestContextPanel({
  conversation,
  booking,
  property,
}: {
  conversation: ConversationGroup | null;
  booking: BookingInfo | null | undefined;
  property: PropertyInfo | null;
}) {
  if (!conversation) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  const platformKey = platformKeyFrom(conversation.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;

  let bookingStatus: "Checked in" | "Upcoming" | "Checked out" | null = null;
  let statusColor: "lagoon" | "golden" | "tideline" = "tideline";
  if (booking) {
    if (booking.check_in <= todayStr && booking.check_out > todayStr) {
      bookingStatus = "Checked in";
      statusColor = "lagoon";
    } else if (booking.check_in > todayStr) {
      bookingStatus = "Upcoming";
      statusColor = "golden";
    } else {
      bookingStatus = "Checked out";
      statusColor = "tideline";
    }
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col bg-white koast-context overflow-y-auto"
      style={{ width: 300, borderLeft: "1px solid var(--dry-sand)" }}
    >
      {/* Guest info */}
      <div className="p-5" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        <SectionLabel label="Guest info" />
        <div className="flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center text-white font-bold"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--mangrove), var(--tideline))",
              fontSize: 18,
              boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
            }}
          >
            {initialsFor(conversation.guestName)}
          </div>
          <div className="mt-3 text-[15px] font-bold" style={{ color: "var(--coastal)" }}>
            {firstNameLastInitial(conversation.guestName)}
          </div>
          {platform && (
            <span
              className="mt-1.5 inline-flex items-center gap-1 px-2 rounded text-[10px] font-semibold"
              style={{
                height: 18,
                backgroundColor: platform.colorLight,
                color: platform.color,
              }}
            >
              <Image src={platform.icon} alt={platform.name} width={10} height={10} />
              {platform.name}
            </span>
          )}
          <div className="mt-2 text-[11px]" style={{ color: "var(--tideline)" }}>
            Member via {platform?.name ?? "direct"}
          </div>
        </div>
      </div>

      {/* Current booking */}
      {booking && property && bookingStatus && (
        <div className="p-5" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
          <SectionLabel label="Current booking" />
          <div className="flex items-start gap-3 mb-3">
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "var(--dry-sand)" }}
            >
              {property.cover_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={property.cover_photo_url}
                  alt={property.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-shell">
                  <User size={16} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: "var(--coastal)" }}
              >
                {property.name}
              </div>
              <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
                {[property.city, property.state].filter(Boolean).join(", ")}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 text-[12px]" style={{ color: "var(--tideline)" }}>
            <div className="flex items-center justify-between">
              <span>Dates</span>
              <span className="font-semibold" style={{ color: "var(--coastal)" }}>
                {shortDateRange(booking.check_in, booking.check_out)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Nights</span>
              <span className="font-semibold" style={{ color: "var(--coastal)" }}>
                {nightsBetween(booking.check_in, booking.check_out)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Guests</span>
              <span className="font-semibold" style={{ color: "var(--coastal)" }}>
                {booking.num_guests ?? 1}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Payout</span>
              <span
                className="font-bold tabular-nums"
                style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}
              >
                ${(booking.total_price ?? 0).toLocaleString("en-US")}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold"
              style={{
                backgroundColor:
                  statusColor === "lagoon"
                    ? "rgba(26,122,90,0.1)"
                    : statusColor === "golden"
                    ? "rgba(196,154,90,0.1)"
                    : "rgba(61,107,82,0.1)",
                color: `var(--${statusColor})`,
              }}
            >
              <span
                className="rounded-full"
                style={{ width: 6, height: 6, backgroundColor: `var(--${statusColor})` }}
              />
              {bookingStatus}
            </span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="p-5">
        <SectionLabel label="Quick actions" />
        <div className="space-y-2">
          {booking && (
            <Link
              href={`/calendar?property=${booking.property_id}`}
              className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors"
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid var(--dry-sand)",
                backgroundColor: "#fff",
                color: "var(--coastal)",
              }}
            >
              View booking
            </Link>
          )}
          <button
            type="button"
            className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors"
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--dry-sand)",
              backgroundColor: "#fff",
              color: "var(--coastal)",
            }}
          >
            Notify cleaner
          </button>
          <button
            type="button"
            className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors"
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--dry-sand)",
              backgroundColor: "#fff",
              color: "var(--coastal)",
            }}
          >
            Request review
          </button>
          <button
            type="button"
            className="w-full flex items-center justify-center text-[12px] font-semibold transition-colors"
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid rgba(196,64,64,0.2)",
              backgroundColor: "rgba(196,64,64,0.04)",
              color: "var(--coral-reef)",
            }}
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
    <div
      className="mb-3 text-[10px] font-bold tracking-[0.08em] uppercase"
      style={{ color: "var(--golden)" }}
    >
      {label}
    </div>
  );
}

// ============ Empty state ============

function EmptyThreadState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8" style={{ backgroundColor: "var(--shore)" }}>
      <div
        className="flex items-center justify-center mb-5"
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          backgroundColor: "rgba(196,154,90,0.1)",
          color: "var(--golden)",
        }}
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
