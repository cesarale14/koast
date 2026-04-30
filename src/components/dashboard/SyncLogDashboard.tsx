"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowLeft, ChevronDown, ChevronRight, Filter,
  Activity, Clock, AlertCircle, CheckCircle2,
  XCircle, Loader2, RefreshCcw, Cable,
} from "lucide-react";

// ---------- Types ----------

interface LogEntry {
  id: string;
  event_type: string;
  booking_id: string | null;
  revision_id: string | null;
  channex_property_id: string;
  guest_name: string | null;
  check_in: string | null;
  check_out: string | null;
  payload: Record<string, unknown> | null;
  action_taken: string;
  ack_sent: boolean;
  ack_response: string | null;
  created_at: string;
}

interface SyncLogDashboardProps {
  initialLogs: Record<string, unknown>[];
  totalCount: number;
  propertyNameMap: Record<string, string>;
  hasChannexProperties: boolean;
}

// ---------- Helpers ----------

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  booking_new: { label: "New Booking", color: "text-[var(--positive)]", bg: "bg-brand-50" },
  ota_booking_created: { label: "New Booking", color: "text-[var(--positive)]", bg: "bg-brand-50" },
  booking: { label: "Booking", color: "text-blue-700", bg: "bg-blue-50" },
  booking_modification: { label: "Modified", color: "text-amber-700", bg: "bg-amber-50" },
  ota_booking_modified: { label: "Modified", color: "text-amber-700", bg: "bg-amber-50" },
  booking_cancellation: { label: "Cancelled", color: "text-red-700", bg: "bg-red-50" },
  ota_booking_cancelled: { label: "Cancelled", color: "text-red-700", bg: "bg-red-50" },
};

const ACTION_COLORS: Record<string, { dot: string; text: string }> = {
  created: { dot: "bg-[var(--positive)]", text: "text-[var(--positive)]" },
  modified: { dot: "bg-amber-500", text: "text-amber-600" },
  cancelled: { dot: "bg-red-500", text: "text-red-600" },
  skipped_self: { dot: "bg-neutral-400", text: "text-neutral-500" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateRange(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn) return "";
  const ci = new Date(checkIn + "T00:00:00");
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!checkOut) return fmt(ci);
  const co = new Date(checkOut + "T00:00:00");
  return `${fmt(ci)} - ${fmt(co)}`;
}

function getChannelFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const otaName = (payload.payload as Record<string, unknown>)?.ota_name as string
    ?? (payload as Record<string, unknown>).ota_name as string
    ?? null;
  if (!otaName) return null;
  const lower = otaName.toLowerCase();
  if (lower.includes("airbnb")) return "Airbnb";
  if (lower.includes("booking")) return "Booking.com";
  if (lower.includes("vrbo") || lower.includes("homeaway")) return "VRBO";
  if (lower.includes("expedia")) return "Expedia";
  return otaName;
}

// ---------- Filter Bar ----------

function FilterBar({
  eventFilter,
  statusFilter,
  onEventChange,
  onStatusChange,
  onClear,
}: {
  eventFilter: string;
  statusFilter: string;
  onEventChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onClear: () => void;
}) {
  const hasFilters = eventFilter || statusFilter;
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="flex items-center gap-1.5 text-neutral-500">
        <Filter size={14} />
        <span className="text-xs font-medium uppercase tracking-wider">Filters</span>
      </div>

      {/* Event type filter */}
      <div className="relative">
        <select
          value={eventFilter}
          onChange={(e) => onEventChange(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-700 hover:border-neutral-300 transition-colors cursor-pointer"
        >
          <option value="">All Events</option>
          <option value="booking_new">New Booking</option>
          <option value="booking_modification">Modified</option>
          <option value="booking_cancellation">Cancelled</option>
          <option value="booking">Booking (general)</option>
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
      </div>

      {/* Status filter */}
      <div className="relative">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-700 hover:border-neutral-300 transition-colors cursor-pointer"
        >
          <option value="">All Actions</option>
          <option value="created">Created</option>
          <option value="modified">Modified</option>
          <option value="cancelled">Cancelled</option>
          <option value="skipped_self">Skipped (self)</option>
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
      </div>

      {hasFilters && (
        <button
          onClick={onClear}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------- Log Entry Component ----------

function LogEntryCard({
  log,
  propertyName,
}: {
  log: LogEntry;
  propertyName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const actionStyle = ACTION_COLORS[log.action_taken] ?? ACTION_COLORS.created;
  const eventLabel = EVENT_TYPE_LABELS[log.event_type] ?? { label: log.event_type, color: "text-neutral-700", bg: "bg-neutral-50" };
  const channel = getChannelFromPayload(log.payload);

  // Build description
  let description = "";
  if (log.action_taken === "skipped_self") {
    description = "Self-originated booking (skipped)";
  } else if (log.guest_name && log.check_in) {
    const action = log.action_taken === "created" ? "New booking" : log.action_taken === "modified" ? "Booking modified" : "Booking cancelled";
    description = `${action}${channel ? ` via ${channel}` : ""} \u2014 ${log.guest_name}, ${formatDateRange(log.check_in, log.check_out)}`;
  } else {
    description = `${log.event_type.replace(/_/g, " ")}${channel ? ` via ${channel}` : ""}`;
  }

  return (
    <div className="relative pl-8">
      {/* Timeline dot + line */}
      <div className="absolute left-0 top-0 bottom-0 flex flex-col items-center">
        <div className={`w-3.5 h-3.5 rounded-full ${actionStyle.dot} ring-4 ring-white mt-1.5 flex-shrink-0 z-10`} />
        <div className="w-px flex-1 bg-neutral-100 -mt-0.5" />
      </div>

      <div className="pb-6">
        <div
          className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 hover:shadow-sm transition-shadow cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${eventLabel.bg} ${eventLabel.color}`}>
                {eventLabel.label}
              </span>
              {channel && (
                <span className="text-[11px] font-medium text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded-md">
                  {channel}
                </span>
              )}
              {log.ack_sent ? (
                <span className="flex items-center gap-1 text-[11px] text-tideline">
                  <CheckCircle2 size={11} />
                  ACK
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-amber-500">
                  <AlertCircle size={11} />
                  No ACK
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-neutral-400 font-mono">{timeAgo(log.created_at)}</span>
              <ChevronRight
                size={14}
                className={`text-neutral-300 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-neutral-700">{description}</p>

          {/* Property name */}
          <p className="text-xs text-neutral-400 mt-1.5">{propertyName}</p>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-neutral-400 block mb-0.5">Event Type</span>
                  <span className="font-mono text-neutral-700">{log.event_type}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block mb-0.5">Action</span>
                  <span className={`font-medium capitalize ${actionStyle.text}`}>{log.action_taken.replace("_", " ")}</span>
                </div>
                {log.booking_id && (
                  <div>
                    <span className="text-neutral-400 block mb-0.5">Booking ID</span>
                    <span className="font-mono text-neutral-700 text-[11px] break-all">{log.booking_id}</span>
                  </div>
                )}
                {log.revision_id && (
                  <div>
                    <span className="text-neutral-400 block mb-0.5">Revision ID</span>
                    <span className="font-mono text-neutral-700 text-[11px] break-all">{log.revision_id}</span>
                  </div>
                )}
                {log.guest_name && (
                  <div>
                    <span className="text-neutral-400 block mb-0.5">Guest</span>
                    <span className="text-neutral-700">{log.guest_name}</span>
                  </div>
                )}
                {log.check_in && (
                  <div>
                    <span className="text-neutral-400 block mb-0.5">Dates</span>
                    <span className="text-neutral-700">{formatDateRange(log.check_in, log.check_out)}</span>
                  </div>
                )}
                <div>
                  <span className="text-neutral-400 block mb-0.5">ACK Response</span>
                  <span className="text-neutral-700">{log.ack_response ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block mb-0.5">Timestamp</span>
                  <span className="font-mono text-neutral-700 text-[11px]">
                    {new Date(log.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              {/* Raw payload toggle */}
              {log.payload && (
                <details className="mt-2">
                  <summary className="text-[11px] text-neutral-400 cursor-pointer hover:text-neutral-500 transition-colors">
                    View raw payload
                  </summary>
                  <pre className="mt-2 p-3 bg-neutral-50 rounded-lg text-[11px] font-mono text-neutral-600 overflow-x-auto max-h-48">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function SyncLogDashboard({
  initialLogs,
  totalCount,
  propertyNameMap,
  hasChannexProperties,
}: SyncLogDashboardProps) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs as unknown as LogEntry[]);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, startLoading] = useTransition();
  const { toast } = useToast();

  const hasMore = logs.length < total;

  // Fetch logs with filters
  const fetchLogs = useCallback(
    (opts: { page: number; event?: string; status?: string; append?: boolean }) => {
      startLoading(async () => {
        try {
          const params = new URLSearchParams();
          params.set("page", String(opts.page));
          params.set("limit", "50");
          if (opts.event) params.set("event_type", opts.event);
          if (opts.status) params.set("status", opts.status);

          const res = await fetch(`/api/channels/sync-log?${params}`);
          if (!res.ok) throw new Error("Failed to fetch logs");
          const data = await res.json();

          if (opts.append) {
            setLogs((prev) => [...prev, ...(data.logs as LogEntry[])]);
          } else {
            setLogs(data.logs as LogEntry[]);
          }
          setTotal(data.total);
          setPage(opts.page);
        } catch {
          toast("Failed to fetch sync logs", "error");
        }
      });
    },
    [toast]
  );

  const handleEventFilter = useCallback(
    (v: string) => {
      setEventFilter(v);
      fetchLogs({ page: 1, event: v, status: statusFilter });
    },
    [fetchLogs, statusFilter]
  );

  const handleStatusFilter = useCallback(
    (v: string) => {
      setStatusFilter(v);
      fetchLogs({ page: 1, event: eventFilter, status: v });
    },
    [fetchLogs, eventFilter]
  );

  const handleClearFilters = useCallback(() => {
    setEventFilter("");
    setStatusFilter("");
    fetchLogs({ page: 1 });
  }, [fetchLogs]);

  const handleLoadMore = useCallback(() => {
    fetchLogs({ page: page + 1, event: eventFilter, status: statusFilter, append: true });
  }, [fetchLogs, page, eventFilter, statusFilter]);

  const handleRefresh = useCallback(() => {
    fetchLogs({ page: 1, event: eventFilter, status: statusFilter });
  }, [fetchLogs, eventFilter, statusFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const created = logs.filter((l) => l.action_taken === "created").length;
    const modified = logs.filter((l) => l.action_taken === "modified").length;
    const cancelled = logs.filter((l) => l.action_taken === "cancelled").length;
    const errors = logs.filter((l) => !l.ack_sent && l.action_taken !== "skipped_self").length;
    return { created, modified, cancelled, errors };
  }, [logs]);

  // Empty state: no Channex properties
  if (!hasChannexProperties) {
    return (
      <div>
        <Link href="/channels" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to Channels
        </Link>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Sync Log</h1>
        <p className="text-sm text-neutral-500 mb-8">Monitor channel sync activity and webhook events</p>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-16 h-16 bg-neutral-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Activity size={32} className="text-neutral-300" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">No connected properties</h2>
          <p className="text-sm text-neutral-500 mb-6">Connect a property to Channex to start seeing sync activity.</p>
          <Link href="/channels" className="inline-flex px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors">
            Go to Channels
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <Link href="/channels" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to Channels
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Sync Log</h1>
          <p className="text-sm text-neutral-500">Monitor channel sync activity and webhook events</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all disabled:opacity-50"
        >
          <RefreshCcw size={15} strokeWidth={1.5} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-0 border border-[var(--border)] rounded-lg">
          <Cable size={13} className="text-neutral-400" />
          <span className="text-xs font-medium text-neutral-600">
            <span className="font-mono font-bold text-neutral-800">{total}</span> total events
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-[var(--positive)]" />
          <span className="text-xs font-medium text-[var(--positive)]">
            <span className="font-mono font-bold">{stats.created}</span> created
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs font-medium text-amber-700">
            <span className="font-mono font-bold">{stats.modified}</span> modified
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs font-medium text-red-700">
            <span className="font-mono font-bold">{stats.cancelled}</span> cancelled
          </span>
        </div>
        {stats.errors > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg">
            <XCircle size={13} className="text-red-400" />
            <span className="text-xs font-medium text-red-700">
              <span className="font-mono font-bold">{stats.errors}</span> unacknowledged
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <FilterBar
        eventFilter={eventFilter}
        statusFilter={statusFilter}
        onEventChange={handleEventFilter}
        onStatusChange={handleStatusFilter}
        onClear={handleClearFilters}
      />

      {/* Timeline */}
      {logs.length === 0 ? (
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock size={28} className="text-neutral-300" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-neutral-700 mb-1">No sync events yet</h3>
          <p className="text-sm text-neutral-400">
            {eventFilter || statusFilter
              ? "No events match the current filters. Try clearing the filters."
              : "Webhook events will appear here as bookings sync from your OTA channels."
            }
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-neutral-0/60 z-10 flex items-start justify-center pt-20">
              <Loader2 size={24} className="animate-spin text-brand-500" />
            </div>
          )}

          {/* Log entries */}
          <div className="space-y-0">
            {logs.map((log) => (
              <LogEntryCard
                key={log.id}
                log={log}
                propertyName={propertyNameMap[log.channex_property_id] ?? "Unknown property"}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                Load more ({total - logs.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
