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
    <div>
      <div className="flex gap-1 mb-6 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "inbox" ? inboxContent : templatesContent}
    </div>
  );
}
