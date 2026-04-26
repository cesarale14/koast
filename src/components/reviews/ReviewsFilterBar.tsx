"use client";

export type ReviewFilter = "all" | "needs_response" | "responded" | "bad" | "private" | "closed";
export type SortKey = "recent" | "oldest" | "lowest_rating" | "highest_rating" | "needs_response";

interface ReviewsFilterBarProps {
  active: Set<ReviewFilter>;
  counts: Record<ReviewFilter, number>;
  onChangeFilter: (next: Set<ReviewFilter>) => void;
  sort: SortKey;
  onChangeSort: (s: SortKey) => void;
  channelFilter: string;
  availableChannels: string[];
  onChangeChannel: (c: string) => void;
}

// RDX-6 — "Closed" bucket holds expired-unreplied reviews. Default
// 'All' view excludes these so they don't drag down "Needs response"
// (the response window is over, action isn't possible). Click the
// Closed chip to surface them as muted history.
const CHIPS: Array<{ key: ReviewFilter; label: string; muted?: boolean }> = [
  { key: "all", label: "All" },
  { key: "needs_response", label: "Needs response" },
  { key: "responded", label: "Responded" },
  { key: "bad", label: "Bad reviews" },
  { key: "private", label: "Private feedback" },
  { key: "closed", label: "Closed", muted: true },
];

function Chip({
  label,
  count,
  active,
  muted,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  const activeBg = muted ? "var(--tideline)" : "var(--coastal)";
  const idleColor = muted ? "var(--tideline)" : "var(--coastal)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors"
      style={{
        borderRadius: 999,
        border: `1px solid ${active ? activeBg : "var(--dry-sand)"}`,
        background: active ? activeBg : "#fff",
        color: active ? "var(--shore)" : idleColor,
      }}
    >
      <span>{label}</span>
      <span
        className="text-[10px] font-bold"
        style={{
          background: active ? "rgba(247,243,236,0.2)" : "var(--shore)",
          color: active ? "var(--shore)" : "var(--tideline)",
          borderRadius: 999,
          padding: "1px 6px",
        }}
      >
        {count}
      </span>
    </button>
  );
}

export default function ReviewsFilterBar({
  active,
  counts,
  onChangeFilter,
  sort,
  onChangeSort,
  channelFilter,
  availableChannels,
  onChangeChannel,
}: ReviewsFilterBarProps) {
  const toggle = (key: ReviewFilter) => {
    if (key === "all") {
      onChangeFilter(new Set<ReviewFilter>(["all"]));
      return;
    }
    const next = new Set(active);
    next.delete("all");
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size === 0) next.add("all");
    onChangeFilter(next);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            count={counts[c.key] ?? 0}
            active={active.has(c.key)}
            muted={c.muted}
            onClick={() => toggle(c.key)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {availableChannels.length > 1 && (
          <select
            value={channelFilter}
            onChange={(e) => onChangeChannel(e.target.value)}
            className="px-3 py-1.5 text-[12px] bg-white"
            style={{ border: "1px solid var(--dry-sand)", borderRadius: 8, color: "var(--coastal)" }}
          >
            <option value="all">All channels</option>
            {availableChannels.includes("airbnb") && <option value="airbnb">Airbnb</option>}
            {availableChannels.includes("booking_com") && <option value="booking_com">Booking.com</option>}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => onChangeSort(e.target.value as SortKey)}
          className="px-3 py-1.5 text-[12px] bg-white"
          style={{ border: "1px solid var(--dry-sand)", borderRadius: 8, color: "var(--coastal)" }}
        >
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest</option>
          <option value="lowest_rating">Lowest rated</option>
          <option value="highest_rating">Highest rated</option>
          <option value="needs_response">Needs response first</option>
        </select>
      </div>
    </div>
  );
}
