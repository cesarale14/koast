"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_TEMPLATES, fillTemplate } from "@/lib/templates/messages";

// ---------- Types ----------

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
}

interface BookingInfo {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  property_id: string;
}

interface UnifiedInboxProps {
  messages: Message[];
  properties: PropertyInfo[];
  bookings: BookingInfo[];
}

// ---------- Helpers ----------

const platformColors: Record<string, string> = {
  airbnb: "bg-red-50 text-red-700",
  vrbo: "bg-indigo-50 text-indigo-700",
  booking_com: "bg-blue-50 text-blue-700",
  direct: "bg-emerald-50 text-emerald-700",
};

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb", vrbo: "VRBO", booking_com: "Booking", direct: "Direct",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ---------- Main Component ----------

export default function UnifiedInbox({ messages: initialMessages, properties, bookings }: UnifiedInboxProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState(initialMessages);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "needs_reply">("all");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState("");
  const [draftLoading, setDraftLoading] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const bookingMap = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  // Group messages into conversations
  const conversations = useMemo(() => {
    const groups = new Map<string, ConversationGroup>();

    for (const msg of messages) {
      // Group by property + booking (or property + sender for non-booked)
      const key = msg.booking_id
        ? `${msg.property_id}:${msg.booking_id}`
        : `${msg.property_id}:${msg.sender_name ?? "unknown"}`;

      if (!groups.has(key)) {
        const prop = propMap.get(msg.property_id);
        const booking = msg.booking_id ? bookingMap.get(msg.booking_id) : null;
        const guestName = booking?.guest_name ?? msg.sender_name ?? "Unknown Guest";

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

    // Sort messages within each conversation and determine status
    for (const convo of Array.from(groups.values())) {
      convo.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      convo.lastMessage = convo.messages[convo.messages.length - 1];
      convo.needsReply = convo.lastMessage.direction === "inbound";
      convo.unread = convo.needsReply;
    }

    // Sort conversations by most recent
    return Array.from(groups.values()).sort(
      (a, b) => b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
    );
  }, [messages, propMap, bookingMap]);

  const filtered = useMemo(() => {
    let result = conversations;
    if (filter === "unread") result = result.filter((c) => c.unread);
    if (filter === "needs_reply") result = result.filter((c) => c.needsReply);
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

  // Generate AI draft
  const generateDraft = useCallback(async (messageId: string) => {
    setDraftLoading(messageId);
    try {
      const res = await fetch("/api/messages/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setEditingDraft(messageId);
      setDraftText(data.draft);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, ai_draft: data.draft, ai_draft_status: "generated" } : m
        )
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Draft failed", "error");
    }
    setDraftLoading(null);
  }, [toast]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
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

      // Add to local messages
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
      setEditingDraft(null);
      setDraftText("");
      toast("Message sent");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Send failed", "error");
    }
  }, [activeConversation, toast]);

  // Apply template
  const applyTemplate = useCallback((templateId: string) => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    if (!template || !activeConversation) return;
    const booking = activeConversation.bookingId
      ? bookingMap.get(activeConversation.bookingId)
      : null;
    const prop = propMap.get(activeConversation.propertyId);
    const filled = fillTemplate(template.content, {
      property_name: prop?.name,
      guest_name: booking?.guest_name ?? activeConversation.guestName,
      property_city: prop?.city,
    });
    setComposing(filled);
    setSelectedTemplate("");
  }, [activeConversation, bookingMap, propMap]);

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Left panel: conversation list */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        {/* Filter tabs */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3">
            {([["all", "All"], ["unread", "Unread"], ["needs_reply", "Needs Reply"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guests..."
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              {messages.length === 0 ? "No messages yet" : "No matches"}
            </div>
          ) : (
            filtered.map((convo) => (
              <div
                key={convo.key}
                onClick={() => setActiveConvo(convo.key)}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-colors ${
                  activeConvo === convo.key ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
                  {initials(convo.guestName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{convo.guestName}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(convo.lastMessage.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{convo.propertyName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${platformColors[convo.platform] ?? "bg-gray-100 text-gray-500"}`}>
                      {platformLabels[convo.platform] ?? convo.platform}
                    </span>
                    <p className="text-xs text-gray-500 truncate flex-1">{convo.lastMessage.content}</p>
                    {convo.unread && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: conversation thread */}
      <div className="flex-1 flex flex-col">
        {activeConversation ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{activeConversation.guestName}</h2>
                  <p className="text-xs text-gray-400">
                    {activeConversation.propertyName} ·{" "}
                    <span className={`font-medium ${platformColors[activeConversation.platform]?.split(" ")[1] ?? "text-gray-500"}`}>
                      {platformLabels[activeConversation.platform] ?? activeConversation.platform}
                    </span>
                    {activeConversation.bookingId && (() => {
                      const b = bookingMap.get(activeConversation.bookingId!);
                      return b ? ` · ${b.check_in} → ${b.check_out}` : "";
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeConversation.messages.map((msg) => {
                const isInbound = msg.direction === "inbound";
                return (
                  <div key={msg.id}>
                    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                        isInbound ? "bg-gray-100 text-gray-900 rounded-bl-md" : "bg-blue-600 text-white rounded-br-md"
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <div className={`flex items-center gap-2 mt-1 ${isInbound ? "text-gray-400" : "text-blue-200"}`}>
                          <span className="text-[10px]">
                            {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                          {msg.ai_draft_status === "sent" && (
                            <span className="text-[10px]">🤖</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* AI draft area for inbound messages */}
                    {isInbound && msg.ai_draft_status !== "sent" && (
                      <div className="mt-2 ml-4">
                        {draftLoading === msg.id ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                            Generating AI draft...
                          </div>
                        ) : editingDraft === msg.id ? (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                            <p className="text-[10px] text-blue-500 font-medium mb-2">AI DRAFT</p>
                            <textarea
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              className="w-full p-2 text-sm bg-white border border-blue-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-blue-400"
                              rows={3}
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => sendMessage(draftText)}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                              >
                                Send as-is
                              </button>
                              <button
                                onClick={() => { setComposing(draftText); setEditingDraft(null); }}
                                className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                              >
                                Edit & Send
                              </button>
                              <button
                                onClick={() => { setEditingDraft(null); setDraftText(""); }}
                                className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        ) : msg.ai_draft ? (
                          <button
                            onClick={() => { setEditingDraft(msg.id); setDraftText(msg.ai_draft!); }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View AI draft
                          </button>
                        ) : (
                          <button
                            onClick={() => generateDraft(msg.id)}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Generate AI Draft
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Compose area */}
            <div className="border-t border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={selectedTemplate}
                  onChange={(e) => { setSelectedTemplate(e.target.value); applyTemplate(e.target.value); }}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-600"
                >
                  <option value="">Templates...</option>
                  {DEFAULT_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const lastInbound = activeConversation.messages.filter((m) => m.direction === "inbound").pop();
                    if (lastInbound) generateDraft(lastInbound.id);
                  }}
                  className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI Draft
                </button>
                <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${platformColors[activeConversation.platform] ?? "bg-gray-100 text-gray-500"}`}>
                  via {platformLabels[activeConversation.platform] ?? activeConversation.platform}
                </span>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={composing}
                  onChange={(e) => setComposing(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(composing);
                    }
                  }}
                />
                <button
                  onClick={() => sendMessage(composing)}
                  disabled={!composing.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 self-end transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
