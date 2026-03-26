"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-gray-500 mb-8">Overview of your properties and bookings</p>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-gray-500 mb-8">Overview of your properties and bookings</p>
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No properties yet</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add your first property to start tracking bookings, revenue, and occupancy.
          </p>
          <Link href="/properties"
            className="inline-flex px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Add Your First Property
          </Link>
        </div>
      </div>
    );
  }

  const { stats, todayCheckIns, todayCheckOuts, cleaningStatuses, unreadMsgCount, days, propertyWeeks, revenueData, properties } = data;
  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  return (
    <div>
      {/* Header with time range selector */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
          <p className="text-gray-500">Overview of your properties and bookings</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {rangeKeys.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === r
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Revenue</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {stats.revenue > 0 ? formatCurrency(stats.revenue) : "$0"}
          </p>
          <p className="text-xs text-gray-400 mt-1">{rangeLabels[range]}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Occupancy Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.occupancyRate}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.bookedNights} nights booked
            {stats.propertiesWithBookings < stats.totalProperties && (
              <> ({stats.propertiesWithBookings} of {stats.totalProperties} properties)</>
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Avg Nightly Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {stats.avgRate > 0 ? formatCurrency(stats.avgRate) : "\u2014"}
          </p>
          <p className="text-xs text-gray-400 mt-1">{rangeLabels[range]}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Upcoming Check-ins</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.upcomingCheckIns}</p>
          <p className="text-xs text-gray-400 mt-1">{rangeLabels[range]}</p>
        </div>
      </div>

      {/* Today's activity + Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Check-ins today */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Check-ins Today</h2>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
              {todayCheckIns.length}
            </span>
          </div>
          {todayCheckIns.length === 0 ? (
            <p className="text-gray-400 text-sm">No check-ins today.</p>
          ) : (
            <div className="space-y-3">
              {todayCheckIns.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{b.guest_name ?? "Unknown Guest"}</p>
                    <p className="text-xs text-gray-400">{propMap.get(b.property_id) ?? "Unknown Property"}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{b.platform}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Check-outs today */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Check-outs Today</h2>
            <div className="flex items-center gap-3">
              {unreadMsgCount > 0 && (
                <Link href="/messages"
                  className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors">
                  {unreadMsgCount} unread message{unreadMsgCount !== 1 ? "s" : ""}
                </Link>
              )}
              <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-600 font-medium">
                {todayCheckOuts.length}
              </span>
            </div>
          </div>
          {todayCheckOuts.length === 0 ? (
            <p className="text-gray-400 text-sm">No check-outs today.</p>
          ) : (
            <div className="space-y-3">
              {todayCheckOuts.map((b, i) => {
                const cleaningStatus = cleaningStatuses[b.id];
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{b.guest_name ?? "Unknown Guest"}</p>
                      <p className="text-xs text-gray-400">{propMap.get(b.property_id) ?? "Unknown Property"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      cleaningStatus === "completed" ? "bg-emerald-50 text-emerald-600"
                      : cleaningStatus === "in_progress" ? "bg-blue-50 text-blue-600"
                      : cleaningStatus === "assigned" ? "bg-amber-50 text-amber-600"
                      : "bg-gray-100 text-gray-500"
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Next 7 Days</h2>
        <WeekCalendar days={days} properties={propertyWeeks} />
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Monthly Revenue
          {range === "this_year" && <span className="text-sm font-normal text-gray-400 ml-2">(12 months)</span>}
          {range === "next_90" && <span className="text-sm font-normal text-gray-400 ml-2">(3 months)</span>}
        </h2>
        <RevenueChart data={revenueData} />
      </div>

      </div>
    </div>
  );
}
