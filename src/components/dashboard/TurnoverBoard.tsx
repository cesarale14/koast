"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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

  // Mount-only entrance trigger. Per-card cardReveal stagger fires once
  // per page load; task list updates (status changes, assignments) don't
  // replay animations because DOM nodes are keyed by task.id.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
    console.log("[TurnoverBoard] updateStatus called", { taskId, newStatus });
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
      console.log("[TurnoverBoard] update response", res.status, data);
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
      console.error("[TurnoverBoard] update failed", err);
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
      // TURN-S1a Amendment 6 (silent-fail fix per tech-debt.md:41).
      const res = await fetch("/api/turnover/auto-create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast(`Created ${data.created} tasks, ${data.skipped} skipped`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Backfill failed", "error");
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
      // TURN-S1a Amendment 6 (silent-fail fix per tech-debt.md:42).
      const res = await fetch(`/api/cleaners?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setCleaners((prev) => prev.filter((c) => c.id !== id));
      toast("Cleaner removed");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }, [toast]);

  // TURN-S1a — per-task notify state. Disables the Notify button
  // while a send is in flight; toast surfaces success/failure.
  const [notifying, setNotifying] = useState<Set<string>>(new Set());

  const notifyCleaner = useCallback(async (taskId: string, cleanerName: string) => {
    if (notifying.has(taskId)) return;
    setNotifying((prev) => { const n = new Set(prev); n.add(taskId); return n; });
    try {
      const res = await fetch("/api/turnover/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast(`SMS sent to ${cleanerName}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Notify failed", "error");
    } finally {
      setNotifying((prev) => { const n = new Set(prev); n.delete(taskId); return n; });
    }
  }, [notifying, toast]);

  // SMS state per cleaner: sending | success | error message
  const [smsState, setSmsState] = useState<Record<string, { status: "sending" | "success" | "error"; message?: string }>>({});

  const testSMS = useCallback(async (cleanerId: string, phone: string) => {
    setSmsState((prev) => ({ ...prev, [cleanerId]: { status: "sending" } }));
    try {
      const res = await fetch("/api/cleaners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      console.log("[TurnoverBoard] testSMS response", res.status, data);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSmsState((prev) => ({ ...prev, [cleanerId]: { status: "success", message: "SMS sent!" } }));
      toast("Test SMS sent!");
      // Auto-clear success message after 4s
      setTimeout(() => {
        setSmsState((prev) => {
          const next = { ...prev };
          delete next[cleanerId];
          return next;
        });
      }, 4000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send";
      console.error("[TurnoverBoard] testSMS failed", err);
      setSmsState((prev) => ({ ...prev, [cleanerId]: { status: "error", message } }));
      toast(`SMS failed: ${message}`, "error");
    }
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
            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(196,154,90,0.12)" }}>
              <Sparkles className="w-8 h-8" style={{ color: "var(--golden)" }} />
            </div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--coastal)" }}>No upcoming turnovers</h2>
            <p className="text-sm mb-6" style={{ color: "var(--tideline)" }}>
              Cleaning tasks are automatically created when new bookings sync from your calendar.
            </p>
            <button
              onClick={backfill}
              disabled={backfilling}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
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
        <div className="mb-6 bg-white p-5" style={{ borderRadius: 14, boxShadow: "var(--shadow-card)", border: "1px solid var(--dry-sand)" }}>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase mb-[14px]" style={{ color: "var(--golden)" }}>MANAGE CLEANERS</div>
          <div className="space-y-2 mb-4">
            {cleaners.map((c) => {
              const sms = smsState[c.id];
              return (
                <div key={c.id} className="py-2.5 last:border-0" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--coastal)" }}>{c.name}</p>
                      <p className="text-xs" style={{ color: "var(--tideline)" }}>{c.phone}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => testSMS(c.id, c.phone)}
                        disabled={sms?.status === "sending"}
                        className="text-xs text-[#1a3a2a] hover:text-[#1a3a2a] font-medium disabled:opacity-50"
                      >
                        {sms?.status === "sending" ? "Sending..." : "Test SMS"}
                      </button>
                      <button onClick={() => removeCleaner(c.id)} className="text-xs text-red-500 hover:text-red-600 font-medium">Remove</button>
                    </div>
                  </div>
                  {sms?.status === "success" && (
                    <p className="mt-1 text-xs text-[#1a3a2a] font-medium">✓ {sms.message}</p>
                  )}
                  {sms?.status === "error" && (
                    <p className="mt-1 text-xs text-red-600 font-medium">✗ Failed: {sms.message}</p>
                  )}
                </div>
              );
            })}
            {cleaners.length === 0 && <p className="text-sm" style={{ color: "var(--tideline)" }}>No cleaners added yet.</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newCleanerName} onChange={(e) => setNewCleanerName(e.target.value)} placeholder="Name" className="flex-1 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-golden/30" style={{ border: "1px solid var(--dry-sand)", borderRadius: 10 }} />
            <input type="text" value={newCleanerPhone} onChange={(e) => setNewCleanerPhone(e.target.value)} placeholder="+1234567890" className="flex-1 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-golden/30" style={{ border: "1px solid var(--dry-sand)", borderRadius: 10 }} />
            <button onClick={addCleaner} disabled={addingCleaner || !newCleanerName || !newCleanerPhone}
              className="px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}>
              {addingCleaner ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Tab navigation — scrollable on mobile */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-hide" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap border-b-2 -mb-px"
            style={
              activeTab === tab.key
                ? { color: "var(--coastal)", borderColor: "var(--golden)" }
                : { color: "var(--tideline)", borderColor: "transparent" }
            }
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={
                  activeTab === tab.key
                    ? { backgroundColor: "rgba(196,154,90,0.12)", color: "var(--golden)" }
                    : { backgroundColor: "var(--shore)", color: "var(--tideline)" }
                }
              >{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(196,154,90,0.12)" }}>
            <CheckCircle2 size={20} style={{ color: "var(--golden)" }} />
          </div>
          <p className="text-sm" style={{ color: "var(--tideline)" }}>
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
                {collapsedDates.has(group.date) ? <ChevronRight size={16} style={{ color: "var(--tideline)" }} /> : <ChevronDown size={16} style={{ color: "var(--tideline)" }} />}
                <span className="text-sm font-semibold" style={{ color: "var(--coastal)" }}>{group.label}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--shore)", color: "var(--tideline)" }}>{group.tasks.length}</span>
              </button>
              {!collapsedDates.has(group.date) && (
                <div className="space-y-2 ml-6">
                  {group.tasks.map((task, cardIdx) => (
                    <div
                      key={task.id}
                      className={mounted ? "animate-cardReveal" : "opacity-0"}
                      style={{ animationDelay: `${cardIdx * 50}ms` }}
                    >
                      <TaskCard
                        task={task}
                        propMap={propMap}
                        bookingMap={bookingMap}
                        cleanerMap={cleanerMap}
                        cleaners={cleaners}
                        expanded={expandedTasks.has(task.id)}
                        onToggle={() => toggleExpand(task.id)}
                        onUpdateStatus={updateStatus}
                        onAssign={assignCleaner}
                        onNotify={notifyCleaner}
                        updating={updatingTask === task.id}
                        notifying={notifying.has(task.id)}
                        compact
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filteredTasks.length >= 10 && (
            <button
              onClick={() => setUpcomingLimit((v) => v + 14)}
              className="w-full py-3 text-sm font-medium transition-colors"
              style={{ backgroundColor: "var(--shore)", color: "var(--tideline)", borderRadius: 10 }}
            >
              Load more
            </button>
          )}
        </div>
      ) : (
        /* Today / Completed / All — flat list */
        <div className="space-y-3">
          {filteredTasks.map((task, cardIdx) => (
            <div
              key={task.id}
              className={mounted ? "animate-cardReveal" : "opacity-0"}
              style={{ animationDelay: `${cardIdx * 50}ms` }}
            >
              <TaskCard
                task={task}
                propMap={propMap}
                bookingMap={bookingMap}
                cleanerMap={cleanerMap}
                cleaners={cleaners}
                expanded={expandedTasks.has(task.id)}
                onToggle={() => toggleExpand(task.id)}
                onUpdateStatus={updateStatus}
                onAssign={assignCleaner}
                onNotify={notifyCleaner}
                updating={updatingTask === task.id}
                notifying={notifying.has(task.id)}
              />
            </div>
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
        <h1 className="text-[20px] font-bold mb-1" style={{ color: "var(--coastal)" }}>Turnovers</h1>
        <p className="text-[13px]" style={{ color: "var(--tideline)" }}>Cleaning schedules and task management</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Stats pills */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full" style={{ backgroundColor: "rgba(212,150,11,0.1)", color: "var(--amber-tide)", border: "1px solid rgba(212,150,11,0.2)" }}>
          <Clock size={12} /> Today: {stats.today}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full" style={{ backgroundColor: "var(--shore)", color: "var(--tideline)", border: "1px solid var(--dry-sand)" }}>
          This Week: {stats.week}
        </span>
        {stats.unassigned > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)", border: "1px solid rgba(196,64,64,0.2)" }}>
            <AlertTriangle size={12} /> Unassigned: {stats.unassigned}
          </span>
        )}
        <button
          onClick={onShowCleaners}
          className="px-3.5 py-1.5 text-sm font-medium transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--shore)", color: "var(--tideline)", borderRadius: 10, border: "1px solid var(--dry-sand)" }}
        >
          Cleaners ({cleanerCount})
        </button>
        <button
          onClick={onBackfill}
          disabled={backfilling}
          className="inline-flex items-center gap-2 text-xs font-semibold disabled:opacity-50 transition-all duration-150"
          style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10, padding: "9px 16px" }}
          onMouseEnter={(e) => { if (!backfilling) { e.currentTarget.style.backgroundColor = "var(--mangrove)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--coastal)"; e.currentTarget.style.transform = ""; }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${backfilling ? "animate-spin" : ""}`} />
          {backfilling ? "Creating..." : "Auto-Create"}
        </button>
      </div>
    </div>
  );
}

// ====== Task Card ======
function TaskCard({ task, propMap, bookingMap, cleanerMap, cleaners, expanded, onToggle, onUpdateStatus, onAssign, onNotify, updating, notifying, compact }: {
  task: Task;
  propMap: Map<string, { id: string; name: string; cover_photo_url?: string | null }>;
  bookingMap: Map<string, { id: string; guest_name: string | null; check_in: string; check_out: string }>;
  cleanerMap: Map<string, Cleaner>;
  cleaners: Cleaner[];
  expanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (taskId: string, status: string) => Promise<void>;
  onAssign: (taskId: string, cleanerId: string) => Promise<void>;
  onNotify: (taskId: string, cleanerName: string) => Promise<void>;
  updating: boolean;
  notifying: boolean;
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

  const statusBorderStyle: React.CSSProperties = task.status === "issue" ? { borderLeft: "4px solid var(--coral-reef)" }
    : task.status === "in_progress" ? { borderLeft: "4px solid var(--deep-water)" }
    : task.status === "completed" ? { borderLeft: "4px solid var(--lagoon)" }
    : {};

  const handleStatus = (e: React.MouseEvent, newStatus: string) => {
    e.preventDefault();
    e.stopPropagation();
    onUpdateStatus(task.id, newStatus);
  };

  const handleNotify = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (assignedCleaner) {
      // TURN-S1a — replaces the prior alert() placeholder. Real
      // POST /api/turnover/notify → notifyCleanerReminder.
      void onNotify(task.id, assignedCleaner.name);
    }
  };

  return (
    <div
      className="bg-white transition-all duration-200"
      style={{ borderRadius: 14, boxShadow: "var(--shadow-card)", border: "1px solid var(--dry-sand)", ...statusBorderStyle }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-card)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div className="p-4">
        {/* Top row: photo + info (clickable to expand) + desktop actions */}
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Clickable area = photo + info ONLY */}
          <button
            type="button"
            onClick={onToggle}
            className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0 text-left"
          >
            <PropertyAvatar name={propName} photoUrl={prop?.cover_photo_url} size={photoSize} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${compact ? "text-sm" : "text-base"}`} style={{ color: "var(--coastal)" }}>{propName}</p>
              <p className="text-sm" style={{ color: "var(--tideline)" }}>
                {formatShortDate(task.scheduled_date)}
                {task.scheduled_time && ` · ${formatTime(task.scheduled_time)} checkout`}
                {nextBooking && " → 3:00 PM check-in"}
              </p>
              {!compact && (checkoutBooking || nextBooking) && (
                <p className="text-xs mt-1" style={{ color: "var(--tideline)" }}>
                  {checkoutBooking && <span>Checkout: {checkoutBooking.guest_name ?? "Guest"}</span>}
                  {checkoutBooking && nextBooking && <span className="mx-1.5" style={{ color: "var(--shell)" }}>→</span>}
                  {nextBooking && <span>Check-in: {nextBooking.guest_name ?? "Guest"}</span>}
                </p>
              )}
            </div>
          </button>

          {/* Desktop right side: status + cleaner + actions */}
          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            {/* Status badge */}
            {task.status === "completed" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>
                <CheckCircle2 size={12} /> Completed
              </span>
            ) : task.status === "in_progress" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(42,90,138,0.1)", color: "var(--deep-water)" }}>
                <Clock size={12} /> In Progress
              </span>
            ) : task.status === "issue" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>
                <AlertTriangle size={12} /> Issue
              </span>
            ) : null}

            {/* Cleaner pill */}
            {assignedCleaner ? (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>
                {assignedCleaner.name}
              </span>
            ) : (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>
                Unassigned
              </span>
            )}

            {/* Notify cleaner button — only renders when a cleaner is
                actually assigned (Q8 from MSG-S2-PRE → TURN-S1a). */}
            {assignedCleaner && task.status !== "completed" && (
              <button
                type="button"
                onClick={handleNotify}
                disabled={notifying}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: "var(--tideline)" }}
                title={notifying ? "Sending..." : `Notify ${assignedCleaner.name}`}
              >
                <MessageSquare size={14} />
              </button>
            )}

            {/* Action buttons */}
            {task.status !== "completed" && task.status !== "in_progress" && (
              <button
                type="button"
                onClick={(e) => handleStatus(e, "in_progress")}
                disabled={updating}
                className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "rgba(42,90,138,0.1)", color: "var(--deep-water)", borderRadius: 10 }}
              >
                {updating ? "..." : "In Progress"}
              </button>
            )}
            {task.status !== "completed" && (
              <button
                type="button"
                onClick={(e) => handleStatus(e, "completed")}
                disabled={updating}
                className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)", borderRadius: 10 }}
              >
                {updating ? "..." : "Complete"}
              </button>
            )}
          </div>
        </div>

        {/* Mobile bottom row: status + cleaner + actions (NOT inside the expand button) */}
        <div className="flex items-center gap-2 flex-wrap mt-3 sm:hidden">
          {task.status === "completed" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>
              <CheckCircle2 size={11} /> Done
            </span>
          ) : task.status === "in_progress" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(42,90,138,0.1)", color: "var(--deep-water)" }}>
              <Clock size={11} /> In Progress
            </span>
          ) : task.status === "issue" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>
              <AlertTriangle size={11} /> Issue
            </span>
          ) : null}

          {assignedCleaner ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>{assignedCleaner.name}</span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>Unassigned</span>
          )}

          {task.status !== "completed" && task.status !== "in_progress" && (
            <button
              type="button"
              onClick={(e) => handleStatus(e, "in_progress")}
              disabled={updating}
              className="px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: "rgba(42,90,138,0.1)", color: "var(--deep-water)", borderRadius: 10 }}
            >
              {updating ? "..." : "In Progress"}
            </button>
          )}
          {task.status !== "completed" && (
            <button
              type="button"
              onClick={(e) => handleStatus(e, "completed")}
              disabled={updating}
              className="px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)", borderRadius: 10 }}
            >
              {updating ? "..." : "Complete"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 py-4 space-y-4" style={{ borderTop: "1px solid var(--dry-sand)" }}>
          {/* Assign cleaner */}
          {cleaners.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tideline)" }}>Assign Cleaner</label>
              <div className="flex items-center gap-2">
                <select
                  value={task.cleaner_id ?? ""}
                  onChange={(e) => { if (e.target.value) onAssign(task.id, e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full sm:w-64 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-golden/30"
                  style={{ border: "1px solid var(--dry-sand)", borderRadius: 10 }}
                >
                  <option value="">Select cleaner...</option>
                  {cleaners.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
                {assignedCleaner && task.status !== "completed" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void onNotify(task.id, assignedCleaner.name); }}
                    disabled={notifying}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)", borderRadius: 10 }}
                  >
                    <MessageSquare size={12} /> {notifying ? "Sending..." : "Notify"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Checklist */}
          {totalCount > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--tideline)" }}>Checklist ({doneCount}/{totalCount})</p>
              <div className="space-y-1.5">
                {task.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border flex items-center justify-center" style={item.done ? { backgroundColor: "var(--coastal)", borderColor: "var(--coastal)" } : { borderColor: "var(--shell)" }}>
                      {item.done && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm ${item.done ? "line-through" : ""}`} style={{ color: item.done ? "var(--shell)" : "var(--coastal)" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {task.notes && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--tideline)" }}>Notes</p>
              <p className="text-sm" style={{ color: "var(--coastal)" }}>{task.notes}</p>
            </div>
          )}

          {/* Guest details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs" style={{ color: "var(--tideline)" }}>Checkout Guest</p>
              <p className="text-sm font-medium" style={{ color: "var(--coastal)" }}>
                {checkoutBooking?.guest_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--tideline)" }}>Next Guest</p>
              <p className="text-sm font-medium" style={{ color: "var(--coastal)" }}>
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
                  className="px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "rgba(42,90,138,0.1)", color: "var(--deep-water)", borderRadius: 10 }}
                >
                  Mark In Progress
                </button>
              )}
              <button
                onClick={() => onUpdateStatus(task.id, "completed")}
                disabled={updating}
                className="px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
              >
                Mark Complete
              </button>
              {task.status !== "issue" && (
                <button
                  onClick={() => onUpdateStatus(task.id, "issue")}
                  disabled={updating}
                  className="px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)", borderRadius: 10 }}
                >
                  Report Issue
                </button>
              )}
            </div>
          )}

          {task.completed_at && (
            <p className="text-xs" style={{ color: "var(--tideline)" }}>
              Completed {new Date(task.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
