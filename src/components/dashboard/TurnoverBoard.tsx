"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

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

interface TurnoverBoardProps {
  tasks: Task[];
  properties: { id: string; name: string }[];
  bookings: { id: string; guest_name: string | null; check_in: string; check_out: string }[];
}

const COLUMNS = [
  { key: "pending", label: "Upcoming", color: "border-gray-300" },
  { key: "today", label: "Today", color: "border-amber-400" },
  { key: "in_progress", label: "In Progress", color: "border-blue-400" },
  { key: "completed", label: "Completed", color: "border-emerald-400" },
  { key: "issue", label: "Issues", color: "border-red-400" },
];

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  assigned: "bg-blue-50 text-blue-600",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  issue: "bg-red-50 text-red-700",
};

export default function TurnoverBoard({ tasks: initialTasks, properties, bookings }: TurnoverBoardProps) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);
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
    } catch {
      toast("Failed to update", "error");
    }
  }, [tasks, toast]);

  const backfill = useCallback(async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/turnover/auto-create", { method: "POST" });
      const data = await res.json();
      toast(`Created ${data.created} tasks, ${data.skipped} skipped`);
      window.location.reload();
    } catch {
      toast("Backfill failed", "error");
    }
    setBackfilling(false);
  }, [toast]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Turnover Ops</h1>
          <p className="text-gray-500">Cleaning schedules and task management</p>
        </div>
        <button
          onClick={backfill}
          disabled={backfilling}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {backfilling ? "Creating..." : "Auto-Create Tasks"}
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = groupedTasks[col.key] ?? [];
          return (
            <div key={col.key} className="flex-shrink-0 w-64">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-t-2 ${col.color} bg-gray-50`}>
                <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{colTasks.length}</span>
              </div>

              {/* Task cards */}
              <div className="bg-gray-50/50 rounded-b-lg p-2 space-y-2 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">No tasks</p>
                ) : (
                  colTasks.map((task) => {
                    const propName = propMap.get(task.property_id) ?? "Property";
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
                        className={`bg-white rounded-lg p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${
                          isUrgent ? "border-red-300" : "border-gray-100"
                        } ${selectedTask === task.id ? "ring-2 ring-blue-400" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{propName}</p>
                          {isUrgent && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded">URGENT</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {task.scheduled_time ? ` at ${task.scheduled_time.slice(0, 5)}` : ""}
                        </p>
                        {checkoutBooking && (
                          <p className="text-xs text-gray-500 mt-1">
                            Out: {checkoutBooking.guest_name ?? "Guest"}
                          </p>
                        )}
                        {nextBooking && (
                          <p className="text-xs text-blue-500 mt-0.5">
                            In: {nextBooking.guest_name ?? "Guest"} ({nextBooking.check_in})
                          </p>
                        )}
                        {/* Checklist progress */}
                        {totalCount > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                              <span>{doneCount}/{totalCount}</span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 rounded-full"
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
          <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 overflow-y-auto animate-slide-in">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Task Details</h2>
              <button onClick={() => setSelectedTask(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs text-gray-400">Property</p>
                <p className="text-lg font-semibold text-gray-900">{propMap.get(selectedTaskData.property_id) ?? "Property"}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[selectedTaskData.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {selectedTaskData.status.replace("_", " ")}
                </span>
                <span className="text-sm text-gray-500">
                  {new Date(selectedTaskData.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>

              {/* Guest info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Checkout Guest</p>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedTaskData.booking_id ? (bookingMap.get(selectedTaskData.booking_id)?.guest_name ?? "—") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Next Guest</p>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedTaskData.next_booking_id ? (bookingMap.get(selectedTaskData.next_booking_id)?.guest_name ?? "—") : "None"}
                  </p>
                </div>
              </div>

              {/* Checklist */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Checklist</h3>
                <div className="space-y-1">
                  {(selectedTaskData.checklist ?? []).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-1">
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

              {selectedTaskData.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">Notes</h3>
                  <p className="text-sm text-gray-600">{selectedTaskData.notes}</p>
                </div>
              )}

              {/* Cleaner mobile link */}
              {selectedTaskData.cleaner_token && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Cleaner Mobile Link</p>
                  <p className="text-xs text-blue-600 break-all font-mono">
                    /clean/{selectedTaskData.id}/{selectedTaskData.cleaner_token}
                  </p>
                </div>
              )}

              {/* Status actions */}
              <div className="space-y-2 pt-2">
                {selectedTaskData.status === "pending" && (
                  <button
                    onClick={() => updateStatus(selectedTaskData.id, "in_progress")}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    Mark In Progress
                  </button>
                )}
                {selectedTaskData.status === "in_progress" && (
                  <button
                    onClick={() => updateStatus(selectedTaskData.id, "completed")}
                    className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
                  >
                    Mark Complete
                  </button>
                )}
                {selectedTaskData.status !== "issue" && selectedTaskData.status !== "completed" && (
                  <button
                    onClick={() => updateStatus(selectedTaskData.id, "issue")}
                    className="w-full py-2.5 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50"
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
