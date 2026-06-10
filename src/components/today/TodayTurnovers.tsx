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
 * P2.2: each row renders through the shared <TurnoverBlock> — the SAME
 * component the agent's chat answers + P2.3 ProposalCards render. The strip
 * owns the interaction state (busy/optimistic/poll/toast + the /api/turnover/*
 * calls) and passes per-row data + actions to the block.
 *
 * S5 reflection: while any turnover is active (assigned/in_progress) the strip
 * polls (router.refresh, 45s) so a cleaner marking in-progress/complete from
 * their phone surfaces on the host's home without a manual reload.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { CleaningTaskStatus } from "@/lib/db/schema";
import { TurnoverBlock } from "@/components/chat/blocks/TurnoverBlock";

type Turnover = {
  taskId: string;
  property: string;
  date: string;
  status: CleaningTaskStatus;
  cleanerName: string | null;
  photoCount: number;
};
type Cleaner = { id: string; name: string };

interface PushSummary {
  configured?: boolean;
  sent?: number;
}

const POLL_MS = 45_000;

function reachLabel(push: PushSummary | null | undefined): string {
  if (!push || !push.configured) return "";
  const sent = push.sent ?? 0;
  if (sent > 0) return ` · pushed to ${sent} device${sent > 1 ? "s" : ""}`;
  return " · no devices subscribed yet";
}

export function TodayTurnovers({ turnovers, cleaners }: { turnovers: Turnover[]; cleaners: Cleaner[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  // Optimistic assign overlay: taskId → cleaner name (renders as "dispatched"
  // immediately; the next refresh reconciles from the server).
  const [assignedNow, setAssignedNow] = useState<Record<string, string>>({});
  // S3b host photo viewing: taskId → { loading, signed urls } (undefined = hidden).
  const [photoState, setPhotoState] = useState<
    Record<string, { loading: boolean; urls: string[] } | undefined>
  >({});

  // S5 reflection poll — only while something is actually in flight.
  useEffect(() => {
    const active = turnovers.some((t) => t.status === "assigned" || t.status === "in_progress");
    if (!active) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [turnovers, router]);

  if (turnovers.length === 0) return null;

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

  async function togglePhotos(taskId: string) {
    const cur = photoState[taskId];
    if (cur && !cur.loading) {
      setPhotoState((s) => ({ ...s, [taskId]: undefined }));
      return;
    }
    setPhotoState((s) => ({ ...s, [taskId]: { loading: true, urls: [] } }));
    try {
      const res = await fetch(`/api/turnover/photos/${taskId}`);
      const d = await res.json().catch(() => ({}));
      const urls = Array.isArray(d?.photos)
        ? (d.photos as { url: string }[]).map((p) => p.url).filter(Boolean)
        : [];
      setPhotoState((s) => ({ ...s, [taskId]: { loading: false, urls } }));
    } catch {
      setPhotoState((s) => ({ ...s, [taskId]: { loading: false, urls: [] } }));
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
          const isBusy = busy[task.taskId];
          const selected = picked[task.taskId] ?? cleaners[0]?.id ?? "";
          const ps = photoState[task.taskId];

          return (
            <li key={task.taskId}>
              <TurnoverBlock
                data={{
                  property: task.property,
                  date: task.date,
                  status: effectiveStatus,
                  cleanerName: cleaner,
                  photoCount: task.photoCount,
                }}
                actions={{
                  cleaners,
                  selectedCleanerId: selected,
                  onSelectCleaner: (id) => setPicked((p) => ({ ...p, [task.taskId]: id })),
                  onAssign: () => assign(task),
                  assigning: isBusy,
                  photos: {
                    open: ps !== undefined,
                    loading: ps?.loading ?? false,
                    urls: ps?.urls ?? [],
                    onToggle: () => togglePhotos(task.taskId),
                  },
                }}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
