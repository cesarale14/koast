"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, MailX, Plug, Plus, RefreshCw, Settings, X } from "lucide-react";
import KoastEmptyState from "@/components/polish/KoastEmptyState";
import ReviewsDashboardStrip from "@/components/reviews/ReviewsDashboardStrip";
import ReviewsFilterBar, {
  type ReviewFilter,
  type SortKey,
} from "@/components/reviews/ReviewsFilterBar";
import ReviewsList, { ReviewsListSkeleton } from "@/components/reviews/ReviewsList";
import ReviewSlideOver from "@/components/reviews/ReviewSlideOver";
import ReviewsSettingsModal from "@/components/reviews/ReviewsSettingsModal";
import { useToast } from "@/components/ui/Toast";
import type { ReviewListEntry } from "@/lib/reviews/types";

interface PropertyLite {
  id: string;
  name: string;
  channex_property_id: string | null;
  reviews_last_synced_at: string | null;
}

const REFRESH_COOLDOWN_MS = 60_000;
const JUST_CONNECTED_BANNER_TTL_MS = 5 * 60 * 1000;

function formatRelativeAgo(iso: string | null): string {
  if (!iso) return "Never synced";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function ReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reviews, setReviews] = useState<ReviewListEntry[]>([]);
  const [userProperties, setUserProperties] = useState<PropertyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [activeFilters, setActiveFilters] = useState<Set<ReviewFilter>>(new Set<ReviewFilter>(["all"]));
  const [sort, setSort] = useState<SortKey>("recent");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerOpenedAt, setBannerOpenedAt] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => { setMounted(true); }, []);

  // Re-render the relative "ago" label every 30s and on focus.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    const onFocus = () => setNowTick(Date.now());
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  // Detect the just-connected banner trigger and strip the query param
  // so a refresh doesn't re-show it.
  useEffect(() => {
    if (searchParams.get("just_connected") === "1") {
      setBannerVisible(true);
      setBannerOpenedAt(Date.now());
      // Preserve the slide-over `review` param if present.
      const rid = searchParams.get("review");
      router.replace(rid ? `/reviews?review=${rid}` : "/reviews");
    }
  }, [searchParams, router]);

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

  const handleRefresh = useCallback(async () => {
    if (refreshing || Date.now() < cooldownUntil) return;
    setRefreshing(true);
    try {
      const body = propertyFilter === "all" ? {} : { property_id: propertyFilter };
      const res = await fetch("/api/reviews/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Refresh failed");
      const newCount = Number(d.reviews_new ?? 0);
      const updatedCount = Number(d.reviews_updated ?? 0);
      toast(
        newCount + updatedCount === 0
          ? "Reviews up to date"
          : `Synced — ${newCount} new, ${updatedCount} updated`,
      );
      setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
      await fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "error");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, cooldownUntil, propertyFilter, toast, fetchData]);

  // Banner auto-fade.
  useEffect(() => {
    if (!bannerVisible) return;
    if (reviews.length > 0) {
      setBannerVisible(false);
      return;
    }
    if (bannerOpenedAt == null) return;
    if (nowTick - bannerOpenedAt > JUST_CONNECTED_BANNER_TTL_MS) {
      setBannerVisible(false);
    }
  }, [bannerVisible, bannerOpenedAt, reviews.length, nowTick]);

  // Filter + sort.
  const propertyScoped = useMemo(() => {
    if (propertyFilter === "all") return reviews;
    return reviews.filter((r) => r.property_id === propertyFilter);
  }, [reviews, propertyFilter]);

  const availableChannels = useMemo(() => {
    const s = new Set(propertyScoped.map((r) => r.platform));
    return Array.from(s);
  }, [propertyScoped]);

  const visible = useMemo(() => {
    let list = propertyScoped;
    if (channelFilter !== "all") list = list.filter((r) => r.platform === channelFilter);
    if (!activeFilters.has("all")) {
      list = list.filter((r) => {
        if (activeFilters.has("needs_response") && r.response_sent) return false;
        if (activeFilters.has("responded") && !r.response_sent) return false;
        // Bad-review predicate now reads the column directly. Sync is
        // canonical (rating < 4 written at insert time per RDX-2 Phase A).
        if (activeFilters.has("bad") && !r.is_bad_review) return false;
        if (activeFilters.has("private") && !r.private_feedback) return false;
        return true;
      });
    }
    const sorted = [...list];
    switch (sort) {
      case "recent":
        sorted.sort((a, b) => (b.incoming_date ?? "").localeCompare(a.incoming_date ?? ""));
        break;
      case "oldest":
        sorted.sort((a, b) => (a.incoming_date ?? "").localeCompare(b.incoming_date ?? ""));
        break;
      case "lowest_rating":
        sorted.sort((a, b) => (a.incoming_rating ?? 5) - (b.incoming_rating ?? 5));
        break;
      case "highest_rating":
        sorted.sort((a, b) => (b.incoming_rating ?? 0) - (a.incoming_rating ?? 0));
        break;
      case "needs_response":
        sorted.sort((a, b) => Number(a.response_sent) - Number(b.response_sent));
        break;
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
      bad: scope.filter((r) => r.is_bad_review).length,
      private: scope.filter((r) => !!r.private_feedback).length,
    };
  }, [propertyScoped, channelFilter]);

  const lastSyncedIso = useMemo<string | null>(() => {
    if (userProperties.length === 0) return null;
    const scope = propertyFilter === "all"
      ? userProperties
      : userProperties.filter((p) => p.id === propertyFilter);
    if (scope.length === 0) return null;
    const stamps = scope.map((p) => p.reviews_last_synced_at);
    if (stamps.some((s) => s == null)) return null;
    let oldest = stamps[0]!;
    for (const s of stamps) if (s! < oldest) oldest = s!;
    return oldest;
  }, [userProperties, propertyFilter]);

  const cooldownActive = nowTick < cooldownUntil;
  const refreshDisabled = refreshing || cooldownActive;
  const refreshTitle = lastSyncedIso ? new Date(lastSyncedIso).toLocaleString() : "Never synced";
  const lastSyncedLabel = lastSyncedIso
    ? `Last synced ${formatRelativeAgo(lastSyncedIso)}`
    : "Never synced";

  const hasAnyReviews = propertyScoped.length > 0;
  const hasAnyProperty = userProperties.length > 0;
  const hasAnyChannexProperty = useMemo(
    () => userProperties.some((p) => !!p.channex_property_id),
    [userProperties],
  );

  // Properties used by the dashboard strip's analytics fetch. When
  // 'all' is selected, all Channex-connected; when single, just that one.
  const stripPropertyIds = useMemo(() => {
    if (propertyFilter === "all") {
      return userProperties.filter((p) => !!p.channex_property_id).map((p) => p.id);
    }
    return userProperties.filter((p) => p.id === propertyFilter && !!p.channex_property_id).map((p) => p.id);
  }, [userProperties, propertyFilter]);

  const showProperty = propertyFilter === "all" && userProperties.length > 1;
  const allResponded = hasAnyReviews && counts.needs_response === 0 && activeFilters.has("all");

  // Slide-over: ?review={id} URL state.
  const reviewParam = searchParams.get("review");
  const slideReview = useMemo(
    () => reviewParam ? reviews.find((r) => r.id === reviewParam) ?? null : null,
    [reviewParam, reviews],
  );

  const openSlide = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("review", id);
    router.push(`/reviews?${params.toString()}`);
  }, [router, searchParams]);

  const closeSlide = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("review");
    const qs = params.toString();
    router.push(qs ? `/reviews?${qs}` : "/reviews");
  }, [router, searchParams]);

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
                <option key={p.id} value={p.id}>{p.name.replace(/ - StayCommand$/i, "").replace(/ - Koast$/i, "").trim()}</option>
              ))}
            </select>
          )}
          {hasAnyChannexProperty && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshDisabled}
                title={refreshTitle}
                className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-shore"
                style={{ color: "var(--coastal)", border: "1px solid var(--dry-sand)" }}
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} style={{ color: "var(--coastal)" }} />
                {refreshing ? "Refreshing…" : "Refresh now"}
              </button>
              <span className="text-[12px]" style={{ color: "var(--tideline)" }} title={refreshTitle}>
                {lastSyncedLabel}
              </span>
            </div>
          )}
          {hasAnyProperty && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg hover:bg-shore"
              aria-label="Review settings"
              style={{ color: "var(--tideline)", border: "1px solid var(--dry-sand)" }}
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Just-connected banner */}
      {bannerVisible && (
        <div
          className="mb-4 px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(26,122,90,0.08)", border: "1px solid rgba(26,122,90,0.2)", borderRadius: 12 }}
        >
          <CheckCircle2 size={16} style={{ color: "var(--lagoon)", marginTop: 2 }} />
          <div className="flex-1 text-[13px]" style={{ color: "var(--lagoon)" }}>
            Channex connected. Pulling your first reviews — this can take a few minutes.
          </div>
          <button
            type="button"
            onClick={() => setBannerVisible(false)}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-white/40"
            style={{ color: "var(--lagoon)" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <ReviewsListSkeleton />
      ) : !hasAnyProperty ? (
        <div className="bg-white" style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}>
          <KoastEmptyState
            icon={<Plus size={28} />}
            title="Add a property to see reviews"
            body="Reviews from Airbnb and Booking.com appear here once you add a property and connect a channel."
            action={
              <a
                href="/properties/import?from=reviews"
                className="px-4 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
              >
                Add a property
              </a>
            }
          />
        </div>
      ) : !hasAnyChannexProperty ? (
        <div className="bg-white" style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}>
          <KoastEmptyState
            icon={<Plug size={28} />}
            title="Connect a channel to see reviews"
            body="Reviews from Airbnb and Booking.com appear here once you connect a channel to your property."
            action={
              <a
                href="/properties/import?from=reviews"
                className="px-4 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
              >
                Connect a channel
              </a>
            }
          />
        </div>
      ) : !hasAnyReviews ? (
        <>
          <ReviewsDashboardStrip propertyIds={stripPropertyIds} />
          <div className="bg-white" style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}>
            <KoastEmptyState
              icon={<MailX size={28} />}
              title="No reviews yet"
              body="Reviews appear here as guests complete their stays and leave feedback. Check back after your next check-out date."
            />
          </div>
        </>
      ) : (
        <>
          <ReviewsDashboardStrip propertyIds={stripPropertyIds} />
          <ReviewsFilterBar
            active={activeFilters}
            counts={counts}
            onChangeFilter={setActiveFilters}
            sort={sort}
            onChangeSort={setSort}
            channelFilter={channelFilter}
            availableChannels={availableChannels}
            onChangeChannel={setChannelFilter}
          />
          {visible.length === 0 ? (
            <div className="bg-white" style={{ borderRadius: 16, border: "1px solid var(--dry-sand)" }}>
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
                <div
                  className="mb-4 px-4 py-3 flex items-center gap-2"
                  style={{ background: "rgba(26,122,90,0.08)", border: "1px solid rgba(26,122,90,0.2)", borderRadius: 12 }}
                >
                  <CheckCircle2 size={16} style={{ color: "var(--lagoon)" }} />
                  <span className="text-[13px]" style={{ color: "var(--lagoon)" }}>
                    All caught up. New reviews will appear here as guests leave them.
                  </span>
                </div>
              )}
              <ReviewsList
                reviews={visible}
                showProperty={showProperty}
                mounted={mounted}
                onOpen={openSlide}
              />
            </>
          )}
        </>
      )}

      {slideReview && (
        <ReviewSlideOver
          review={slideReview}
          open={true}
          onClose={closeSlide}
          onRefresh={fetchData}
        />
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

