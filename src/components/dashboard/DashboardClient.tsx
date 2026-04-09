"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X as XIcon,
  DollarSign,
  Sparkles,
  Star,
  Calendar,
  TrendingUp,
  BookOpen,
  CheckCircle2,
  Home,
} from "lucide-react";
import RevenueChart from "./RevenueChart";
import PlatformLogoDefault from "@/components/ui/PlatformLogo";
const DashPlatformLogo = PlatformLogoDefault;

// ====== Types ======

interface PropertyCard {
  id: string;
  name: string;
  coverPhotoUrl: string | null;
  platform: string | null;
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
}

interface ActionItem {
  id: string;
  type: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  urgency: number;
}

interface EventPill {
  name: string;
  date: string;
  dateLabel: string;
  demandImpact: number;
  eventType?: string | null;
}

interface ActivityItem {
  type: string;
  text: string;
  timeAgo: string;
}

interface CommandCenterData {
  propertyCards: PropertyCard[];
  actions: ActionItem[];
  events: EventPill[];
  performance: {
    thisMonthRevenue: number;
    lastMonthRevenue: number;
    revenueChangePct: number;
    ytdRevenue: number;
    occupancyRate: number;
    revenueData: { month: string; revenue: number }[];
  };
  market: {
    grade: string;
    yourAdr: number;
    marketAdr: number;
    yourOccupancy: number;
    marketOccupancy: number;
    demandForecast: { date: string; score: number }[];
  };
  activityFeed: ActivityItem[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ====== Main Component ======

export default function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

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
        <div className="text-neutral-400 text-sm">Redirecting to setup...</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Error banner */}
      {fetchError && data && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-lg bg-warning-light border border-warning/20">
          <p className="text-sm font-medium" style={{ color: "#92400e" }}>
            Unable to refresh data. Showing last available data.
          </p>
          <button
            onClick={fetchData}
            className="text-sm font-medium px-3 py-1 rounded-md bg-warning/10 hover:bg-warning/20 transition-colors"
            style={{ color: "#92400e" }}
          >
            Retry
          </button>
        </div>
      )}

      <div className={loading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-neutral-0 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2"><Home size={14} className="text-neutral-400" /><p className="text-xs text-neutral-400 font-medium">Properties</p></div>
            <p className="text-2xl font-bold font-mono text-neutral-800">{data.propertyCards.length}</p>
          </div>
          <div className="bg-neutral-0 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-neutral-400" /><p className="text-xs text-neutral-400 font-medium">Occupancy</p></div>
            <p className="text-2xl font-bold font-mono text-neutral-800">{data.performance.occupancyRate}%</p>
          </div>
          <div className="bg-neutral-0 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-emerald-500" /><p className="text-xs text-neutral-400 font-medium">Est. Revenue</p></div>
            <p className="text-2xl font-bold font-mono text-emerald-600">{formatCurrency(data.performance.thisMonthRevenue)}</p>
          </div>
          <div className="bg-neutral-0 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2"><Calendar size={14} className="text-neutral-400" /><p className="text-xs text-neutral-400 font-medium">Upcoming Check-ins</p></div>
            <p className="text-2xl font-bold font-mono text-neutral-800">{data.propertyCards.filter((c: { status: string }) => c.status === "checkin_today").length}</p>
          </div>
        </div>

        {/* Section 1: Property Status Strip */}
        <PropertyStatusStrip cards={data.propertyCards} />

        {/* Section 2: Smart Actions */}
        <SmartActions actions={data.actions} />

        {/* Section 3: Upcoming Events Bar */}
        <EventsBar events={data.events} />

        {/* Section 4: Portfolio Performance + Market Health */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
          <div className="lg:col-span-3">
            <PerformanceSection
              performance={data.performance}
            />
          </div>
          <div className="lg:col-span-2">
            <MarketHealth market={data.market} />
          </div>
        </div>

        {/* Section 5: Recent Activity Feed */}
        <ActivityFeed items={data.activityFeed} />
      </div>
    </div>
  );
}

// ====== Section 1: Property Status Strip ======

const statusConfig: Record<string, { label: string; color: string }> = {
  occupied: { label: "Occupied", color: "bg-emerald-500" },
  vacant: { label: "Vacant", color: "bg-neutral-400" },
  turnover_today: { label: "Turnover today", color: "bg-amber-500" },
  checkin_today: { label: "Check-in today", color: "bg-blue-500" },
  checkout_today: { label: "Check-out today", color: "bg-rose-400" },
};

function PropertyStatusStrip({ cards }: { cards: PropertyCard[] }) {
  const isHero = cards.length === 1;
  const isSideBySide = cards.length >= 2 && cards.length <= 3;

  return (
    <div className={`mb-6 ${cards.length >= 4 ? "overflow-x-auto scrollbar-hide" : ""}`}>
      <div
        className={`flex gap-4 ${
          isHero ? "" : isSideBySide ? "" : "w-max pb-2"
        }`}
        style={cards.length >= 4 ? { scrollSnapType: "x mandatory" } : undefined}
      >
        {cards.map((card) => (
          <PropertyCardComponent key={card.id} card={card} isHero={isHero} isSideBySide={isSideBySide} />
        ))}
      </div>
    </div>
  );
}

function PropertyCardComponent({
  card,
  isHero,
  isSideBySide,
}: {
  card: PropertyCard;
  isHero: boolean;
  isSideBySide: boolean;
}) {
  const { label, color } = statusConfig[card.status] ?? statusConfig.vacant;
  const isOccupiedLike = card.status === "occupied" || card.status === "checkin_today";
  const isTurnover = card.status === "turnover_today";
  const isVacantLike = card.status === "vacant" || card.status === "checkout_today";

  return (
    <Link
      href={`/properties/${card.id}`}
      className={`flex-shrink-0 bg-neutral-0 rounded-xl shadow-sm hover:-translate-y-0.5 transition-all cursor-pointer ${
        isHero ? "w-full" : isSideBySide ? "flex-1 min-w-0" : "w-[280px]"
      }`}
      style={!isHero && !isSideBySide ? { scrollSnapAlign: "start" } : undefined}
    >
      {/* Cover photo */}
      <div className="relative h-[100px] rounded-t-xl overflow-hidden">
        {card.coverPhotoUrl ? (
          <img
            src={card.coverPhotoUrl}
            alt={card.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
            <span className="text-neutral-300 text-2xl">🏠</span>
          </div>
        )}
        {/* Status pill — top left */}
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 text-[11px] font-semibold text-white rounded-full ${color}`}
        >
          {label}
        </span>
        {/* Platform badge — bottom right */}
        {card.platform && (
          <span className="absolute bottom-2 right-2 bg-white/90 rounded-full p-0.5">
            <DashPlatformLogo platform={card.platform} size="sm" />
          </span>
        )}
      </div>

      {/* Info section */}
      <div className="p-3 h-[80px] flex flex-col justify-between">
        <p className="text-sm font-bold text-neutral-800 truncate">{card.name}</p>

        {isOccupiedLike && card.guestName && (
          <div>
            <p className="text-xs text-neutral-500 truncate">
              {card.guestName}
              {card.numGuests && card.numGuests > 1 ? ` + ${card.numGuests - 1}` : ""}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[11px] text-neutral-400">
                {formatShortDate(card.checkIn)} – {formatShortDate(card.checkOut)} ({card.nights}n)
              </span>
              {card.tonightRate != null && (
                <span className="text-sm font-mono text-emerald-600 font-semibold">
                  ${card.tonightRate}
                </span>
              )}
            </div>
          </div>
        )}

        {isVacantLike && (
          <div>
            <p className="text-xs text-neutral-400 mt-0.5">
              {card.nextCheckIn
                ? `Next check-in: ${formatShortDate(card.nextCheckIn)}`
                : "No upcoming bookings"}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              {card.tonightRate != null && (
                <span className="text-sm font-mono text-neutral-600">${card.tonightRate}</span>
              )}
              {card.daysUntilBooked != null && (
                <span className="text-[11px] text-neutral-400">
                  {card.daysUntilBooked} night{card.daysUntilBooked !== 1 ? "s" : ""} until booked
                </span>
              )}
            </div>
          </div>
        )}

        {isTurnover && (
          <div>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Checkout 11 AM → Cleaning → Check-in 3 PM
            </p>
            <div className="flex items-center justify-between mt-0.5">
              {card.cleanerName ? (
                <span className="text-xs text-neutral-600 flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full inline-block ${
                      card.cleanerConfirmed ? "bg-emerald-500" : "bg-neutral-300"
                    }`}
                  />
                  {card.cleanerName}
                </span>
              ) : (
                <span className="text-xs text-neutral-400">No cleaner assigned</span>
              )}
              {card.tonightRate != null && (
                <span className="text-sm font-mono text-emerald-600 font-semibold">
                  ${card.tonightRate}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

// ====== Section 2: Smart Actions ======

const actionTypeConfig: Record<string, { icon: typeof DollarSign; iconBg: string; iconColor: string }> = {
  pricing: { icon: DollarSign, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  revenue: { icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  cleaning: { icon: Sparkles, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  event: { icon: Calendar, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  review: { icon: Star, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
};

function SmartActions({ actions }: { actions: ActionItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem("dismissed-actions");
    if (saved) try { setDismissed(new Set(JSON.parse(saved))); } catch { /* ignore */ }
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem("dismissed-actions", JSON.stringify(Array.from(next)));
  };

  const visible = actions.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) {
    if (actions.length > 0) {
      return (
        <div className="mb-6 p-4 rounded-xl bg-brand-50/50 text-center">
          <p className="text-sm font-medium text-brand-600">You&apos;re all caught up!</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-neutral-500 mb-3">
        Needs Your Attention
      </h2>
      <div className="space-y-2">
        {visible.slice(0, 5).map((a) => {
          const config = actionTypeConfig[a.type] ?? actionTypeConfig.event;
          const Icon = config.icon;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-neutral-0 shadow-sm group"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.iconBg}`}
              >
                <Icon size={18} className={config.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-800">{a.title}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{a.description}</p>
              </div>
              {a.action && (
                <Link
                  href={a.action.href}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                >
                  {a.action.label}
                </Link>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  dismiss(a.id);
                }}
                className="flex-shrink-0 p-1 text-neutral-300 hover:text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ====== Section 3: Upcoming Events Bar ======

function EventsBar({ events }: { events: EventPill[] }) {
  if (events.length === 0) {
    return (
      <div className="mb-6 px-4 py-3 rounded-xl bg-neutral-0 shadow-sm">
        <p className="text-xs text-neutral-400 text-center">
          No major events in the next 14 days
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 overflow-x-auto scrollbar-hide">
      <div className="flex gap-2 pb-1">
        {events.map((e, i) => {
          const intensity = (e.demandImpact ?? 0);
          const bg =
            intensity >= 0.6
              ? "bg-red-50 border-red-200 text-red-700"
              : intensity >= 0.3
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-neutral-50 border-neutral-200 text-neutral-600";
          const emoji =
            e.eventType === "sports" || e.eventType === "sporting_event"
              ? "🏟"
              : e.eventType === "concert" || e.eventType === "music"
                ? "🎵"
                : e.eventType === "festival"
                  ? "🎪"
                  : e.eventType === "conference"
                    ? "📋"
                    : "📅";
          return (
            <Link
              key={i}
              href="/pricing"
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border ${bg} hover:opacity-80 transition-opacity`}
            >
              <span>{emoji}</span>
              <span className="truncate max-w-[160px]">{e.name}</span>
              <span className="text-[10px] opacity-70">{e.dateLabel}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ====== Section 4a: Performance Section ======

function PerformanceSection({
  performance,
}: {
  performance: CommandCenterData["performance"];
}) {
  return (
    <div className="bg-neutral-0 rounded-xl shadow-sm p-6 h-full">
      <h2 className="text-sm font-semibold text-neutral-500 mb-4">
        Revenue
      </h2>
      <RevenueChart data={performance.revenueData} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-neutral-100">
        <div>
          <span className="text-xs text-neutral-400">This month</span>
          <p className="text-lg font-bold font-mono text-neutral-800">
            {formatCurrency(performance.thisMonthRevenue)}
          </p>
        </div>
        <div>
          <span className="text-xs text-neutral-400">Last month</span>
          <p className="text-lg font-bold font-mono text-neutral-800">
            {formatCurrency(performance.lastMonthRevenue)}
          </p>
        </div>
        <div>
          {performance.revenueChangePct !== 0 && (
            <span
              className={`text-sm font-bold font-mono ${
                performance.revenueChangePct > 0 ? "text-emerald-600" : "text-rose-500"
              }`}
            >
              {performance.revenueChangePct > 0 ? "+" : ""}
              {performance.revenueChangePct}% {performance.revenueChangePct > 0 ? "↑" : "↓"}
            </span>
          )}
        </div>
        <div className="border-l border-neutral-100 pl-6">
          <span className="text-xs text-neutral-400">YTD</span>
          <p className="text-lg font-bold font-mono text-neutral-800">
            {formatCurrency(performance.ytdRevenue)}
          </p>
        </div>
        <div className="border-l border-neutral-100 pl-6">
          <span className="text-xs text-neutral-400">Occupancy</span>
          <p className="text-lg font-bold font-mono text-neutral-800">
            {performance.occupancyRate}%
          </p>
        </div>
      </div>
    </div>
  );
}

// ====== Section 4b: Market Health ======

function MarketHealth({ market }: { market: CommandCenterData["market"] }) {
  const gradeColor =
    market.grade.startsWith("A")
      ? "text-emerald-600 bg-emerald-50 border-emerald-200"
      : market.grade.startsWith("B")
        ? "text-blue-600 bg-blue-50 border-blue-200"
        : market.grade.startsWith("C")
          ? "text-amber-600 bg-amber-50 border-amber-200"
          : market.grade === "—"
            ? "text-neutral-400 bg-neutral-50 border-neutral-200"
            : "text-rose-600 bg-rose-50 border-rose-200";

  const hasMarketData = market.marketAdr > 0;

  return (
    <div className="bg-neutral-0 rounded-xl shadow-sm p-6 h-full flex flex-col">
      <h2 className="text-xs font-semibold text-neutral-500 mb-4">
        Market Health
      </h2>

      {/* Grade badge */}
      <div className="flex items-center justify-center mb-5">
        <div
          className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center ${gradeColor}`}
        >
          <span className="text-3xl font-bold font-mono">{market.grade}</span>
        </div>
      </div>

      {hasMarketData ? (
        <>
          {/* ADR comparison */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neutral-500">Your ADR vs Market</span>
              <span className="font-mono font-medium text-neutral-700">
                {formatCurrency(market.yourAdr)} / {formatCurrency(market.marketAdr)}
              </span>
            </div>
            <ComparisonBar yours={market.yourAdr} market={market.marketAdr} />
          </div>

          {/* Occupancy comparison */}
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neutral-500">Occupancy vs Market</span>
              <span className="font-mono font-medium text-neutral-700">
                {market.yourOccupancy}% / {market.marketOccupancy}%
              </span>
            </div>
            <ComparisonBar yours={market.yourOccupancy} market={market.marketOccupancy} />
          </div>

          {/* Demand forecast strip */}
          {market.demandForecast.length > 0 && (
            <div className="mt-auto">
              <p className="text-xs text-neutral-400 mb-2">Demand forecast (30 days)</p>
              <div className="flex gap-px rounded-md overflow-hidden">
                {market.demandForecast.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 h-3"
                    style={{
                      backgroundColor: demandColor(d.score),
                    }}
                    title={`${d.date}: ${Math.round(d.score * 100)}%`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-neutral-300">Today</span>
                <span className="text-[10px] text-neutral-300">+30d</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-neutral-400 text-center mt-2">
          Market data not yet available. It will appear once market analysis runs.
        </p>
      )}
    </div>
  );
}

function ComparisonBar({ yours, market }: { yours: number; market: number }) {
  const max = Math.max(yours, market, 1);
  const yourPct = (yours / max) * 100;
  const marketPct = (market / max) * 100;

  return (
    <div className="relative h-4 bg-neutral-100 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-brand-400 rounded-full transition-all"
        style={{ width: `${yourPct}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 border-r-2 border-neutral-500"
        style={{ width: `${marketPct}%` }}
      />
    </div>
  );
}

function demandColor(score: number): string {
  if (score >= 0.8) return "#ef4444"; // red-500
  if (score >= 0.6) return "#f59e0b"; // amber-500
  if (score >= 0.4) return "#3b82f6"; // blue-500
  if (score >= 0.25) return "#93c5fd"; // blue-300
  return "#e5e7eb"; // gray-200
}

// ====== Section 5: Activity Feed ======

const feedIcons: Record<string, { icon: typeof BookOpen; color: string }> = {
  booking: { icon: BookOpen, color: "text-blue-500" },
  cleaning: { icon: CheckCircle2, color: "text-emerald-500" },
  review: { icon: Star, color: "text-purple-500" },
  rate_change: { icon: TrendingUp, color: "text-amber-500" },
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="bg-neutral-0 rounded-xl shadow-sm p-5">
      <h2 className="text-xs font-semibold text-neutral-500 mb-3">
        Recent Activity
      </h2>
      <div className="space-y-2.5">
        {items.map((item, i) => {
          const config = feedIcons[item.type] ?? feedIcons.booking;
          const Icon = config.icon;
          return (
            <div key={i} className="flex items-start gap-2.5">
              <Icon size={14} className={`${config.color} mt-0.5 flex-shrink-0`} />
              <p className="text-xs text-neutral-600 flex-1">{item.text}</p>
              <span className="text-[11px] text-neutral-300 flex-shrink-0 whitespace-nowrap">
                {item.timeAgo}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ====== Loading Skeleton ======

function LoadingSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto animate-pulse">
      {/* Property cards skeleton */}
      <div className="flex gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-[280px] flex-shrink-0 bg-neutral-0 rounded-xl shadow-sm">
            <div className="h-[100px] bg-neutral-100 rounded-t-xl" />
            <div className="p-3 h-[80px] space-y-2">
              <div className="h-4 bg-neutral-100 rounded w-3/4" />
              <div className="h-3 bg-neutral-50 rounded w-1/2" />
              <div className="h-3 bg-neutral-50 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
      {/* Actions skeleton */}
      <div className="space-y-2 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-neutral-0 rounded-xl shadow-sm" />
        ))}
      </div>
      {/* Events skeleton */}
      <div className="h-10 bg-neutral-0 rounded-xl shadow-sm mb-6" />
      {/* Performance skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        <div className="lg:col-span-3 h-[380px] bg-neutral-0 rounded-xl shadow-sm" />
        <div className="lg:col-span-2 h-[380px] bg-neutral-0 rounded-xl shadow-sm" />
      </div>
    </div>
  );
}
