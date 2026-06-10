"use client";

/**
 * TodayNeedsCleaner — S4 (v1 program): the inline assign+dispatch action strip
 * on the Today home. Each uncovered turnover renders with a one-tap Assign
 * (or a cleaner picker when the host has more than one active cleaner).
 *
 * "Assign" IS "Assign + Dispatch": POST /api/turnover/assign already sets the
 * cleaner + fires the web-push to their installed devices, so there's a single
 * action and the toast reports the push reach honestly (the board's pattern).
 * On success the card is optimistically removed and the home re-syncs.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Task = { taskId: string; property: string; date: string };
type Cleaner = { id: string; name: string };

interface PushSummary {
  configured?: boolean;
  sent?: number;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function reachLabel(push: PushSummary | null | undefined): string {
  if (!push || !push.configured) return "";
  const sent = push.sent ?? 0;
  if (sent > 0) return ` · pushed to ${sent} device${sent > 1 ? "s" : ""}`;
  return " · no devices subscribed yet";
}

export function TodayNeedsCleaner({ tasks, cleaners }: { tasks: Task[]; cleaners: Cleaner[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});

  const visible = tasks.filter((t) => !done[t.taskId]);
  if (visible.length === 0) return null;

  async function assign(task: Task) {
    const cleanerId = picked[task.taskId] ?? cleaners[0]?.id;
    if (!cleanerId) {
      toast("Add a cleaner first (Turnovers - add cleaner).", "error");
      return;
    }
    setBusy((b) => ({ ...b, [task.taskId]: true }));
    try {
      const res = await fetch("/api/turnover/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.taskId, cleanerId }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = (body as { error?: string })?.error;
        toast(msg ? `Assign failed: ${msg}` : "Assign failed.", "error");
        setBusy((b) => ({ ...b, [task.taskId]: false }));
        return;
      }
      const name =
        (body as { cleanerName?: string })?.cleanerName ??
        cleaners.find((c) => c.id === cleanerId)?.name ??
        "cleaner";
      toast(`Assigned to ${name}${reachLabel((body as { push?: PushSummary })?.push)}`, "success");
      setDone((d) => ({ ...d, [task.taskId]: true }));
      router.refresh();
    } catch {
      toast("Assign failed - network error.", "error");
      setBusy((b) => ({ ...b, [task.taskId]: false }));
    }
  }

  const noCleaners = cleaners.length === 0;

  return (
    <section style={{ marginTop: 40 }} data-testid="today-needs-cleaner">
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--koast-trench)",
          marginBottom: 12,
        }}
      >
        Turnovers needing a cleaner
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((task) => {
          const isBusy = busy[task.taskId];
          const selected = picked[task.taskId] ?? cleaners[0]?.id ?? "";
          return (
            <li
              key={task.taskId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 12,
                background: "var(--shore-soft)",
                border: "1px solid var(--hairline)",
              }}
            >
              <span
                aria-hidden
                style={{ width: 9, height: 9, borderRadius: 99, background: "var(--coral-reef)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 15 }}>{task.property}</div>
                <div style={{ color: "var(--tideline)", fontSize: 13 }}>{fmtDate(task.date)}</div>
              </div>
              {cleaners.length > 1 && (
                <select
                  aria-label="Choose cleaner"
                  value={selected}
                  onChange={(e) => setPicked((p) => ({ ...p, [task.taskId]: e.target.value }))}
                  disabled={isBusy}
                  style={{
                    fontSize: 13,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid var(--hairline)",
                    background: "white",
                    color: "var(--deep-sea)",
                  }}
                >
                  {cleaners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => assign(task)}
                disabled={isBusy || noCleaners}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  whiteSpace: "nowrap",
                  cursor: isBusy || noCleaners ? "default" : "pointer",
                  background: noCleaners ? "var(--shell)" : "var(--coastal)",
                  color: noCleaners ? "var(--tideline)" : "white",
                  opacity: isBusy ? 0.7 : 1,
                }}
              >
                {isBusy
                  ? "Assigning..."
                  : noCleaners
                    ? "No cleaners"
                    : cleaners.length === 1
                      ? `Assign ${cleaners[0].name.split(/\s+/)[0]}`
                      : "Assign"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
