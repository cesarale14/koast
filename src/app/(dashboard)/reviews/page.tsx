"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MailX, Plug, Settings, CheckCircle2 } from "lucide-react";
import KoastEmptyState from "@/components/polish/KoastEmptyState";
import ReviewCard, { type ReviewCardModel } from "@/components/reviews/ReviewCard";
import ReviewFilterChips, { type ReviewFilter } from "@/components/reviews/ReviewFilterChips";
import ReviewSkeletonCard from "@/components/reviews/ReviewSkeletonCard";
import ReviewsSettingsModal from "@/components/reviews/ReviewsSettingsModal";

type SortKey = "recent" | "lowest_rating" | "needs_response";

interface PropertyLite {
  id: string;
  name: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewCardModel[]>([]);
  const [userProperties, setUserProperties] = useState<PropertyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [activeFilters, setActiveFilters] = useState<Set<ReviewFilter>>(new Set<ReviewFilter>(["all"]));
  const [sort, setSort] = useState<SortKey>("recent");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/pending");
      const d = await res.json();
      setReviews(d.reviews ?? []);
      setUserProperties(d.properties ?? []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter reviews by property selector first
  const propertyScoped = useMemo(() => {
    if (propertyFilter === "all") return reviews;
    return reviews.filter((r) => r.property_id === propertyFilter);
  }, [reviews, propertyFilter]);

  // Detect multi-channel presence on the current scope
  const availableChannels = useMemo(() => {
    const s = new Set(propertyScoped.map((r) => r.platform));
    return Array.from(s);
  }, [propertyScoped]);

  // Apply channel + chip filters
  const visible = useMemo(() => {
    let list = propertyScoped;
    if (channelFilter !== "all") list = list.filter((r) => r.platform === channelFilter);
    if (!activeFilters.has("all")) {
      list = list.filter((r) => {
        if (activeFilters.has("needs_response") && r.response_sent) return false;
        if (activeFilters.has("responded") && !r.response_sent) return false;
        if (activeFilters.has("bad")) {
          const bad = r.is_bad_review || (r.incoming_rating != null && r.incoming_rating < 4);
          if (!bad) return false;
        }
        if (activeFilters.has("private") && !r.private_feedback) return false;
        return true;
      });
    }
    const sorted = [...list];
    if (sort === "recent") {
      sorted.sort((a, b) => (b.incoming_date ?? "").localeCompare(a.incoming_date ?? ""));
    } else if (sort === "lowest_rating") {
      sorted.sort((a, b) => (a.incoming_rating ?? 5) - (b.incoming_rating ?? 5));
    } else {
      sorted.sort((a, b) => Number(a.response_sent) - Number(b.response_sent));
    }
    return sorted;
  }, [propertyScoped, channelFilter, activeFilters, sort]);

  const counts = useMemo<Record<ReviewFilter, number>>(() => {
    const scope = channelFilter === "all"
      ? propertyScoped
      : propertyScoped.filter((r) => r.platform === channelFilter);
    return {
      all: scope.length,
      needs_response: scope.filter((r) => !r.response_sent).length,
      responded: scope.filter((r) => r.response_sent).length,
      bad: scope.filter((r) => r.is_bad_review || (r.incoming_rating != null && r.incoming_rating < 4)).length,
      private: scope.filter((r) => !!r.private_feedback).length,
    };
  }, [propertyScoped, channelFilter]);

  // Empty state selection
  const hasAnyReviews = propertyScoped.length > 0;
  const hasAnyProperty = userProperties.length > 0;
  const allResponded = hasAnyReviews && counts.needs_response === 0 && activeFilters.has("all");

  const activePropertyName = propertyFilter === "all"
    ? (userProperties[0]?.name ?? "Properties")
    : (userProperties.find((p) => p.id === propertyFilter)?.name ?? "Property");
  const settingsPropertyId = propertyFilter === "all" ? (userProperties[0]?.id ?? null) : propertyFilter;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold mb-1" style={{ color: "var(--coastal)" }}>Reviews</h1>
          <p className="text-[13px]" style={{ color: "var(--tideline)" }}>
            Replies sync to Airbnb and Booking.com via Channex.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userProperties.length > 1 && (
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="px-3 py-2 text-[13px] bg-white"
              style={{ border: "1px solid var(--dry-sand)", borderRadius: 8, color: "var(--coastal)" }}
            >
              <option value="all">All properties</option>
              {userProperties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-shore"
            aria-label="Review settings"
            style={{ color: "var(--tideline)", border: "1px solid var(--dry-sand)" }}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Filter + sort row */}
      {hasAnyReviews && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <ReviewFilterChips active={activeFilters} counts={counts} onChange={setActiveFilters} />
          <div className="flex items-center gap-2">
            {availableChannels.length > 1 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
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
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-1.5 text-[12px] bg-white"
              style={{ border: "1px solid var(--dry-sand)", borderRadius: 8, color: "var(--coastal)" }}
            >
              <option value="recent">Most recent</option>
              <option value="lowest_rating">Lowest rating first</option>
              <option value="needs_response">Needs response first</option>
            </select>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <ReviewSkeletonCard key={i} />)}
        </div>
      ) : !hasAnyProperty ? (
        <div
          className="bg-white"
          style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}
        >
          <KoastEmptyState
            icon={<Plug size={28} />}
            title="Connect a channel to see reviews"
            body="Reviews from Airbnb and Booking.com appear here once you connect a channel to your property."
            action={
              <a
                href="/channels/connect"
                className="px-4 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
              >
                Connect a channel
              </a>
            }
          />
        </div>
      ) : !hasAnyReviews ? (
        <div
          className="bg-white"
          style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}
        >
          <KoastEmptyState
            icon={<MailX size={28} />}
            title="No reviews yet"
            body="Reviews appear here as guests complete their stays and leave feedback. Check back after your next check-out date."
          />
        </div>
      ) : visible.length === 0 ? (
        <div
          className="bg-white"
          style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}
        >
          <KoastEmptyState
            title="No reviews match these filters"
            body="Try adjusting your filters to see more reviews."
            action={
              <button
                type="button"
                onClick={() => { setActiveFilters(new Set<ReviewFilter>(["all"])); setChannelFilter("all"); }}
                className="px-4 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
              >
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <>
          {allResponded && (
            <div className="mb-4 px-4 py-3 flex items-center gap-2" style={{ background: "rgba(26,122,90,0.08)", border: "1px solid rgba(26,122,90,0.2)", borderRadius: 12 }}>
              <CheckCircle2 size={16} style={{ color: "var(--lagoon)" }} />
              <span className="text-[13px]" style={{ color: "var(--lagoon)" }}>
                All caught up. New reviews will appear here as guests leave them.
              </span>
            </div>
          )}
          <div className="space-y-3">
            {visible.map((r, i) => (
              <ReviewCard
                key={r.id}
                review={r}
                animationDelayMs={i * 40}
                mounted={mounted}
                onRefresh={fetchData}
              />
            ))}
          </div>
        </>
      )}

      <ReviewsSettingsModal
        propertyId={settingsPropertyId}
        propertyName={activePropertyName}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
