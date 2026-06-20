/**
 * Design-review preview for TodayHome (Phase 2, in isolation) — deployed so the
 * §2b mobile-first call can be made on a real phone against the real render
 * (fonts, spacing, responsive), not a local dev approximation. NOT product: a
 * preview route (layout bypasses chrome for /_preview/*), behind auth, not in
 * nav, mock data, not wired into "/" (Phase 3 owns the cold-open path).
 *
 * One state at a time (?state=busy|clear|suggests, default busy) so each renders
 * as the real full-bleed surface — TodayHome fills the flex remainder and owns
 * its own scroll, no nested-scroll harness artifact to muddy the review.
 *
 * The `suggests` state is the Q-A/Q-B proposal-card review artifact: real
 * ProposalCards on a clear day — a gap-night DROP (neutral ▼), a weekend RAISE
 * (gold ▲ "found money") in the SAME view, and a low-confidence raise (gold ▲ +
 * the neutral "Early estimate" cue) — so both money + confidence signatures are
 * visible, the before→after delta is the focal element, and the greeting
 * acknowledges the suggestions instead of contradicting them.
 */
import { TodayHome } from "@/components/today/TodayHome";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { ToastProvider } from "@/components/ui/Toast";
import { deriveGreeting } from "@/lib/today/deriveGreeting";
import type { AgendaRenderPayload } from "@/lib/agent/render/types";
import type { NormalizedProposal } from "@/lib/proposals/server";

const busy: AgendaRenderPayload = {
  v: 1,
  kind: "agenda",
  horizon: "today_48h",
  today: "2026-06-03",
  groups: {
    today: [
      {
        property: "Villa Jamaica",
        checkOuts: [{ guest: "Jeremy", date: "2026-06-03" }, { guest: null, date: "2026-06-03" }],
        checkIns: [{ guest: "Maya", date: "2026-06-03", numGuests: 2 }],
        turnovers: [{ date: "2026-06-03", time: null, cleanerAssigned: false }],
      },
      {
        property: "Cozy Loft - Tampa",
        checkOuts: [],
        checkIns: [{ guest: null, date: "2026-06-03", numGuests: 3 }],
        turnovers: [{ date: "2026-06-03", time: null, cleanerAssigned: false }],
      },
    ],
    upcoming: [
      {
        property: "Villa Jamaica",
        checkOuts: [{ guest: null, date: "2026-06-04" }],
        checkIns: [{ guest: null, date: "2026-06-04", numGuests: null }],
        turnovers: [],
      },
    ],
  },
  gaps: [
    { kind: "no_cleaner", property: "Villa Jamaica", date: "2026-06-03" },
    { kind: "no_cleaner", property: "Cozy Loft - Tampa", date: "2026-06-03" },
    { kind: "missing_essentials", property: "Cozy Loft - Tampa" },
  ],
  nullTzPropertyCount: 0,
};

const clear: AgendaRenderPayload = {
  v: 1, kind: "agenda", horizon: "today_48h", today: "2026-06-03",
  groups: { today: [], upcoming: [] }, gaps: [], nullTzPropertyCount: 0,
};

const busyPlaces = new Map<string, string | null>([
  ["Villa Jamaica", "https://picsum.photos/seed/villa/160"],
  ["Cozy Loft - Tampa", null], // no cover → the calm initial tile (nameless-graceful default)
]);

// ── Mock proposals for the `suggests` review state. Real NormalizedProposals fed
//    straight to the production ProposalCard (executable:true so the deep-teal
//    Approve renders — a design preview, no live write). currentValue is set so
//    the before→after delta is the focal element (the prod regression was a
//    pre-design-p2 payload missing it → a lone destination price).
const suggestProposals: NormalizedProposal[] = [
  {
    id: "preview-gap",
    propertyId: "preview",
    actionType: "adjust_price",
    block: {
      kind: "calendar_change",
      data: { property: "Villa Jamaica", date: "2026-07-07", change: "price", value: 210, currentValue: 213, dateCount: 1, lowConfidence: false },
    },
    rationale: "Short 3-day gap — drop the rate to fill those nights before they go empty.",
    status: "pending",
    result: null,
    createdAt: "2026-07-01T16:00:00Z",
    otaTouching: true,
    executable: true,
  },
  {
    id: "preview-weekend",
    propertyId: "preview",
    actionType: "adjust_price",
    block: {
      kind: "calendar_change",
      data: { property: "Cozy Loft - Tampa", date: "2026-07-12", change: "price", value: 312, currentValue: 270, dateCount: 1, lowConfidence: false },
    },
    rationale: "Weekend priced below market — raise it before the date slips.",
    status: "pending",
    result: null,
    createdAt: "2026-07-01T16:00:00Z",
    otaTouching: true,
    executable: true,
  },
  {
    id: "preview-lowconf",
    propertyId: "preview",
    actionType: "adjust_price",
    block: {
      kind: "calendar_change",
      data: { property: "Villa Jamaica", date: "2026-07-19", change: "price", value: 195, currentValue: 178, dateCount: 1, lowConfidence: true },
    },
    rationale: "Weekend priced below market — raise it before the date slips.",
    status: "pending",
    result: null,
    createdAt: "2026-07-01T16:00:00Z",
    otaTouching: true,
    executable: true,
  },
];

function SuggestsSlot() {
  return (
    <ToastProvider>
      <section style={{ marginTop: 40 }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {suggestProposals.map((p) => (
            <li key={p.id}>
              <ProposalCard proposal={p} />
            </li>
          ))}
        </ul>
      </section>
    </ToastProvider>
  );
}

export default function TodayHomePreview({ searchParams }: { searchParams: { state?: string } }) {
  const state = searchParams?.state === "clear" ? "clear" : searchParams?.state === "suggests" ? "suggests" : "busy";
  const isClear = state === "clear";
  const isSuggests = state === "suggests";
  // suggests rides the clear agenda (an operationally-calm day) so the greeting's
  // clear branch is exercised WITH the suggestion count.
  const payload = isClear || isSuggests ? clear : busy;
  const greeting = deriveGreeting(payload, "Cesar", isClear || isSuggests ? 14 : 9);
  const places = isClear || isSuggests ? new Map<string, string | null>() : busyPlaces;

  const tab = (label: string, href: string, active: boolean) => (
    <a href={href} style={{ textDecoration: "none", fontWeight: active ? 700 : 500, color: active ? "var(--deep-sea)" : "var(--tideline)" }}>
      {label}
    </a>
  );

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--shore)" }}>
      <div style={{ flexShrink: 0, display: "flex", gap: 16, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--hairline)", fontSize: 12 }}>
        <span style={{ color: "var(--koast-trench)", fontWeight: 700, letterSpacing: "0.08em" }}>PREVIEW</span>
        {tab("Busy", "/_preview/today-home?state=busy", state === "busy")}
        {tab("All-clear", "/_preview/today-home?state=clear", isClear)}
        {tab("Suggests", "/_preview/today-home?state=suggests", isSuggests)}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TodayHome
          payload={payload}
          places={places}
          greeting={greeting}
          suggestsSlot={isSuggests ? <SuggestsSlot /> : undefined}
          suggestsCount={isSuggests ? suggestProposals.length : 0}
        />
      </div>
    </div>
  );
}
