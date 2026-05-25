import { useState } from "react";
import type { AuditEvent, AuditEventCategory } from "@/lib/audit-feed";

const CATEGORY_BADGE: Record<
  AuditEventCategory,
  { label: string; bg: string; fg: string }
> = {
  memory_write: {
    label: "Memory",
    bg: "var(--lume-light)",
    fg: "var(--lume-deep)",
  },
  guest_message: {
    label: "Message",
    bg: "#e8eef0",
    fg: "var(--coastal)",
  },
  rate_push: {
    label: "Rate",
    bg: "#f3e8d0",
    fg: "#7a5d24",
  },
  pricing_outcome: {
    label: "Outcome",
    bg: "#e8d5b0",
    fg: "#5a4218",
  },
  sms: {
    label: "SMS",
    bg: "#dde8e0",
    fg: "var(--tideline)",
  },
  // M10 Phase C STEP 8 (M3): notifications audit-log rows surface as their
  // own category badge (singular "Notification" mirrors the per-row Memory /
  // Message / Rate / Outcome / SMS singular labels). The "Notifications"
  // CHIP-LEVEL filter aggregates both 'sms' + 'notification' categories.
  notification: {
    label: "Notification",
    bg: "#e2dace",
    fg: "var(--tideline)",
  },
  other: {
    label: "Other",
    bg: "var(--hairline)",
    fg: "var(--tideline)",
  },
};

const ACTOR_LABEL: Record<AuditEvent["actor"], string> = {
  koast: "Koast",
  host: "Host",
  system: "System",
};

function formatRelative(iso: string): { rel: string; abs: string } {
  const t = new Date(iso);
  const now = Date.now();
  const diffMs = now - t.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  let rel: string;
  if (sec < 45) rel = "just now";
  else if (min < 60) rel = `${min}m ago`;
  else if (hr < 24) rel = `${hr}h ago`;
  else if (day < 30) rel = `${day}d ago`;
  else rel = t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const abs = t.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { rel, abs };
}

/**
 * M11 Phase C item 1 (M2): conditional revert control for pricing_apply rows.
 * Rendered only when:
 *   - event.source_table === 'agent_audit_log'
 *   - metadata.raw_action_type === 'pricing_apply'
 *   - metadata.payload.prior_state present + non-empty
 *   - metadata.context.reverted_at absent
 *
 * State machine: idle → confirming → in_flight → (success: notify parent
 * via onRevertSuccess; component unmounts on feed refresh) | error.
 *
 * Pre-M2 audit rows lack payload.prior_state — render falls through to
 * informational-only (D17d v1.1 fallback preserved).
 */
function isPricingApplyEvent(event: AuditEvent): boolean {
  const md = event.metadata as Record<string, unknown> | null;
  return (
    event.source_table === "agent_audit_log" &&
    typeof md?.raw_action_type === "string" &&
    md.raw_action_type === "pricing_apply"
  );
}

function priorStateFromMetadata(event: AuditEvent): unknown[] | null {
  const md = event.metadata as { payload?: { prior_state?: unknown } } | null;
  const ps = md?.payload?.prior_state;
  if (!Array.isArray(ps) || ps.length === 0) return null;
  return ps;
}

function revertedAtFromMetadata(event: AuditEvent): string | null {
  const md = event.metadata as { context?: { reverted_at?: unknown } } | null;
  const r = md?.context?.reverted_at;
  return typeof r === "string" && r.length > 0 ? r : null;
}

type RevertPhase = "idle" | "confirming" | "in_flight" | "error";

function RevertControl({
  auditLogId,
  onRevertSuccess,
}: {
  auditLogId: string;
  onRevertSuccess?: () => void;
}) {
  const [phase, setPhase] = useState<RevertPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confirm = async () => {
    setPhase("in_flight");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/pricing/revert/${auditLogId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setErrorMsg(body.error ?? body.message ?? `HTTP ${res.status}`);
        setPhase("error");
        return;
      }
      // Success — parent refreshes the feed; this component unmounts.
      onRevertSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => setPhase("confirming")}
        className="text-[12px] text-[var(--tideline)] hover:text-[var(--coastal)] underline underline-offset-2"
      >
        Revert
      </button>
    );
  }
  if (phase === "confirming") {
    return (
      <span className="inline-flex items-center gap-2 text-[12px]">
        <span className="text-[var(--tideline)]">Revert this push?</span>
        <button
          type="button"
          onClick={confirm}
          className="font-medium text-[var(--coastal)] hover:text-[var(--deep-sea)] underline underline-offset-2"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="text-[var(--tideline)] hover:text-[var(--coastal)] underline underline-offset-2"
        >
          Cancel
        </button>
      </span>
    );
  }
  if (phase === "in_flight") {
    return (
      <span className="text-[12px] text-[var(--tideline)]">Reverting…</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <span className="text-[var(--coral-reef)]">{errorMsg ?? "Revert failed"}</span>
      <button
        type="button"
        onClick={() => setPhase("idle")}
        className="text-[var(--tideline)] hover:text-[var(--coastal)] underline underline-offset-2"
      >
        Retry
      </button>
    </span>
  );
}

export function ActivityEvent({
  event,
  onRevertSuccess,
}: {
  event: AuditEvent;
  /** M11 Phase C item 1 (M2): called after a successful revert so the
   *  parent can refresh the audit feed. */
  onRevertSuccess?: () => void;
}) {
  const badge = CATEGORY_BADGE[event.category] ?? CATEGORY_BADGE.other;
  const { rel, abs } = formatRelative(event.occurred_at);

  const isPricingApply = isPricingApplyEvent(event);
  const priorState = isPricingApply ? priorStateFromMetadata(event) : null;
  const revertedAt = isPricingApply ? revertedAtFromMetadata(event) : null;
  const isRevertable = isPricingApply && priorState !== null && revertedAt === null;
  const isReverted = isPricingApply && revertedAt !== null;

  return (
    <article className="flex items-start gap-3 py-3.5 px-4 border-b border-[var(--hairline)] last:border-b-0">
      <span
        className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide uppercase"
        style={{ backgroundColor: badge.bg, color: badge.fg }}
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-[var(--coastal)] leading-[1.5] break-words">
          {event.summary}
        </p>
        <p className="mt-1 text-[12px] text-[var(--tideline)] flex items-center gap-2 flex-wrap">
          <time dateTime={event.occurred_at} title={abs}>
            {rel}
          </time>
          <span aria-hidden="true">·</span>
          <span>{ACTOR_LABEL[event.actor] ?? event.actor}</span>
          {isRevertable ? (
            <>
              <span aria-hidden="true">·</span>
              <RevertControl
                auditLogId={event.source_id}
                onRevertSuccess={onRevertSuccess}
              />
            </>
          ) : null}
          {isReverted ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--tideline)]">Reverted</span>
            </>
          ) : null}
        </p>
      </div>
    </article>
  );
}
