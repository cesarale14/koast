"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DollarSign, Percent, TrendingUp, CalendarCheck, X as XIcon } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EventBadge from "@/components/ui/EventBadge";
import RevenueChart from "./RevenueChart";
import WeekCalendar from "./WeekCalendar";

type TimeRange = "this_week" | "this_month" | "next_30" | "next_90" | "this_year";

const rangeLabels: Record<TimeRange, string> = {
  this_week: "This Week",
  this_month: "This Month",
  next_30: "Next 30 Days",
  next_90: "Next 90 Days",
  this_year: "This Year",
};

const rangeKeys: TimeRange[] = ["this_week", "this_month", "next_30", "next_90", "this_year"];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

interface DashboardData {
  range: TimeRange;
  dateRange: { start: string; end: string; totalDays: number };
  stats: {
    revenue: number;
    occupancyRate: number;
    bookedNights: number;
    propertiesWithBookings: number;
    totalProperties: number;
    avgRate: number;
    avgRateEstimated: boolean;
    upcomingCheckIns: number;
  };
  todayCheckIns: { guest_name: string | null; property_id: string; platform: string; status: string }[];
  todayCheckOuts: { id: string; guest_name: string | null; property_id: string; platform: string }[];
  cleaningStatuses: Record<string, string>;
  unreadMsgCount: number;
  days: { date: string; dayLabel: string; dayNum: number; isToday: boolean }[];
  propertyWeeks: {
    propertyId: string;
    propertyName: string;
    days: { date: string; status: "booked" | "available" | "blocked"; guestName?: string }[];
  }[];
  revenueData: { month: string; revenue: number }[];
  properties: { id: string; name: string }[];
}

export default function DashboardClient() {
  const router = useRouter();
  const [range, setRange] = useState<TimeRange>("next_30");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [showAllCheckIns, setShowAllCheckIns] = useState(false);
  const [showAllCheckOuts, setShowAllCheckOuts] = useState(false);

  const fetchData = useCallback(async (r: TimeRange) => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch("/api/dashboard/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: r }),
      });
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
    fetchData(range);
  }, [range, fetchData]);

  if (loading && !data) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Dashboard</h1>
        <p className="text-neutral-500 mb-8">Overview of your properties and bookings</p>
        <div className="flex items-center justify-center h-64">
          <div className="text-neutral-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    // Redirect new users to onboarding
    router.push("/onboarding");
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Redirecting to setup...</div>
      </div>
    );
  }

  const { stats, todayCheckIns, todayCheckOuts, cleaningStatuses, unreadMsgCount, days, propertyWeeks, revenueData, properties } = data;
  const propMap = new Map(properties.map((p) => [p.id, p.name]));
  const ACTIVITY_LIMIT = 10;
  const visibleCheckIns = showAllCheckIns ? todayCheckIns : todayCheckIns.slice(0, ACTIVITY_LIMIT);
  const visibleCheckOuts = showAllCheckOuts ? todayCheckOuts : todayCheckOuts.slice(0, ACTIVITY_LIMIT);

  return (
    <div>
      {/* Header with time range selector */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Dashboard</h1>
          <p className="text-neutral-500 text-sm">Overview of your properties and bookings</p>
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 overflow-x-auto flex-shrink-0">
          {rangeKeys.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === r
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-neutral-50 text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {fetchError && data && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-lg bg-warning-light border border-warning/20">
          <p className="text-sm text-warning-dark font-medium" style={{ color: "#92400e" }}>
            Unable to refresh data. Showing last available data.
          </p>
          <button
            onClick={() => fetchData(range)}
            className="text-sm font-medium px-3 py-1 rounded-md bg-warning/10 hover:bg-warning/20 transition-colors"
            style={{ color: "#92400e" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading overlay */}
      <div className={loading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <StatCard
          label="Revenue"
          value={stats.revenue > 0 ? formatCurrency(stats.revenue) : "$0"}
          change={rangeLabels[range]}
          changeType="neutral"
          icon={DollarSign}
        />
        <StatCard
          label="Occupancy Rate"
          value={`${stats.occupancyRate}%`}
          change={`${stats.bookedNights} nights booked${
            stats.propertiesWithBookings < stats.totalProperties
              ? ` (${stats.propertiesWithBookings} of ${stats.totalProperties} properties)`
              : ""
          }`}
          changeType="neutral"
          icon={Percent}
        />
        <StatCard
          label="Avg Nightly Rate"
          value={stats.avgRate > 0 ? `${formatCurrency(stats.avgRate)}${stats.avgRateEstimated ? " (estimated)" : ""}` : "\u2014"}
          change={stats.avgRateEstimated ? "Based on calendar rates" : rangeLabels[range]}
          changeType="neutral"
          icon={TrendingUp}
        />
        <StatCard
          label="Upcoming Check-ins"
          value={String(stats.upcomingCheckIns)}
          change={rangeLabels[range]}
          changeType="neutral"
          icon={CalendarCheck}
        />
      </div>

      {/* Action Center */}
      <ActionCenter />

      {/* Today's activity + Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Check-ins today */}
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-neutral-800">Check-ins Today</h2>
            <span className="text-xs px-2 py-1 rounded-full bg-brand-50 text-brand-500 font-medium font-mono">
              {todayCheckIns.length}
            </span>
          </div>
          {todayCheckIns.length === 0 ? (
            <p className="text-neutral-400 text-sm">No check-ins today.</p>
          ) : (
            <div className="space-y-3">
              {visibleCheckIns.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{b.guest_name ?? "Unknown Guest"}</p>
                    <p className="text-xs text-neutral-400">{propMap.get(b.property_id) ?? "Unknown Property"}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-500">{b.platform}</span>
                </div>
              ))}
              {todayCheckIns.length > ACTIVITY_LIMIT && !showAllCheckIns && (
                <button
                  onClick={() => setShowAllCheckIns(true)}
                  className="text-sm text-brand-500 hover:text-brand-600 font-medium"
                >
                  +{todayCheckIns.length - ACTIVITY_LIMIT} more
                </button>
              )}
            </div>
          )}
        </div>

        {/* Check-outs today */}
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-neutral-800">Check-outs Today</h2>
            <div className="flex items-center gap-3">
              {unreadMsgCount > 0 && (
                <Link href="/messages"
                  className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors">
                  {unreadMsgCount} unread message{unreadMsgCount !== 1 ? "s" : ""}
                </Link>
              )}
              <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-600 font-medium font-mono">
                {todayCheckOuts.length}
              </span>
            </div>
          </div>
          {todayCheckOuts.length === 0 ? (
            <p className="text-neutral-400 text-sm">No check-outs today.</p>
          ) : (
            <div className="space-y-3">
              {visibleCheckOuts.map((b, i) => {
                const cleaningStatus = cleaningStatuses[b.id];
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{b.guest_name ?? "Unknown Guest"}</p>
                      <p className="text-xs text-neutral-400">{propMap.get(b.property_id) ?? "Unknown Property"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      cleaningStatus === "completed" ? "bg-success-light text-success"
                      : cleaningStatus === "in_progress" ? "bg-info-light text-info"
                      : cleaningStatus === "assigned" ? "bg-warning-light text-warning"
                      : "bg-neutral-100 text-neutral-500"
                    }`}>
                      {cleaningStatus === "completed" ? "Cleaned"
                        : cleaningStatus === "in_progress" ? "Cleaning"
                        : cleaningStatus === "assigned" ? "Assigned"
                        : cleaningStatus === "issue" ? "Issue"
                        : "No task"}
                    </span>
                  </div>
                );
              })}
              {todayCheckOuts.length > ACTIVITY_LIMIT && !showAllCheckOuts && (
                <button
                  onClick={() => setShowAllCheckOuts(true)}
                  className="text-sm text-brand-500 hover:text-brand-600 font-medium"
                >
                  +{todayCheckOuts.length - ACTIVITY_LIMIT} more
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Week calendar */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-8">
        <h2 className="text-lg font-bold text-neutral-800 mb-4">Next 7 Days</h2>
        <WeekCalendar days={days} properties={propertyWeeks} />
      </div>

      {/* Upcoming events */}
      <UpcomingEvents />

      {/* Revenue chart */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
        <h2 className="text-lg font-bold text-neutral-800 mb-4">
          Monthly Revenue
          {range === "this_year" && <span className="text-sm font-normal text-neutral-400 ml-2">(12 months)</span>}
          {range === "next_90" && <span className="text-sm font-normal text-neutral-400 ml-2">(3 months)</span>}
        </h2>
        <RevenueChart data={revenueData} />
      </div>

      </div>
    </div>
  );
}

// ---------- Action Center ----------

interface ActionItem {
  id: string; type: string; icon: string; title: string; description: string;
  action?: { label: string; href: string };
}

function ActionCenter() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dismissed-actions");
    if (saved) try { setDismissed(new Set(JSON.parse(saved))); } catch { /* ignore */ }

    fetch("/api/dashboard/actions", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { setActions(d.actions ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem("dismissed-actions", JSON.stringify(Array.from(next)));
  };

  const visible = actions.filter((a) => !dismissed.has(a.id));

  if (!loaded || visible.length === 0) {
    if (loaded && actions.length === 0) return null;
    if (loaded && visible.length === 0) {
      return (
        <div className="mb-8 p-4 rounded-xl bg-brand-50/50 text-center">
          <p className="text-sm font-medium text-brand-600">You&apos;re all caught up!</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">Needs Your Attention</h2>
      <div className="space-y-2">
        {visible.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-neutral-0 shadow-sm group">
            <span className="text-lg flex-shrink-0 mt-0.5">{a.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800">{a.title}</p>
              <p className="text-xs text-neutral-400 mt-0.5">{a.description}</p>
            </div>
            {a.action && (
              <Link href={a.action.href} className="flex-shrink-0 px-3 py-1 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
                {a.action.label}
              </Link>
            )}
            <button onClick={() => dismiss(a.id)} className="flex-shrink-0 p-1 text-neutral-300 hover:text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Upcoming Events ----------

function UpcomingEvents() {
  const [events, setEvents] = useState<{ name: string; date: string; impact: number; venue?: string; attendance?: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/actions", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.actions) { setLoaded(true); return; }
        const evs: typeof events = [];
        for (const a of d.actions as { type: string; title: string; description: string; id: string }[]) {
          if (a.type === "event") {
            const parts = a.title.split(" — ");
            const name = parts[0] ?? a.title;
            const datePart = parts[1] ?? "";
            const attMatch = a.description.match(/(\d+)K attendees/);
            const impactMatch = a.description.match(/demand impact: (\d+)%/);
            const venueMatch = a.description.match(/at (.+?) —/);
            evs.push({
              name,
              date: datePart,
              impact: impactMatch ? parseInt(impactMatch[1]) / 100 : 0.3,
              venue: venueMatch?.[1],
              attendance: attMatch ? parseInt(attMatch[1]) * 1000 : undefined,
            });
          }
        }
        setEvents(evs);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || events.length === 0) return null;

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-8">
      <h2 className="text-lg font-bold text-neutral-800 mb-3">Upcoming Local Events</h2>
      <div className="space-y-2">
        {events.map((e, i) => (
          <EventBadge key={i} name={e.name} impact={e.impact} date={e.date} venue={e.venue} attendance={e.attendance} />
        ))}
      </div>
    </div>
  );
}
