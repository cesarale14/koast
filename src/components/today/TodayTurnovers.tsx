"use client";

/**
 * TodayTurnovers — the Today home's turnover strip. Unifies S4 (assign+dispatch
 * on an uncovered turnover) and S5 (the card walking needs-cleaner → dispatched
 * → in-progress → done as the cleaner acts).
 *
 * - pending  → coral dot + a one-tap Assign (or a picker when >1 cleaner).
 *              "Assign" IS "Assign+Dispatch": /api/turnover/assign sets the
 *              cleaner AND fires the web-push; the toast reports push reach.
 * - assigned → amber dot, "Dispatched to {cleaner}".
 * - in_progress → lume dot, "{cleaner} is cleaning".
 * - completed → lagoon dot, "Done · {cleaner}".
 *
 * S5 reflection: while any turnover is active (assigned/in_progress) the strip
 * polls (router.refresh, 45s) so a cleaner marking in-progress/complete from
 * their phone surfaces on the host's home without a manual reload. The persistent
 * host notification center (the bell) is P2.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { CleaningTaskStatus } from "@/lib/db/schema";

type Turnover = {
  taskId: string;
  property: string;
  date: string;
  status: CleaningTaskStatus;
  cleanerName: string | null;
};
type Cleaner = { id: string; name: string };

interface PushSummary {
  configured?: boolean;
  sent?: number;
}

const POLL_MS = 45_000;

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

const STATUS_DOT: Partial<Record<CleaningTaskStatus, string>> = {
  assigned: "var(--amber-tide)",
  in_progress: "var(--lume)",
  completed: "var(--lagoon)",
  issue: "var(--coral-reef)",
};

function statusLabel(status: CleaningTaskStatus, cleaner: string | null): string {
  const who = cleaner ?? "Cleaner";
  switch (status) {
    case "assigned":
      return cleaner ? `Dispatched to ${who}` : "Dispatched";
    case "in_progress":
      return `${who} is cleaning`;
    case "completed":
      return cleaner ? `Done · ${who}` : "Done";
    case "issue":
      return "Issue reported";
    default:
      return "";
  }
}

export function TodayTurnovers({ turnovers, cleaners }: { turnovers: Turnover[]; cleaners: Cleaner[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  // Optimistic assign overlay: taskId → cleaner name (renders as "dispatched"
  // immediately; the next refresh reconciles from the server).
  const [assignedNow, setAssignedNow] = useState<Record<string, string>>({});

  // S5 reflection poll — only while something is actually in flight.
  useEffect(() => {
    const active = turnovers.some((t) => t.status === "assigned" || t.status === "in_progress");
    if (!active) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [turnovers, router]);

  if (turnovers.length === 0) return null;

  const noCleaners = cleaners.length === 0;

  async function assign(task: Turnover) {
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
      setAssignedNow((a) => ({ ...a, [task.taskId]: name }));
      router.refresh();
    } catch {
      toast("Assign failed - network error.", "error");
    } finally {
      setBusy((b) => ({ ...b, [task.taskId]: false }));
    }
  }

  return (
    <section style={{ marginTop: 40 }} data-testid="today-turnovers">
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
        Turnovers
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {turnovers.map((task) => {
          const optimisticCleaner = assignedNow[task.taskId];
          const effectiveStatus: CleaningTaskStatus = optimisticCleaner ? "assigned" : task.status;
          const cleaner = optimisticCleaner ?? task.cleanerName;
          const isPending = effectiveStatus === "pending";
          const isBusy = busy[task.taskId];
          const selected = picked[task.taskId] ?? cleaners[0]?.id ?? "";
          const dot = isPending ? "var(--coral-reef)" : STATUS_DOT[effectiveStatus] ?? "var(--tideline)";

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
                opacity: effectiveStatus === "completed" ? 0.7 : 1,
              }}
            >
              <span
                aria-hidden
                style={{ width: 9, height: 9, borderRadius: 99, background: dot, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 15 }}>{task.property}</div>
                <div style={{ color: "var(--tideline)", fontSize: 13 }}>
                  {fmtDate(task.date)}
                  {!isPending ? ` · ${statusLabel(effectiveStatus, cleaner)}` : ""}
                </div>
              </div>

              {isPending && cleaners.length > 1 && (
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

              {isPending && (
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
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
