"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DollarSign, Percent, TrendingUp, CalendarCheck } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
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

  const fetchData = useCallback(async (r: TimeRange) => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: r }),
      });
      const json = await res.json();
      if (json.empty) {
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      // silent fail — keep current data
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
          value={stats.avgRate > 0 ? formatCurrency(stats.avgRate) : "\u2014"}
          change={rangeLabels[range]}
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
              {todayCheckIns.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{b.guest_name ?? "Unknown Guest"}</p>
                    <p className="text-xs text-neutral-400">{propMap.get(b.property_id) ?? "Unknown Property"}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-500">{b.platform}</span>
                </div>
              ))}
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
              {todayCheckOuts.map((b, i) => {
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
            </div>
          )}
        </div>
      </div>

      {/* Week calendar */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-8">
        <h2 className="text-lg font-bold text-neutral-800 mb-4">Next 7 Days</h2>
        <WeekCalendar days={days} properties={propertyWeeks} />
      </div>

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
