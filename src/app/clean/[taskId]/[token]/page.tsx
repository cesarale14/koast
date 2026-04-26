"use client";

import { useState, useEffect } from "react";

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface TaskData {
  task: {
    id: string;
    status: string;
    scheduled_date: string;
    scheduled_time: string;
    checklist: ChecklistItem[];
    notes: string | null;
  };
  property: { name: string; address: string; city: string; state: string; zip: string };
  checkoutGuest: { guest_name: string; check_out: string } | null;
  nextGuest: { guest_name: string; check_in: string } | null;
}

export default function CleanerMobilePage({
  params,
}: {
  params: { taskId: string; token: string };
}) {
  const [data, setData] = useState<TaskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [issueText, setIssueText] = useState("");
  const [showIssue, setShowIssue] = useState(false);

  useEffect(() => {
    fetch(`/api/clean/${params.taskId}/${params.token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); } else {
          setData(d);
          setChecklist(d.task.checklist ?? []);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load task"); setLoading(false); });
  }, [params.taskId, params.token]);

  // TURN-S1a — surface server errors. Was fire-and-forget; the cleaner
  // would see a checkbox tick even if the DB write 500'd. Now the
  // optimistic state reverts and an inline banner explains the failure.
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateTask = async (updates: Record<string, unknown>, prevChecklist?: ChecklistItem[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/clean/${params.taskId}/${params.token}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const respData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(respData?.error ?? `HTTP ${res.status}`);
      }
      if (updates.status && data) {
        setData({ ...data, task: { ...data.task, status: updates.status as string } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setSaveError(msg);
      // Revert optimistic checklist if the caller provided the prior state.
      if (prevChecklist) setChecklist(prevChecklist);
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (id: string) => {
    const prev = checklist;
    const updated = checklist.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item
    );
    setChecklist(updated);
    void updateTask({ checklist: updated }, prev);
  };

  const doneCount = checklist.filter((i) => i.done).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-600 mb-2">Access Denied</p>
          <p className="text-sm text-neutral-500">{error ?? "Invalid link"}</p>
        </div>
      </div>
    );
  }

  const { task, property, checkoutGuest, nextGuest } = data;
  const address = [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-brand-500 text-white px-4 py-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-white/60" />
          <p className="text-xs font-medium opacity-80">CLEANING TASK</p>
        </div>
        <h1 className="text-xl font-bold mt-1">{property.name}</h1>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm opacity-90 underline mt-1 block">
          {address} →
        </a>
        <div className="flex items-center gap-3 mt-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            task.status === "completed" ? "bg-green-500" :
            task.status === "in_progress" ? "bg-yellow-400 text-yellow-900" :
            task.status === "issue" ? "bg-red-500" :
            "bg-white/20"
          }`}>
            {task.status.replace("_", " ").toUpperCase()}
          </span>
          <span className="text-sm opacity-80">
            {new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            })}
            {task.scheduled_time ? ` at ${task.scheduled_time.slice(0, 5)}` : ""}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Time window */}
        <div className="bg-neutral-0 rounded-lg p-4 shadow-sm border border-[var(--border)]">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-400">Checkout Guest</p>
              <p className="text-sm font-medium text-neutral-900">{checkoutGuest?.guest_name ?? "---"}</p>
              <p className="text-xs text-neutral-400">out by 11:00 AM</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Next Guest</p>
              <p className="text-sm font-medium text-neutral-900">{nextGuest?.guest_name ?? "None"}</p>
              {nextGuest && <p className="text-xs text-neutral-400">in at 3:00 PM</p>}
            </div>
          </div>
          {nextGuest && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                <span>11:00 AM</span>
                <span>3:00 PM</span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-400 rounded-full" style={{ width: "100%" }} />
              </div>
              <p className="text-xs text-neutral-500 mt-1 text-center">4-hour cleaning window</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {task.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-xs font-medium text-amber-700 mb-1">SPECIAL INSTRUCTIONS</p>
            <p className="text-sm text-amber-900">{task.notes}</p>
          </div>
        )}

        {/* Checklist */}
        <div className="bg-neutral-0 rounded-lg p-4 shadow-sm border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">Checklist</h2>
            <span className="text-xs text-neutral-400">{doneCount}/{checklist.length}</span>
          </div>
          <div className="space-y-1">
            {checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-3 py-3 px-2 border-b border-neutral-50 last:border-0 cursor-pointer rounded-md hover:bg-neutral-50 transition-colors">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleItem(item.id)}
                  className="w-6 h-6 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
                />
                <span className={`text-sm ${item.done ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${checklist.length > 0 ? (doneCount / checklist.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* TURN-S1a — server error banner. Surfaces failed updateTask
            calls (previously fire-and-forget; cleaner saw fake success). */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <span className="text-red-600 text-sm font-medium flex-shrink-0">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700">Couldn&apos;t save</p>
              <p className="text-xs text-red-600 mt-0.5 break-words">{saveError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="text-red-600 text-xs font-medium flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {task.status === "pending" && (
            <button
              onClick={() => updateTask({ status: "in_progress" })}
              disabled={saving}
              className="w-full py-4 bg-brand-500 text-white text-base font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Starting..." : "Start Cleaning"}
            </button>
          )}

          {task.status === "in_progress" && (
            <button
              onClick={() => updateTask({ status: "completed", checklist })}
              disabled={saving}
              className="w-full py-4 bg-brand-500 text-white text-base font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Completing..." : `Mark Complete (${doneCount}/${checklist.length})`}
            </button>
          )}

          {task.status === "completed" && (
            <div className="text-center py-6">
              <svg className="w-12 h-12 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-lg font-semibold text-neutral-900">Cleaning Complete!</p>
              <p className="text-sm text-neutral-500">Thank you</p>
            </div>
          )}

          {task.status !== "completed" && task.status !== "issue" && (
            <>
              {!showIssue ? (
                <button
                  onClick={() => setShowIssue(true)}
                  className="w-full py-3 bg-neutral-0 text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50"
                >
                  Report Issue
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <textarea
                    value={issueText}
                    onChange={(e) => setIssueText(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full p-2 text-sm border border-red-200 rounded-lg resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => updateTask({ status: "issue", notes: issueText, issueDescription: issueText })}
                      disabled={saving || !issueText.trim()}
                      className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                    >
                      Submit Issue
                    </button>
                    <button
                      onClick={() => setShowIssue(false)}
                      className="px-4 py-2 text-sm text-neutral-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
