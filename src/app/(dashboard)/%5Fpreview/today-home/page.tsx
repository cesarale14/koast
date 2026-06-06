/**
 * Design-review preview for TodayHome (Phase 2, in isolation) — deployed so the
 * §2b mobile-first call can be made on a real phone against the real render
 * (fonts, spacing, responsive), not a local dev approximation. NOT product: a
 * preview route (layout bypasses chrome for /_preview/*), behind auth, not in
 * nav, mock data, not wired into "/" (Phase 3 owns the cold-open path).
 *
 * One state at a time (?state=busy|clear, default busy) so each renders as the
 * real full-bleed surface — TodayHome fills the flex remainder and owns its own
 * scroll, no nested-scroll harness artifact to muddy the review.
 */
import { TodayHome } from "@/components/today/TodayHome";
import { deriveGreeting } from "@/lib/today/deriveGreeting";
import type { AgendaRenderPayload } from "@/lib/agent/render/types";

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

export default function TodayHomePreview({ searchParams }: { searchParams: { state?: string } }) {
  const isClear = searchParams?.state === "clear";
  const payload = isClear ? clear : busy;
  const greeting = deriveGreeting(payload, "Cesar", isClear ? 14 : 9);
  const places = isClear ? new Map<string, string | null>() : busyPlaces;

  const tab = (label: string, href: string, active: boolean) => (
    <a href={href} style={{ textDecoration: "none", fontWeight: active ? 700 : 500, color: active ? "var(--deep-sea)" : "var(--tideline)" }}>
      {label}
    </a>
  );

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--shore)" }}>
      <div style={{ flexShrink: 0, display: "flex", gap: 16, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--hairline)", fontSize: 12 }}>
        <span style={{ color: "var(--koast-trench)", fontWeight: 700, letterSpacing: "0.08em" }}>PREVIEW</span>
        {tab("Busy", "/_preview/today-home?state=busy", !isClear)}
        {tab("All-clear", "/_preview/today-home?state=clear", isClear)}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TodayHome payload={payload} places={places} greeting={greeting} />
      </div>
    </div>
  );
}
