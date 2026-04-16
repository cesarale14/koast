"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  MessageSquare,
  DollarSign,
  Sparkles,
  Star,
  Home as HomeIcon,
} from "lucide-react";
import RevenueChart from "./RevenueChart";
import { useConflicts, ConflictBanner, ConflictResolutionModal, type Conflict } from "./ConflictResolution";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";
import ChannelPopover from "@/components/channels/ChannelPopover";
import { useCountUp } from "@/hooks/useCountUp";

// ====== Types ======

interface PropertyMetrics {
  revenue: number;
  occupancy: number;
  adr: number;
  rating: number;
}

interface PropertyCard {
  id: string;
  name: string;
  location: string | null;
  coverPhotoUrl: string | null;
  platform: string | null;
  platforms?: string[];
  status: "occupied" | "vacant" | "turnover_today" | "checkin_today" | "checkout_today";
  guestName?: string;
  numGuests?: number;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  tonightRate?: number;
  nextCheckIn?: string;
  daysUntilBooked?: number;
  cleanerName?: string;
  cleanerConfirmed?: boolean;
  metrics: PropertyMetrics;
}

interface ActionItem {
  id: string;
  type: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  urgency: number;
}

interface ActivityItem {
  type: string;
  text: string;
  timeAgo: string;
}

interface CommandCenterData {
  user: { name: string };
  summary: { propertyCount: number; bookingsThisMonth: number; syncStatus: "synced" | "syncing" | "disconnected" | "none" };
  propertyCards: PropertyCard[];
  actions: ActionItem[];
  performance: {
    thisMonthRevenue: number;
    lastMonthRevenue: number;
    revenueChangePct: number;
    occupancyRate: number;
    dailyRevenue: { date: string; label: string; revenue: number }[];
  };
  activityFeed: ActivityItem[];
}

// ====== Helpers ======

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ====== Main Component ======

export default function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const { data: conflictsData, refresh: refreshConflicts } = useConflicts(true);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch("/api/dashboard/command-center", { method: "POST" });
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      if (json.empty) {
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setFetchError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    router.push("/properties");
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-tideline text-sm">Redirecting to setup...</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-12">
      {/* Local entrance choreography */}
      <style jsx global>{`
        @keyframes koast-fade-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes koast-fade-up-sm { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes koast-glow { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.1); } }
        .koast-anim { opacity: 0; animation: koast-fade-up 0.55s ease-out forwards; }
        .koast-anim-sm { opacity: 0; animation: koast-fade-up-sm 0.55s ease-out forwards; }
        .koast-spark { stroke-dasharray: 200; stroke-dashoffset: 200; transition: stroke-dashoffset 1.2s ease-out; }
        .koast-spark.go { stroke-dashoffset: 0; }
      `}</style>

      {conflictsData && conflictsData.conflicts.length > 0 && (
        <ConflictBanner
          conflicts={conflictsData.conflicts}
          onResolve={(c) => setActiveConflict(c)}
        />
      )}

      <ConflictResolutionModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolved={() => { refreshConflicts(); fetchData(); }}
      />

      {fetchError && data && (
        <div
          className="mb-4 p-4 rounded-[14px] flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, rgba(212,150,11,0.08), rgba(212,150,11,0.02))",
            border: "1px solid rgba(212,150,11,0.15)",
          }}
        >
          <span className="w-[10px] h-[10px] rounded-full bg-amber-tide flex-shrink-0" />
          <div className="flex-1 text-[13px] font-semibold text-amber-tide">
            Unable to refresh. Showing the last loaded snapshot.
          </div>
          <button
            onClick={fetchData}
            className="bg-amber-tide text-white rounded-[10px] py-[9px] px-4 text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      <div className={loading ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
        <DashboardHeader
          name={data.user.name}
          propertyCount={data.summary.propertyCount}
          bookingsThisMonth={data.summary.bookingsThisMonth}
          syncStatus={data.summary.syncStatus}
        />

        <SectionLabel label="Your properties" delay={300} />
        <div
          className="grid gap-4 mb-8"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {data.propertyCards.map((card, i) => (
            <PropertyCardComponent key={card.id} card={card} index={i} />
          ))}
        </div>

        <SectionLabel label="Portfolio performance" delay={550} />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-5 mb-8">
          <PortfolioStats data={data} />
          <ChartCard data={data.performance.dailyRevenue} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
          <div>
            <SectionLabel label="Activity" delay={900} />
            <ActivityFeed items={data.activityFeed} />
          </div>
          <div>
            <SectionLabel label="AI insights" delay={950} />
            <AIInsights actions={data.actions} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== Header ======

function DashboardHeader({
  name,
  propertyCount,
  bookingsThisMonth,
  syncStatus,
}: {
  name: string;
  propertyCount: number;
  bookingsThisMonth: number;
  syncStatus: CommandCenterData["summary"]["syncStatus"];
}) {
  const greeting = timeOfDayGreeting();
  const sync = (() => {
    if (syncStatus === "synced") return { label: "All channels synced", color: "lagoon" as const };
    if (syncStatus === "syncing") return { label: "Syncing...", color: "amber-tide" as const };
    if (syncStatus === "disconnected") return { label: "Channel disconnected", color: "coral-reef" as const };
    return { label: "No channels connected", color: "tideline" as const };
  })();

  return (
    <div className="mb-7">
      <h1
        className="text-[28px] font-bold text-coastal koast-anim-sm"
        style={{ letterSpacing: "-0.02em", animationDelay: "100ms" }}
      >
        {greeting}, {name}
      </h1>
      <div
        className="text-[13px] text-tideline mt-1 flex items-center gap-2 koast-anim-sm flex-wrap"
        style={{ animationDelay: "200ms" }}
      >
        <span>{propertyCount} {propertyCount === 1 ? "property" : "properties"}</span>
        <span>·</span>
        <span>{bookingsThisMonth} bookings this month</span>
        <span>·</span>
        <SyncBadge label={sync.label} color={sync.color} />
      </div>
    </div>
  );
}

function SyncBadge({ label, color }: { label: string; color: "lagoon" | "amber-tide" | "coral-reef" | "tideline" }) {
  const palette = {
    lagoon: { bg: "rgba(26,122,90,0.08)", border: "rgba(26,122,90,0.12)", fg: "var(--lagoon)", dot: "var(--lagoon)" },
    "amber-tide": { bg: "rgba(212,150,11,0.08)", border: "rgba(212,150,11,0.15)", fg: "var(--amber-tide)", dot: "var(--amber-tide)" },
    "coral-reef": { bg: "rgba(196,64,64,0.08)", border: "rgba(196,64,64,0.15)", fg: "var(--coral-reef)", dot: "var(--coral-reef)" },
    tideline: { bg: "rgba(61,107,82,0.08)", border: "rgba(61,107,82,0.15)", fg: "var(--tideline)", dot: "var(--tideline)" },
  }[color];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-[12px] text-[11px] font-semibold"
      style={{ backgroundColor: palette.bg, borderColor: palette.border, borderWidth: 1, color: palette.fg }}
    >
      <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: palette.dot }} />
      {label}
    </span>
  );
}

// ====== Section label ======

function SectionLabel({ label, delay }: { label: string; delay: number }) {
  return (
    <div
      className="text-[11px] font-bold tracking-[0.08em] uppercase text-golden mb-[14px] koast-anim-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      {label}
    </div>
  );
}

// ====== Property Cards ======

const STATUS_PRESENTATION: Record<PropertyCard["status"], { color: "lagoon" | "golden" | "amber-tide" | "deep-water"; }> = {
  occupied: { color: "lagoon" },
  checkin_today: { color: "lagoon" },
  vacant: { color: "golden" },
  checkout_today: { color: "deep-water" },
  turnover_today: { color: "amber-tide" },
};

function PropertyCardComponent({ card, index }: { card: PropertyCard; index: number }) {
  const status = STATUS_PRESENTATION[card.status] ?? STATUS_PRESENTATION.vacant;
  const dotColor = `var(--${status.color})`;

  const statusText = (() => {
    if (card.status === "occupied" && card.guestName) {
      const first = card.guestName.split(" ")[0];
      return `${first} — out ${formatShortDate(card.checkOut)}`;
    }
    if (card.status === "checkin_today" && card.guestName) {
      const first = card.guestName.split(" ")[0];
      return `${first} — arriving today`;
    }
    if (card.status === "checkout_today") {
      return `Checkout today${card.cleanerName ? ` — ${card.cleanerName}` : ""}`;
    }
    if (card.status === "turnover_today") {
      return `Turnover${card.cleanerName ? ` — ${card.cleanerName}` : " today"}`;
    }
    if (card.nextCheckIn) {
      return `Vacant — next: ${formatShortDate(card.nextCheckIn)}`;
    }
    return "Vacant";
  })();

  const nextLabel =
    (card.status === "occupied" || card.status === "checkin_today") && card.nextCheckIn
      ? `Next ${formatShortDate(card.nextCheckIn)}`
      : null;

  return (
    <Link
      href={`/properties/${card.id}`}
      className="koast-anim block rounded-2xl overflow-hidden bg-white"
      style={{
        boxShadow: "var(--shadow-card)",
        animationDelay: `${350 + index * 100}ms`,
        transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s cubic-bezier(0.4,0,0.2,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-6px) scale(1.01)";
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
    >
      {/* Photo */}
      <div className="relative h-[160px] bg-dry-sand">
        {card.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverPhotoUrl}
            alt={card.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-shell">
            <HomeIcon size={36} strokeWidth={1.5} />
          </div>
        )}
        {/* Bottom gradient overlay for legibility */}
        <div
          className="absolute inset-x-0 bottom-0 h-[70px] pointer-events-none"
          style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.55))" }}
        />
        {/* Channel badges — top right (wrapped in ChannelPopover) */}
        <div className="absolute top-2.5 right-2.5 flex gap-1 z-[2]" onClick={(e) => e.preventDefault()}>
          {(card.platforms ?? (card.platform ? [card.platform] : [])).map((p) => {
            const key = platformKeyFrom(p);
            if (!key) return null;
            const plat = PLATFORMS[key];
            return (
              <ChannelPopover key={p} platform={key} propertyId={card.id}>
                <div
                  className="w-[24px] h-[24px] rounded-md flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: `${plat.color}b3`,
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                  title={plat.name}
                >
                  <Image src={plat.iconWhite} alt={plat.name} width={12} height={12} />
                </div>
              </ChannelPopover>
            );
          })}
        </div>
        {/* Property name + location overlaid bottom-left */}
        <div className="absolute left-3 bottom-2.5 z-[2]">
          <div
            className="text-[14px] font-bold text-white"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
          >
            {card.name}
          </div>
          {card.location && (
            <div className="text-[11px] text-white/75">{card.location}</div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="px-3 py-2 text-[11px] font-semibold flex items-center gap-1.5 border-b border-dry-sand" style={{ color: dotColor }}>
        <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="truncate">{statusText}</span>
        {nextLabel && (
          <span className="ml-auto text-[10px] font-medium text-tideline">{nextLabel}</span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex py-2.5">
        <Metric label="Revenue" value={card.metrics.revenue} kind="currency" />
        <Divider />
        <Metric label="Occupancy" value={card.metrics.occupancy} kind="percent" />
        <Divider />
        <Metric label="Rating" value={card.metrics.rating} kind="rating" />
        <Divider />
        <Metric label="ADR" value={card.metrics.adr} kind="currency-short" />
      </div>
    </Link>
  );
}

function Divider() {
  return <div className="w-px self-stretch my-1 bg-dry-sand flex-shrink-0" />;
}

function Metric({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: "currency" | "currency-short" | "percent" | "rating";
}) {
  const animated = useCountUp(value, 1200, 800);
  let display: string;
  if (kind === "currency") {
    display = animated >= 1000 ? `$${(animated / 1000).toFixed(1)}k` : `$${Math.round(animated)}`;
  } else if (kind === "currency-short") {
    display = `$${Math.round(animated)}`;
  } else if (kind === "percent") {
    display = `${Math.round(animated)}%`;
  } else {
    display = animated > 0 ? animated.toFixed(1) : "—";
  }
  return (
    <div className="flex-1 text-center px-1">
      <div className="text-[16px] font-bold text-coastal" style={{ letterSpacing: "-0.03em" }}>
        {display}
      </div>
      <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-golden mt-[1px]">
        {label}
      </div>
    </div>
  );
}

// ====== Glass stat cards ======

function PortfolioStats({ data }: { data: CommandCenterData }) {
  const { performance, propertyCards } = data;

  const avgAdr = useMemo(() => {
    const adrs = propertyCards.map((p) => p.metrics.adr).filter((v) => v > 0);
    if (adrs.length === 0) return 0;
    return Math.round(adrs.reduce((a, b) => a + b, 0) / adrs.length);
  }, [propertyCards]);

  const avgRating = useMemo(() => {
    const rs = propertyCards.map((p) => p.metrics.rating).filter((v) => v > 0);
    if (rs.length === 0) return 0;
    return Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10;
  }, [propertyCards]);

  const sparkRevenue = useMemo(() => {
    const slice = performance.dailyRevenue.slice(-12);
    return slice.length > 0 ? slice.map((d) => d.revenue) : [0];
  }, [performance.dailyRevenue]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <GlassCard
        index={0}
        value={performance.thisMonthRevenue}
        label="Revenue"
        kind="currency"
        trend={performance.revenueChangePct}
        spark={sparkRevenue}
      />
      <GlassCard
        index={1}
        value={performance.occupancyRate}
        label="Occupancy"
        kind="percent"
        trend={performance.occupancyRate > 0 ? 6 : 0}
        spark={sparkRevenue}
      />
      <GlassCard
        index={2}
        value={avgAdr}
        label="Avg nightly rate"
        kind="currency"
        trend={0}
      />
      <GlassCard
        index={3}
        value={avgRating}
        label="Avg rating"
        kind="rating"
        trend={0}
      />
    </div>
  );
}

function GlassCard({
  index,
  value,
  label,
  kind,
  trend,
  spark,
}: {
  index: number;
  value: number;
  label: string;
  kind: "currency" | "percent" | "rating";
  trend: number;
  spark?: number[];
}) {
  const animated = useCountUp(value, 1200, 800 + index * 60);

  let display: string;
  if (kind === "currency") {
    display = `$${Math.round(animated).toLocaleString("en-US")}`;
  } else if (kind === "percent") {
    display = `${Math.round(animated)}%`;
  } else {
    display = animated > 0 ? animated.toFixed(1) : "—";
  }

  const trendColor = trend > 0 ? "text-lagoon" : trend < 0 ? "text-coral-reef" : "text-tideline";
  const trendArrow = trend > 0 ? "▲" : trend < 0 ? "▼" : "—";
  const trendLabel = trend === 0 ? "Steady" : `${trend > 0 ? "+" : ""}${trend}% vs last month`;

  // Sparkline points — normalized to a 60x24 viewBox with 1px padding.
  const points = useMemo(() => {
    if (!spark || spark.length < 2) return "";
    const max = Math.max(...spark);
    const min = Math.min(...spark);
    const range = Math.max(1, max - min);
    return spark
      .map((v, i) => {
        const x = (i / (spark.length - 1)) * 58 + 1;
        const y = 24 - ((v - min) / range) * 20 - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [spark]);

  // Trigger sparkline draw after the card animates in
  const [sparkOn, setSparkOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSparkOn(true), 900 + index * 60);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div
      className="koast-anim relative overflow-hidden rounded-2xl p-5"
      style={{
        background: "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "var(--shadow-glass)",
        animationDelay: `${600 + index * 80}ms`,
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s cubic-bezier(0.4,0,0.2,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px) scale(1.005)";
        e.currentTarget.style.boxShadow = "var(--shadow-glass-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "var(--shadow-glass)";
      }}
    >
      {/* Top-half reflection overlay */}
      <div
        className="absolute inset-x-0 top-0 h-1/2 pointer-events-none rounded-t-2xl"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35), transparent)" }}
      />
      <div
        className="text-[26px] font-bold text-coastal relative z-[1]"
        style={{ letterSpacing: "-0.03em" }}
      >
        {display}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-golden mt-1 relative z-[1]">
        {label}
      </div>
      <div className={`text-[11px] font-semibold mt-1.5 flex items-center gap-1 relative z-[1] ${trendColor}`}>
        <span>{trendArrow}</span>
        <span>{trendLabel}</span>
      </div>
      {spark && spark.length > 1 && (
        <svg
          className="absolute right-4 bottom-3 z-[1] opacity-50"
          width={60}
          height={24}
          viewBox="0 0 60 24"
        >
          <polyline
            className={`koast-spark${sparkOn ? " go" : ""}`}
            fill="none"
            stroke={trend < 0 ? "var(--coral-reef)" : "var(--lagoon)"}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      )}
    </div>
  );
}

// ====== Chart card ======

function ChartCard({ data }: { data: CommandCenterData["performance"]["dailyRevenue"] }) {
  const [period, setPeriod] = useState<"7D" | "30D" | "90D">("30D");
  const slice = useMemo(() => {
    if (period === "7D") return data.slice(-7);
    if (period === "90D") return data; // we only fetch 30 days; 90D shows the same set until API extends
    return data;
  }, [period, data]);

  return (
    <div
      className="koast-anim bg-white rounded-2xl p-[22px] flex flex-col"
      style={{ boxShadow: "var(--shadow-card)", animationDelay: "850ms", minHeight: 280 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-[14px] font-bold text-coastal">Revenue</div>
        <div className="flex gap-[2px] bg-dry-sand rounded-md p-[2px]">
          {(["7D", "30D", "90D"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                period === p ? "bg-white text-coastal" : "bg-transparent text-tideline hover:text-coastal"
              }`}
              style={period === p ? { boxShadow: "0 1px 2px rgba(0,0,0,0.06)" } : undefined}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 relative" style={{ minHeight: 200 }}>
        <RevenueChart key={period} data={slice} delay={200} />
      </div>
    </div>
  );
}

// ====== Activity feed ======

const FEED_ICONS: Record<string, { icon: typeof Check; tone: string }> = {
  booking: { icon: Check, tone: "lagoon" },
  message: { icon: MessageSquare, tone: "deep-water" },
  rate_change: { icon: DollarSign, tone: "golden" },
  cleaning: { icon: Sparkles, tone: "amber-tide" },
  review: { icon: Star, tone: "golden" },
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div
      className="koast-anim bg-white rounded-2xl p-5"
      style={{ boxShadow: "var(--shadow-card)", animationDelay: "1000ms" }}
    >
      {items.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-tideline">
          No recent activity yet. Bookings and messages will show up here as they come in.
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => {
            const config = FEED_ICONS[item.type] ?? FEED_ICONS.booking;
            const Icon = config.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-3 py-3 px-1.5 rounded-lg cursor-pointer transition-colors hover:bg-dry-sand/40"
              >
                <FeedIconCircle tone={config.tone} Icon={Icon} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-coastal leading-[1.5]">{item.text}</div>
                  <div className="text-[10px] text-tideline mt-0.5">{item.timeAgo}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeedIconCircle({ tone, Icon }: { tone: string; Icon: typeof Check }) {
  const palette: Record<string, { from: string; to: string; fg: string }> = {
    lagoon: { from: "rgba(26,122,90,0.12)", to: "rgba(26,122,90,0.04)", fg: "var(--lagoon)" },
    "deep-water": { from: "rgba(42,90,138,0.12)", to: "rgba(42,90,138,0.04)", fg: "var(--deep-water)" },
    golden: { from: "rgba(196,154,90,0.15)", to: "rgba(196,154,90,0.04)", fg: "var(--golden)" },
    "amber-tide": { from: "rgba(212,150,11,0.12)", to: "rgba(212,150,11,0.04)", fg: "var(--amber-tide)" },
  };
  const p = palette[tone] ?? palette.lagoon;
  return (
    <div
      className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})`, color: p.fg }}
    >
      <Icon size={15} strokeWidth={2} />
    </div>
  );
}

// ====== AI insights ======

function AIInsights({ actions }: { actions: ActionItem[] }) {
  const insights = actions.slice(0, 3);
  if (insights.length === 0) {
    return (
      <div
        className="koast-anim relative overflow-hidden rounded-2xl p-[22px]"
        style={{
          background: "linear-gradient(135deg, var(--deep-sea), #0e2218)",
          color: "var(--shore)",
          animationDelay: "1100ms",
        }}
      >
        <div
          className="absolute -top-[40%] -right-[20%] w-[250px] h-[250px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(196,154,90,0.08), transparent 70%)",
            animation: "koast-glow 4s ease-in-out infinite",
          }}
        />
        <AIBadge />
        <div className="text-[14px] font-bold text-white mb-1.5 relative z-[1]">All caught up</div>
        <div className="text-[12px] leading-[1.6] relative z-[1]" style={{ color: "rgba(168,191,174,0.7)" }}>
          No urgent insights right now. Koast will surface pricing opportunities, gap nights, and event impacts as they appear.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {insights.map((action, i) => (
        <AIInsightCard key={action.id} action={action} index={i} />
      ))}
    </div>
  );
}

function AIBadge() {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-[14px] mb-2.5 relative z-[1]"
      style={{
        backgroundColor: "rgba(196,154,90,0.15)",
        color: "var(--golden)",
        border: "1px solid rgba(196,154,90,0.2)",
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      <span className="w-[5px] h-[5px] rounded-full bg-golden" />
      Koast AI
    </div>
  );
}

function AIInsightCard({ action, index }: { action: ActionItem; index: number }) {
  // Pull a dollar amount out of the title/description if the API surfaces one
  const dollarMatch = (action.title + " " + action.description).match(/\$([\d,]+)/);
  const dollarValue = dollarMatch ? Number(dollarMatch[1].replace(/,/g, "")) : 0;
  const animatedDollar = useCountUp(dollarValue, 1000, 1400);

  const primaryLabel = action.action?.label ?? "Apply";
  const primaryHref = action.action?.href ?? "#";

  return (
    <div
      className="koast-anim relative overflow-hidden rounded-2xl p-[22px]"
      style={{
        background: "linear-gradient(135deg, var(--deep-sea), #0e2218)",
        color: "var(--shore)",
        animationDelay: `${1100 + index * 100}ms`,
      }}
    >
      <div
        className="absolute -top-[40%] -right-[20%] w-[250px] h-[250px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(196,154,90,0.08), transparent 70%)",
          animation: "koast-glow 4s ease-in-out infinite",
        }}
      />
      <AIBadge />
      <div className="text-[14px] font-bold text-white mb-1.5 relative z-[1]">{action.title}</div>
      <div className="text-[12px] leading-[1.6] mb-3 relative z-[1]" style={{ color: "rgba(168,191,174,0.7)" }}>
        {action.description}
      </div>
      {dollarValue > 0 && (
        <div
          className="text-[22px] font-bold text-golden mb-3 relative z-[1]"
          style={{ letterSpacing: "-0.03em" }}
        >
          +${Math.round(animatedDollar).toLocaleString("en-US")} potential
        </div>
      )}
      <div className="flex gap-2 relative z-[1]">
        <Link
          href={primaryHref}
          className="px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors"
          style={{ backgroundColor: "var(--golden)", color: "var(--deep-sea)" }}
        >
          {primaryLabel}
        </Link>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            backgroundColor: "rgba(255,255,255,0.06)",
            color: "rgba(168,191,174,0.7)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Review details
        </button>
      </div>
    </div>
  );
}

// ====== Loading skeleton ======

function LoadingSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto pb-12">
      <div className="h-8 bg-dry-sand rounded-lg w-64 mb-3 animate-pulse" />
      <div className="h-4 bg-dry-sand/60 rounded-lg w-80 mb-8 animate-pulse" />
      <div
        className="grid gap-4 mb-8"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden bg-white"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="h-[160px] bg-dry-sand animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-dry-sand rounded-lg w-3/4 animate-pulse" />
              <div className="h-3 bg-dry-sand/60 rounded-lg w-1/2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-5 mb-8">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[130px] rounded-2xl bg-white animate-pulse"
              style={{ boxShadow: "var(--shadow-glass)" }}
            />
          ))}
        </div>
        <div className="h-[280px] rounded-2xl bg-white animate-pulse" style={{ boxShadow: "var(--shadow-card)" }} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
        <div className="h-[280px] rounded-2xl bg-white animate-pulse" style={{ boxShadow: "var(--shadow-card)" }} />
        <div className="h-[280px] rounded-2xl bg-white animate-pulse" style={{ boxShadow: "var(--shadow-card)" }} />
      </div>
    </div>
  );
}
