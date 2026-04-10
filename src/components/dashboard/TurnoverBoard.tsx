"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import PropertyAvatar from "@/components/ui/PropertyAvatar";
import { RefreshCw, ChevronDown, ChevronRight, Sparkles, CheckCircle2, Clock, AlertTriangle, MessageSquare } from "lucide-react";

interface Task {
  id: string;
  property_id: string;
  booking_id: string | null;
  next_booking_id: string | null;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  checklist: { id: string; label: string; done: boolean }[];
  notes: string | null;
  completed_at: string | null;
  cleaner_token: string | null;
  cleaner_id: string | null;
}

interface Cleaner {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
}

interface TurnoverBoardProps {
  tasks: Task[];
  properties: { id: string; name: string; cover_photo_url?: string | null }[];
  bookings: { id: string; guest_name: string | null; check_in: string; check_out: string }[];
  cleaners?: Cleaner[];
}

type TabKey = "today" | "upcoming" | "completed" | "all";

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export default function TurnoverBoard({ tasks: initialTasks, properties, bookings, cleaners: initialCleaners = [] }: TurnoverBoardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [backfilling, setBackfilling] = useState(false);
  const [cleaners, setCleaners] = useState(initialCleaners);
  const [showCleaners, setShowCleaners] = useState(false);
  const [newCleanerName, setNewCleanerName] = useState("");
  const [newCleanerPhone, setNewCleanerPhone] = useState("");
  const [addingCleaner, setAddingCleaner] = useState(false);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const [upcomingLimit, setUpcomingLimit] = useState(14);

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const cleanerMap = useMemo(() => new Map(cleaners.map((c) => [c.id, c])), [cleaners]);
  const bookingMap = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const today = new Date().toISOString().split("T")[0];

  // Stats
  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.scheduled_date === today && t.status !== "completed");
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStr = weekEnd.toISOString().split("T")[0];
    const weekTasks = tasks.filter((t) => t.scheduled_date >= today && t.scheduled_date <= weekStr && t.status !== "completed");
    const unassigned = tasks.filter((t) => !t.cleaner_id && t.status !== "completed");
    return { today: todayTasks.length, week: weekTasks.length, unassigned: unassigned.length };
  }, [tasks, today]);

  // Filtered tasks by tab
  const filteredTasks = useMemo(() => {
    switch (activeTab) {
      case "today":
        return tasks.filter((t) => t.scheduled_date === today && t.status !== "completed");
      case "upcoming": {
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + upcomingLimit);
        const limitStr = limitDate.toISOString().split("T")[0];
        return tasks.filter((t) => t.scheduled_date > today && t.scheduled_date <= limitStr && t.status !== "completed");
      }
      case "completed":
        return tasks.filter((t) => t.status === "completed").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
      case "all":
        return [...tasks].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    }
  }, [tasks, activeTab, today, upcomingLimit]);

  // Group upcoming by date
  const dateGroups = useMemo(() => {
    if (activeTab !== "upcoming") return [];
    const groups: { date: string; label: string; tasks: Task[] }[] = [];
    let current = "";
    for (const t of filteredTasks) {
      if (t.scheduled_date !== current) {
        current = t.scheduled_date;
        groups.push({ date: current, label: formatDateHeader(current), tasks: [] });
      }
      groups[groups.length - 1].tasks.push(t);
    }
    return groups;
  }, [filteredTasks, activeTab]);

  // Actions
  const updateStatus = useCallback(async (taskId: string, newStatus: string) => {
    setUpdatingTask(taskId);
    // Optimistic update
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : t.completed_at } : t
    ));
    try {
      const res = await fetch("/api/turnover/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Revert on failure
        setTasks((prev) => prev.map((t) =>
          t.id === taskId ? { ...t, status: "pending", completed_at: null } : t
        ));
        throw new Error(data.error || "Update failed");
      }
      toast(`Task marked as ${newStatus.replace("_", " ")}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update", "error");
    }
    setUpdatingTask(null);
  }, [toast, router]);

  const assignCleaner = useCallback(async (taskId: string, cleanerId: string) => {
    try {
      const res = await fetch("/api/turnover/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, cleanerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, cleaner_id: cleanerId, status: "assigned" } : t));
      toast(`Assigned to ${data.cleanerName}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to assign", "error");
    }
  }, [toast, router]);

  const backfill = useCallback(async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/turnover/auto-create", { method: "POST" });
      const data = await res.json();
      toast(`Created ${data.created} tasks, ${data.skipped} skipped`);
      router.refresh();
    } catch {
      toast("Backfill failed", "error");
    }
    setBackfilling(false);
  }, [toast, router]);

  const addCleaner = useCallback(async () => {
    if (!newCleanerName || !newCleanerPhone) return;
    setAddingCleaner(true);
    try {
      const res = await fetch("/api/cleaners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCleanerName, phone: newCleanerPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCleaners((prev) => [...prev, data]);
      setNewCleanerName("");
      setNewCleanerPhone("");
      toast(`Added ${data.name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
    setAddingCleaner(false);
  }, [newCleanerName, newCleanerPhone, toast]);

  const removeCleaner = useCallback(async (id: string) => {
    try {
      await fetch(`/api/cleaners?id=${id}`, { method: "DELETE" });
      setCleaners((prev) => prev.filter((c) => c.id !== id));
      toast("Cleaner removed");
    } catch { toast("Failed", "error"); }
  }, [toast]);

  const testSMS = useCallback(async (phone: string) => {
    try {
      const res = await fetch("/api/cleaners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      toast(data.success ? "Test SMS sent!" : "SMS failed", data.success ? undefined : "error");
    } catch { toast("SMS failed", "error"); }
  }, [toast]);

  const toggleExpand = (id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  // Tab counts
  const tabCounts = useMemo(() => {
    const todayCount = tasks.filter((t) => t.scheduled_date === today && t.status !== "completed").length;
    const upcomingCount = tasks.filter((t) => t.scheduled_date > today && t.status !== "completed").length;
    const completedCount = tasks.filter((t) => t.status === "completed").length;
    return { today: todayCount, upcoming: upcomingCount, completed: completedCount, all: tasks.length };
  }, [tasks, today]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "today", label: "Today", count: tabCounts.today },
    { key: "upcoming", label: "Upcoming", count: tabCounts.upcoming },
    { key: "completed", label: "Completed", count: tabCounts.completed },
    { key: "all", label: "All", count: tabCounts.all },
  ];

  // Empty state
  if (tasks.length === 0) {
    return (
      <div>
        <Header stats={stats} cleanerCount={cleaners.length} onShowCleaners={() => setShowCleaners(!showCleaners)} onBackfill={backfill} backfilling={backfilling} />
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-sm">
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No upcoming turnovers</h2>
            <p className="text-sm text-gray-500 mb-6">
              Cleaning tasks are automatically created when new bookings sync from your calendar.
            </p>
            <button
              onClick={backfill}
              disabled={backfilling}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${backfilling ? "animate-spin" : ""}`} />
              {backfilling ? "Creating..." : "Auto-Create Tasks"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header stats={stats} cleanerCount={cleaners.length} onShowCleaners={() => setShowCleaners(!showCleaners)} onBackfill={backfill} backfilling={backfilling} />

      {/* Cleaners management panel */}
      {showCleaners && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Manage Cleaners</h3>
          <div className="space-y-2 mb-4">
            {cleaners.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.phone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => testSMS(c.phone)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Test SMS</button>
                  <button onClick={() => removeCleaner(c.id)} className="text-xs text-red-500 hover:text-red-600 font-medium">Remove</button>
                </div>
              </div>
            ))}
            {cleaners.length === 0 && <p className="text-sm text-gray-400">No cleaners added yet.</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newCleanerName} onChange={(e) => setNewCleanerName(e.target.value)} placeholder="Name" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            <input type="text" value={newCleanerPhone} onChange={(e) => setNewCleanerPhone(e.target.value)} placeholder="+1234567890" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            <button onClick={addCleaner} disabled={addingCleaner || !newCleanerName || !newCleanerPhone}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {addingCleaner ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Tab navigation — scrollable on mobile */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
              activeTab === tab.key
                ? "text-emerald-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
              }`}>{tab.count}</span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <CheckCircle2 size={20} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-500">
            {activeTab === "today" ? "No turnovers today" : activeTab === "completed" ? "No completed tasks yet" : "No tasks found"}
          </p>
        </div>
      ) : activeTab === "upcoming" ? (
        /* Upcoming — grouped by date */
        <div className="space-y-4">
          {dateGroups.map((group) => (
            <div key={group.date}>
              <button
                onClick={() => toggleDateCollapse(group.date)}
                className="flex items-center gap-2 mb-2 w-full text-left"
              >
                {collapsedDates.has(group.date) ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                <span className="text-sm font-semibold text-gray-700">{group.label}</span>
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{group.tasks.length}</span>
              </button>
              {!collapsedDates.has(group.date) && (
                <div className="space-y-2 ml-6">
                  {group.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      propMap={propMap}
                      bookingMap={bookingMap}
                      cleanerMap={cleanerMap}
                      cleaners={cleaners}
                      expanded={expandedTasks.has(task.id)}
                      onToggle={() => toggleExpand(task.id)}
                      onUpdateStatus={updateStatus}
                      onAssign={assignCleaner}
                      updating={updatingTask === task.id}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {filteredTasks.length >= 10 && (
            <button
              onClick={() => setUpcomingLimit((v) => v + 14)}
              className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      ) : (
        /* Today / Completed / All — flat list */
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              propMap={propMap}
              bookingMap={bookingMap}
              cleanerMap={cleanerMap}
              cleaners={cleaners}
              expanded={expandedTasks.has(task.id)}
              onToggle={() => toggleExpand(task.id)}
              onUpdateStatus={updateStatus}
              onAssign={assignCleaner}
              updating={updatingTask === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ====== Header ======
function Header({ stats, cleanerCount, onShowCleaners, onBackfill, backfilling }: {
  stats: { today: number; week: number; unassigned: number };
  cleanerCount: number;
  onShowCleaners: () => void;
  onBackfill: () => void;
  backfilling: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Cleaning</h1>
        <p className="text-sm text-gray-500">Cleaning schedules and task management</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Stats pills */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock size={12} /> Today: {stats.today}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-gray-50 text-gray-600 border border-gray-200">
          This Week: {stats.week}
        </span>
        {stats.unassigned > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-red-50 text-red-600 border border-red-200">
            <AlertTriangle size={12} /> Unassigned: {stats.unassigned}
          </span>
        )}
        <button
          onClick={onShowCleaners}
          className="px-3.5 py-1.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Cleaners ({cleanerCount})
        </button>
        <button
          onClick={onBackfill}
          disabled={backfilling}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${backfilling ? "animate-spin" : ""}`} />
          {backfilling ? "Creating..." : "Auto-Create"}
        </button>
      </div>
    </div>
  );
}

// ====== Task Card ======
function TaskCard({ task, propMap, bookingMap, cleanerMap, cleaners, expanded, onToggle, onUpdateStatus, onAssign, updating, compact }: {
  task: Task;
  propMap: Map<string, { id: string; name: string; cover_photo_url?: string | null }>;
  bookingMap: Map<string, { id: string; guest_name: string | null; check_in: string; check_out: string }>;
  cleanerMap: Map<string, Cleaner>;
  cleaners: Cleaner[];
  expanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (taskId: string, status: string) => Promise<void>;
  onAssign: (taskId: string, cleanerId: string) => Promise<void>;
  updating: boolean;
  compact?: boolean;
}) {
  const prop = propMap.get(task.property_id);
  const propName = prop?.name ?? "Property";
  const checkoutBooking = task.booking_id ? bookingMap.get(task.booking_id) : null;
  const nextBooking = task.next_booking_id ? bookingMap.get(task.next_booking_id) : null;
  const assignedCleaner = task.cleaner_id ? cleanerMap.get(task.cleaner_id) : null;
  const doneCount = (task.checklist ?? []).filter((i) => i.done).length;
  const totalCount = (task.checklist ?? []).length;
  const photoSize = compact ? 48 : 64;

  const statusBorder = task.status === "issue" ? "border-l-4 border-l-red-400"
    : task.status === "in_progress" ? "border-l-4 border-l-blue-400"
    : task.status === "completed" ? "border-l-4 border-l-emerald-400"
    : "";

  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 ${statusBorder}`}
    >
      <div className="p-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 cursor-pointer" onClick={onToggle}>
        {/* Property photo + info row */}
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <PropertyAvatar name={propName} photoUrl={prop?.cover_photo_url} size={photoSize} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold text-gray-900 truncate ${compact ? "text-sm" : "text-base"}`}>{propName}</p>
                <p className="text-sm text-gray-500">
                  {formatShortDate(task.scheduled_date)}
                  {task.scheduled_time && ` · ${formatTime(task.scheduled_time)} checkout`}
                  {nextBooking && " → 3:00 PM check-in"}
                </p>
              </div>
            </div>

            {/* Guest info */}
            {!compact && (checkoutBooking || nextBooking) && (
              <p className="text-xs text-gray-500 mt-1">
                {checkoutBooking && <span>Checkout: {checkoutBooking.guest_name ?? "Guest"}</span>}
                {checkoutBooking && nextBooking && <span className="mx-1.5 text-gray-300">→</span>}
                {nextBooking && <span>Check-in: {nextBooking.guest_name ?? "Guest"}</span>}
              </p>
            )}

            {/* Status + Cleaner + Actions — mobile (below text) */}
            <div className="flex items-center gap-2 flex-wrap mt-2 sm:hidden">
              {/* Status badge — mobile */}
              {task.status === "completed" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={11} /> Done
                </span>
              ) : task.status === "in_progress" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  <Clock size={11} /> In Progress
                </span>
              ) : task.status === "issue" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                  <AlertTriangle size={11} /> Issue
                </span>
              ) : null}

              {/* Cleaner pill — mobile */}
              {assignedCleaner ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{assignedCleaner.name}</span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">Unassigned</span>
              )}

              {/* Buttons — mobile */}
              {task.status !== "completed" && task.status !== "in_progress" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateStatus(task.id, "in_progress"); }}
                  disabled={updating}
                  className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg disabled:opacity-50"
                >
                  {updating ? "..." : "In Progress"}
                </button>
              )}
              {task.status !== "completed" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateStatus(task.id, "completed"); }}
                  disabled={updating}
                  className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg disabled:opacity-50"
                >
                  {updating ? "..." : "Complete"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Desktop right side: status + cleaner + actions */}
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          {/* Status badge */}
          {task.status === "completed" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> Completed
            </span>
          ) : task.status === "in_progress" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
              <Clock size={12} /> In Progress
            </span>
          ) : task.status === "issue" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700">
              <AlertTriangle size={12} /> Issue
            </span>
          ) : null}

          {/* Cleaner pill */}
          {assignedCleaner ? (
            <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
              {assignedCleaner.name}
            </span>
          ) : (
            <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">
              Unassigned
            </span>
          )}

          {/* Notify cleaner button */}
          {assignedCleaner && task.status !== "completed" && (
            <button
              onClick={(e) => { e.stopPropagation(); alert(`SMS notifications coming soon.\n\nCleaner: ${assignedCleaner.name}\nPhone: ${cleanerMap.get(task.cleaner_id!)?.phone ?? ""}`); }}
              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title={`Notify ${assignedCleaner.name}`}
            >
              <MessageSquare size={14} />
            </button>
          )}

          {/* Action buttons */}
          {task.status !== "completed" && task.status !== "in_progress" && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus(task.id, "in_progress"); }}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {updating ? "..." : "In Progress"}
            </button>
          )}
          {task.status !== "completed" && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus(task.id, "completed"); }}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              {updating ? "..." : "Complete"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Assign cleaner */}
          {cleaners.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Assign Cleaner</label>
              <div className="flex items-center gap-2">
                <select
                  value={task.cleaner_id ?? ""}
                  onChange={(e) => { if (e.target.value) onAssign(task.id, e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  <option value="">Select cleaner...</option>
                  {cleaners.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
                {assignedCleaner && task.status !== "completed" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); alert(`SMS notifications coming soon.\n\nCleaner: ${assignedCleaner.name}\nPhone: ${cleanerMap.get(task.cleaner_id!)?.phone ?? ""}`); }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors flex-shrink-0"
                  >
                    <MessageSquare size={12} /> Notify
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Checklist */}
          {totalCount > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Checklist ({doneCount}/{totalCount})</p>
              <div className="space-y-1.5">
                {task.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${item.done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                      {item.done && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm ${item.done ? "text-gray-400 line-through" : "text-gray-700"}`}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {task.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-600">{task.notes}</p>
            </div>
          )}

          {/* Guest details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Checkout Guest</p>
              <p className="text-sm font-medium text-gray-900">
                {checkoutBooking?.guest_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Next Guest</p>
              <p className="text-sm font-medium text-gray-900">
                {nextBooking?.guest_name ?? "None"}
              </p>
            </div>
          </div>

          {/* Status actions */}
          {task.status !== "completed" && (
            <div className="flex gap-2 pt-2">
              {task.status !== "in_progress" && (
                <button
                  onClick={() => onUpdateStatus(task.id, "in_progress")}
                  disabled={updating}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                >
                  Mark In Progress
                </button>
              )}
              <button
                onClick={() => onUpdateStatus(task.id, "completed")}
                disabled={updating}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                Mark Complete
              </button>
              {task.status !== "issue" && (
                <button
                  onClick={() => onUpdateStatus(task.id, "issue")}
                  disabled={updating}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Report Issue
                </button>
              )}
            </div>
          )}

          {task.completed_at && (
            <p className="text-xs text-gray-400">
              Completed {new Date(task.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
