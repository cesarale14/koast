"use client";

import { useState } from "react";
import type { MemoryFact } from "@/lib/memory-facts";
import { MemorySupersessionInline } from "./MemorySupersessionInline";

function formatLearnedDate(iso: string): { rel: string; abs: string } {
  const t = new Date(iso);
  const abs = t.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return { rel: abs, abs };
}

export function MemoryFactRow({ fact }: { fact: MemoryFact }) {
  const [expanded, setExpanded] = useState(false);
  const hasHistory = fact.supersession_history.length > 0;
  const { rel, abs } = formatLearnedDate(fact.learned_at);

  return (
    <div className="px-5 py-3 border-t border-[var(--hairline)]">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--tideline)] uppercase tracking-wide font-medium">
            {fact.display_label}
          </p>
          <p className="mt-0.5 text-[15px] text-[var(--coastal)] font-mono break-all">
            {fact.display_value}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="text-[12px] text-[var(--tideline)]"
            title={abs}
          >
            <time dateTime={fact.learned_at}>{rel}</time>
          </p>
          {hasHistory && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[12px] text-[var(--lume-deep)] hover:underline"
              aria-expanded={expanded}
            >
              {expanded ? "Hide prior versions" : "Show prior versions"}
            </button>
          )}
        </div>
      </div>
      {hasHistory && expanded && (
        <MemorySupersessionInline history={fact.supersession_history} />
      )}
    </div>
  );
}
