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

export function ActivityEvent({ event }: { event: AuditEvent }) {
  const badge = CATEGORY_BADGE[event.category] ?? CATEGORY_BADGE.other;
  const { rel, abs } = formatRelative(event.occurred_at);

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
        <p className="mt-1 text-[12px] text-[var(--tideline)] flex items-center gap-2">
          <time dateTime={event.occurred_at} title={abs}>
            {rel}
          </time>
          <span aria-hidden="true">·</span>
          <span>{ACTOR_LABEL[event.actor] ?? event.actor}</span>
        </p>
      </div>
    </article>
  );
}
