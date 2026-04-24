"use client";

export type ReviewFilter =
  | "all"
  | "needs_response"
  | "responded"
  | "bad"
  | "private";

interface ChipDef {
  key: ReviewFilter;
  label: string;
}

const CHIPS: ChipDef[] = [
  { key: "all", label: "All" },
  { key: "needs_response", label: "Needs response" },
  { key: "responded", label: "Responded" },
  { key: "bad", label: "Bad reviews" },
  { key: "private", label: "Private feedback" },
];

export default function ReviewFilterChips({
  active,
  counts,
  onChange,
}: {
  active: Set<ReviewFilter>;
  counts: Record<ReviewFilter, number>;
  onChange: (next: Set<ReviewFilter>) => void;
}) {
  const toggle = (key: ReviewFilter) => {
    const next = new Set(active);
    if (key === "all") {
      onChange(new Set<ReviewFilter>(["all"]));
      return;
    }
    next.delete("all");
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size === 0) next.add("all");
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHIPS.map((chip) => {
        const isActive = active.has(chip.key);
        const count = counts[chip.key];
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => toggle(chip.key)}
            className="inline-flex items-center gap-2 transition-colors"
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              border: isActive ? "1px solid transparent" : "1px solid var(--dry-sand)",
              background: isActive ? "var(--coastal)" : "#fff",
              color: isActive ? "var(--shore)" : "var(--tideline)",
            }}
          >
            <span>{chip.label}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                opacity: 0.8,
                padding: "0 6px",
                borderRadius: 999,
                background: isActive ? "rgba(255,255,255,0.15)" : "var(--shore)",
                color: isActive ? "var(--shore)" : "var(--tideline)",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
