"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import PropertyAvatar from "@/components/ui/PropertyAvatar";
import { RefreshCw, Copy, ExternalLink, Sparkles } from "lucide-react";

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

const COLUMNS = [
  { key: "pending", label: "Upcoming", color: "border-neutral-300" },
  { key: "today", label: "Today", color: "border-warning" },
  { key: "in_progress", label: "In Progress", color: "border-info" },
  { key: "completed", label: "Completed", color: "border-success" },
  { key: "issue", label: "Issues", color: "border-danger" },
];

const statusColors: Record<string, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  assigned: "bg-info-light text-info",
  in_progress: "bg-info-light text-info",
  completed: "bg-success-light text-success",
  issue: "bg-danger-light text-danger",
};

export default function TurnoverBoard({ tasks: initialTasks, properties, bookings, cleaners: initialCleaners = [] }: TurnoverBoardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [cleaners, setCleaners] = useState(initialCleaners);
  const [showCleaners, setShowCleaners] = useState(false);
  const [newCleanerName, setNewCleanerName] = useState("");
  const [newCleanerPhone, setNewCleanerPhone] = useState("");
  const [addingCleaner, setAddingCleaner] = useState(false);

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const cleanerMap = useMemo(() => new Map(cleaners.map((c) => [c.id, c])), [cleaners]);
  const bookingMap = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const today = new Date().toISOString().split("T")[0];

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {
      pending: [], today: [], in_progress: [], completed: [], issue: [],
    };
    for (const t of tasks) {
      if (t.status === "completed") groups.completed.push(t);
      else if (t.status === "issue") groups.issue.push(t);
      else if (t.status === "in_progress") groups.in_progress.push(t);
      else if (t.scheduled_date === today) groups.today.push(t);
      else groups.pending.push(t);
    }
    return groups;
  }, [tasks, today]);

  const selectedTaskData = useMemo(
    () => tasks.find((t) => t.id === selectedTask) ?? null,
    [tasks, selectedTask]
  );

  const updateStatus = useCallback(async (taskId: string, newStatus: string) => {
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (!task?.cleaner_token) return;
      await fetch(`/api/clean/${taskId}/${task.cleaner_token}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) => prev.map((t) =>
        t.id === taskId ? { ...t, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : t.completed_at } : t
      ));
      toast(`Task updated to ${newStatus}`);
      router.refresh();
    } catch {
      toast("Failed to update", "error");
    }
  }, [tasks, toast, router]);

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

  const removeCleaner = useCallback(async (id: string) => {
    try {
      await fetch(`/api/cleaners?id=${id}`, { method: "DELETE" });
      setCleaners((prev) => prev.filter((c) => c.id !== id));
      toast("Cleaner removed");
    } catch { toast("Failed", "error"); }
  }, [toast]);

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
      toast(`Assigned to ${data.cleanerName} — SMS sent`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to assign", "error");
    }
  }, [toast]);

  const copyCleanerLink = useCallback(async (taskId: string, token: string) => {
    const url = `${window.location.origin}/clean/${taskId}/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Cleaner link copied to clipboard");
    } catch {
      toast("Failed to copy link", "error");
    }
  }, [toast]);

  const openCleanerLink = useCallback((taskId: string, token: string) => {
    const url = `${window.location.origin}/clean/${taskId}/${token}`;
    window.open(url, "_blank");
  }, []);

  // Empty state: all columns empty
  if (tasks.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-800 mb-1">Cleaning</h1>
            <p className="text-sm text-neutral-500">Cleaning schedules and task management</p>
          </div>
        </div>

        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-sm">
            <div className="mx-auto w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-neutral-400" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-800 mb-2">No upcoming turnovers</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Cleaning tasks are automatically created when new bookings sync from your calendar.
            </p>
            <button
              onClick={backfill}
              disabled={backfilling}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Cleaning</h1>
          <p className="text-neutral-500">Cleaning schedules and task management</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCleaners(!showCleaners)}
            className="px-4 py-2 bg-neutral-0 text-neutral-700 text-sm font-medium rounded-lg border border-[var(--border)] hover:bg-neutral-50 transition-colors"
          >
            Cleaners ({cleaners.length})
          </button>
          <button
            onClick={backfill}
            disabled={backfilling}
            className="btn-primary-3d inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${backfilling ? "animate-spin" : ""}`} />
            {backfilling ? "Creating..." : "Auto-Create Tasks"}
          </button>
        </div>
      </div>

      {/* Cleaners management panel */}
      {showCleaners && (
        <div className="mb-6 bg-neutral-0 rounded-lg border border-[var(--border)] p-4">
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">Manage Cleaners</h3>
          <div className="space-y-2 mb-4">
            {cleaners.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{c.name}</p>
                  <p className="text-xs text-neutral-400">{c.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => testSMS(c.phone)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Test SMS</button>
                  <button onClick={() => removeCleaner(c.id)} className="text-xs text-danger hover:text-danger/80 font-medium">Remove</button>
                </div>
              </div>
            ))}
            {cleaners.length === 0 && <p className="text-sm text-neutral-400">No cleaners added yet.</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newCleanerName} onChange={(e) => setNewCleanerName(e.target.value)} placeholder="Name" className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg" />
            <input type="text" value={newCleanerPhone} onChange={(e) => setNewCleanerPhone(e.target.value)} placeholder="+1234567890" className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg" />
            <button onClick={addCleaner} disabled={addingCleaner || !newCleanerName || !newCleanerPhone}
              className="btn-primary-3d px-4 py-1.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {addingCleaner ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = groupedTasks[col.key] ?? [];
          return (
            <div key={col.key} className="flex-shrink-0 w-64">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-t-2 ${col.color} bg-neutral-50`}>
                <span className="text-sm uppercase tracking-wider text-neutral-400">{col.label}</span>
                <span className="text-xs text-neutral-400 bg-neutral-0 px-2 py-0.5 rounded-full">{colTasks.length}</span>
              </div>

              {/* Task cards */}
              <div className="bg-neutral-50/50 rounded-b-lg p-2 space-y-2 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-8">No tasks</p>
                ) : (
                  colTasks.map((task) => {
                    const prop = propMap.get(task.property_id);
                    const propName = prop?.name ?? "Property";
                    const checkoutBooking = task.booking_id ? bookingMap.get(task.booking_id) : null;
                    const nextBooking = task.next_booking_id ? bookingMap.get(task.next_booking_id) : null;
                    const doneCount = (task.checklist ?? []).filter((i) => i.done).length;
                    const totalCount = (task.checklist ?? []).length;

                    // Urgency: less than 2 hours until next guest
                    const isUrgent = nextBooking && task.scheduled_date === today;

                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task.id)}
                        className={`bg-neutral-0 rounded-lg p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${
                          isUrgent ? "border-danger/40" : "border-[var(--border)]"
                        } ${selectedTask === task.id ? "ring-2 ring-brand-400" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <PropertyAvatar name={propName} photoUrl={prop?.cover_photo_url} size={32} />
                            <p className="text-sm font-medium text-neutral-900 truncate">{propName}</p>
                          </div>
                          {isUrgent && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-danger-light text-danger rounded">URGENT</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400">
                          {new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {task.scheduled_time ? ` at ${task.scheduled_time.slice(0, 5)}` : ""}
                        </p>
                        {checkoutBooking && (
                          <p className="text-xs text-neutral-500 mt-1">
                            Out: {checkoutBooking.guest_name ?? "Guest"}
                          </p>
                        )}
                        {nextBooking && (
                          <p className="text-xs text-brand-500 mt-0.5">
                            In: {nextBooking.guest_name ?? "Guest"} ({nextBooking.check_in})
                          </p>
                        )}
                        {task.cleaner_id && cleanerMap.get(task.cleaner_id) && (
                          <p className="text-xs text-info mt-0.5">Cleaner: {cleanerMap.get(task.cleaner_id)!.name}</p>
                        )}
                        {/* Checklist progress */}
                        {totalCount > 0 && doneCount > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-0.5">
                              <span className="font-mono">{doneCount}/{totalCount}</span>
                            </div>
                            <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-500 rounded-full"
                                style={{ width: `${(doneCount / totalCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task detail side panel */}
      {selectedTaskData && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedTask(null)} />
          <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-neutral-0 shadow-xl z-50 overflow-y-auto animate-slide-in">
            <div className="sticky top-0 bg-neutral-0 border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-800">Task Details</h2>
              <button onClick={() => setSelectedTask(null)} className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs text-neutral-400">Property</p>
                <p className="text-lg font-semibold text-neutral-800">{propMap.get(selectedTaskData.property_id)?.name ?? "Property"}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[selectedTaskData.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                  {selectedTaskData.status.replace("_", " ")}
                </span>
                <span className="text-sm text-neutral-500">
                  {new Date(selectedTaskData.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>

              {/* Guest info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-neutral-400">Checkout Guest</p>
                  <p className="text-sm font-medium text-neutral-900">
                    {selectedTaskData.booking_id ? (bookingMap.get(selectedTaskData.booking_id)?.guest_name ?? "—") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400">Next Guest</p>
                  <p className="text-sm font-medium text-neutral-900">
                    {selectedTaskData.next_booking_id ? (bookingMap.get(selectedTaskData.next_booking_id)?.guest_name ?? "—") : "None"}
                  </p>
                </div>
              </div>

              {/* Checklist */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 mb-2">Checklist</h3>
                <div className="space-y-1">
                  {(selectedTaskData.checklist ?? []).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${item.done ? "bg-success border-success" : "border-neutral-300"}`}>
                        {item.done && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${item.done ? "text-neutral-400 line-through" : "text-neutral-700"}`}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTaskData.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-1">Notes</h3>
                  <p className="text-sm text-neutral-600">{selectedTaskData.notes}</p>
                </div>
              )}

              {/* Cleaner action buttons */}
              {selectedTaskData.cleaner_token && (
                <div className="space-y-2">
                  <p className="text-xs text-neutral-400">Cleaner Mobile Page</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyCleanerLink(selectedTaskData.id, selectedTaskData.cleaner_token!)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2 bg-neutral-100 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Cleaner Link
                    </button>
                    <button
                      onClick={() => openCleanerLink(selectedTaskData.id, selectedTaskData.cleaner_token!)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2 bg-neutral-100 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Checklist
                    </button>
                  </div>
                </div>
              )}

              {/* Assign cleaner */}
              {cleaners.length > 0 && (
                <div>
                  <p className="text-xs text-neutral-400 mb-1">Assign Cleaner</p>
                  <select
                    value={selectedTaskData.cleaner_id ?? ""}
                    onChange={(e) => { if (e.target.value) assignCleaner(selectedTaskData.id, e.target.value); }}
                    className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0"
                  >
                    <option value="">Select cleaner...</option>
                    {cleaners.filter((c) => c.is_active).map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                  </select>
                  {selectedTaskData.cleaner_id && cleanerMap.get(selectedTaskData.cleaner_id) && (
                    <p className="text-xs text-brand-500 mt-1">Assigned: {cleanerMap.get(selectedTaskData.cleaner_id)!.name}</p>
                  )}
                </div>
              )}

              {/* Status actions */}
              <div className="space-y-2 pt-2">
                {selectedTaskData.status === "pending" && (
                  <button
                    onClick={() => updateStatus(selectedTaskData.id, "in_progress")}
                    className="w-full py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600"
                  >
                    Mark In Progress
                  </button>
                )}
                {selectedTaskData.status === "in_progress" && (
                  <button
                    onClick={() => updateStatus(selectedTaskData.id, "completed")}
                    className="w-full py-2.5 bg-success text-white text-sm font-medium rounded-lg hover:bg-success/90"
                  >
                    Mark Complete
                  </button>
                )}
                {selectedTaskData.status !== "issue" && selectedTaskData.status !== "completed" && (
                  <button
                    onClick={() => updateStatus(selectedTaskData.id, "issue")}
                    className="w-full py-2.5 bg-neutral-0 text-danger text-sm font-medium rounded-lg border border-danger/20 hover:bg-danger-light"
                  >
                    Report Issue
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
