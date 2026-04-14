"use client";

import { useState, type ReactNode } from "react";

interface MessagesPageTabsProps {
  inboxContent: ReactNode;
  templatesContent: ReactNode;
}

const TABS = [
  { key: "inbox", label: "Inbox" },
  { key: "templates", label: "Templates" },
] as const;

export default function MessagesPageTabs({ inboxContent, templatesContent }: MessagesPageTabsProps) {
  const [tab, setTab] = useState<"inbox" | "templates">("inbox");

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-shrink-0 px-6 pt-3 flex gap-6 bg-white"
        style={{ borderBottom: "1px solid var(--dry-sand)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="pb-3 text-[13px] font-semibold transition-colors"
              style={{
                color: active ? "var(--coastal)" : "var(--tideline)",
                borderBottom: active ? "2px solid var(--golden)" : "2px solid transparent",
                marginBottom: -1,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = "var(--coastal)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = "var(--tideline)";
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "inbox" ? inboxContent : (
          <div className="max-w-[1200px] mx-auto p-8 overflow-y-auto h-full">{templatesContent}</div>
        )}
      </div>
    </div>
  );
}
