import type { AuditFeedFilter } from "@/lib/audit-feed";

const COPY: Record<AuditFeedFilter, string> = {
  all:
    "No activity yet. As Koast saves notes, drafts messages, or pushes rates on your behalf, it shows up here.",
  memory:
    "No memory writes yet. Koast saves facts about your properties as you tell it things in chat.",
  messages:
    "No guest messages drafted yet. Koast drafts replies as guest messages land; they show up here once you approve them.",
  pricing:
    "No rate pushes yet. Koast applies rate suggestions to your channels when you accept them in pricing.",
  sms:
    "No SMS sent yet. Koast sends turnover instructions to cleaners when bookings land.",
};

export function ActivityEmptyState({ filter }: { filter: AuditFeedFilter }) {
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-white px-6 py-10 text-center">
      <p className="text-[14px] leading-[1.6] text-[var(--coastal)] max-w-prose mx-auto">
        {COPY[filter]}
      </p>
    </div>
  );
}
