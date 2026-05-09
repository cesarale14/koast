import type { MemorySupersessionEntry } from "@/lib/memory-facts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MemorySupersessionInline({
  history,
}: {
  history: MemorySupersessionEntry[];
}) {
  return (
    <ol className="mt-3 pl-4 border-l-2 border-[var(--hairline)] space-y-2">
      {history.map((entry) => (
        <li key={entry.id} className="text-[13px] text-[var(--tideline)]">
          <span>Was </span>
          <span className="font-mono text-[var(--coastal)] break-all">
            {entry.display_value || "—"}
          </span>
          <span> — replaced {formatDate(entry.superseded_at)} </span>
          <span>{entry.reason_label}</span>
        </li>
      ))}
    </ol>
  );
}
