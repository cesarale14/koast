/**
 * TodayHome — the ambient "open the app cold and see your operation" surface
 * (Phase 1 slice one). Presentational + props-fed (payload, greeting), so it's
 * renderable in isolation and composition-independent. The greeting PROSE and the
 * movement-line PROSE are composed HERE from structured facts (deriveGreeting +
 * curateToday return facts, never strings) — curation lives in the tested derive
 * layer, presentation lives here.
 *
 * §2b: calm over dense, ONE focal element (the greeting), real whitespace, large
 * & legible. Two first-class states — busy/gappy ("here's what needs you") and
 * all-clear ("you're clear today"), neither a void.
 *
 * Surface, not page (fix 1): the container is TRANSPARENT so the chat shell's
 * --shore shows through — TodayHome IS the cold surface, not a cream page bolted
 * into it. People are LIGHT: a nameless OTA booking folds into a "+N" beside the
 * named guest, never a standalone "A checkout" (the grouping happens in curate).
 * Places get one UNIFORM brand tile each (fix 5) — covers are inconsistent in
 * prod (dark / low-res / null), and a photo-here/tile-there mix reads half-
 * finished; restore photos only when a consistent decent-asset set exists.
 */
import type { AgendaRenderPayload, AgendaGap } from "@/lib/agent/render/types";
import type { GreetingFacts, GapCategory } from "@/lib/today/deriveGreeting";
import type { Places } from "@/lib/today/places";
import { curateToday, type CuratedProperty, type MovementLine } from "@/lib/today/curate";

export type TodayHomeProps = {
  payload: AgendaRenderPayload;
  /** Reserved: the cover-photo join. The current treatment is uniform brand tiles
   * (fix 5), so covers are intentionally not consumed yet — kept plumbed for when
   * a consistent decent-asset set exists. */
  places: Places;
  greeting: GreetingFacts;
};

// ── greeting prose (from the structured facts; presentation only) ───────────
function gapPhrase(category: GapCategory, count: number): string {
  switch (category) {
    case "turnovers":
      return `${count} turnover${count > 1 ? "s" : ""} ${count > 1 ? "need" : "needs"} a cleaner`;
    case "essentials":
      return `${count} ${count > 1 ? "properties are" : "property is"} missing check-in details`;
    case "replies":
      return `${count} guest${count > 1 ? "s" : ""} waiting on a reply`;
  }
}
function greetingLine(g: GreetingFacts): string {
  const hello = g.name ? `${g.timeOfDay}, ${g.name}` : `Good ${g.timeOfDay.toLowerCase()}`;
  if (g.tone === "clear" || g.gaps.length === 0) return `${hello} — you're clear today.`;
  return `${hello} — ${gapPhrase(g.gaps[0].category, g.gaps[0].count)}.`;
}

// ── movement-line prose (light people: name leads, nameless fold into +N) ─────
function fmtDay(iso: string, today: string): string {
  if (iso === today) return "today";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return "tomorrow";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function movementText(m: MovementLine): string {
  const noun = m.kind === "checkout" ? "checkout" : "check-in";
  const verb = m.kind === "checkout" ? "checks out" : "arrives";
  const guests = m.kind === "checkin" && m.guests ? ` (${m.guests} guests)` : "";
  // singular + a single named guest → natural verb form
  if (m.count === 1 && m.named.length === 1) return `${m.named[0]} ${verb}${guests}`;
  // singular + nameless → count form (never "A checkout")
  if (m.count === 1) return `1 ${noun}${guests}`;
  // plural → grouped: "2 checkouts — Jeremy +1"
  const lead =
    m.named.length > 0
      ? ` — ${m.named.join(", ")}${m.namelessCount > 0 ? ` +${m.namelessCount}` : ""}`
      : "";
  return `${m.count} ${noun}s${lead}`;
}

// ── places: ONE uniform brand tile per property (fix 5; no photo/tile mix) ─────
function PropertyTile({ property }: { property: string }) {
  return (
    <div
      aria-hidden
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        flexShrink: 0,
        background: "var(--dry-sand)",
        color: "var(--mangrove)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 16,
      }}
    >
      {property.trim().charAt(0).toUpperCase()}
    </div>
  );
}

function PropertyRow({ p, today, showDate }: { p: CuratedProperty; today: string; showDate: boolean }) {
  return (
    <div
      data-testid="today-property"
      style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "18px 0", borderBottom: "1px solid var(--hairline)" }}
    >
      <PropertyTile property={p.property} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 17, marginBottom: 3 }}>{p.property}</div>
        {p.movements.map((m, i) => (
          <div key={i} style={{ color: "var(--tideline)", fontSize: 15, lineHeight: 1.7 }}>
            {movementText(m)}
            {showDate ? ` · ${fmtDay(m.date, today)}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NEEDS YOU: the gaps, and ONLY here (fix 3) ───────────────────────────────
function gapLine(gap: AgendaGap): string {
  switch (gap.kind) {
    case "no_cleaner":
      return `${gap.property} — turnover needs a cleaner`;
    case "missing_essentials":
      return `${gap.property} — missing check-in details (door, wifi, parking)`;
    case "awaiting_reply":
      return `${gap.guest ?? "A guest"} at ${gap.property} may be waiting on a reply`;
  }
}

const GAP_DOT: Record<AgendaGap["kind"], string> = {
  no_cleaner: "var(--coral-reef)",
  missing_essentials: "var(--amber-tide)",
  awaiting_reply: "var(--amber-tide)",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--koast-trench)", marginBottom: 12 }}>
      {children}
    </div>
  );
}

export function TodayHome({ payload, greeting }: TodayHomeProps) {
  const c = curateToday(payload);

  return (
    // Transparent (fix 1): the chat shell paints --shore; this surface inherits it.
    <div data-testid="today-home" style={{ height: "100%", overflowY: "auto", background: "transparent" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 28px 120px" }}>
        {/* Focal element: the greeting */}
        <h1
          data-testid="today-greeting"
          style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 600, color: "var(--deep-sea)", margin: 0, letterSpacing: "-0.01em" }}
        >
          {greetingLine(greeting)}
        </h1>

        {c.empty ? (
          <p style={{ marginTop: 20, fontSize: 17, color: "var(--tideline)", lineHeight: 1.6 }}>
            Nothing on the calendar for the next couple of days — you&apos;re all set. I&apos;ll surface anything that needs you the moment it lands.
          </p>
        ) : (
          <>
            {c.gaps.length > 0 && (
              <section style={{ marginTop: 44 }}>
                <Eyebrow>Needs you</Eyebrow>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  {c.gaps.map((gap, i) => (
                    <li
                      key={i}
                      data-testid="today-gap"
                      style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, color: "var(--deep-sea)" }}
                    >
                      <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: GAP_DOT[gap.kind], flexShrink: 0 }} />
                      <span>{gapLine(gap)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {c.today.length > 0 && (
              <section style={{ marginTop: 48 }}>
                <Eyebrow>Today</Eyebrow>
                {c.today.map((p) => (
                  <PropertyRow key={p.property} p={p} today={payload.today} showDate={false} />
                ))}
              </section>
            )}

            {c.upcoming.length > 0 && (
              <section style={{ marginTop: 48 }}>
                <Eyebrow>Coming up</Eyebrow>
                {c.upcoming.map((p) => (
                  <PropertyRow key={p.property} p={p} today={payload.today} showDate />
                ))}
              </section>
            )}
          </>
        )}

        {payload.nullTzPropertyCount > 0 && (
          <p style={{ marginTop: 28, fontSize: 14, color: "var(--amber-tide)" }}>
            {payload.nullTzPropertyCount} {payload.nullTzPropertyCount === 1 ? "property isn't" : "properties aren't"} shown — set{" "}
            {payload.nullTzPropertyCount === 1 ? "its" : "their"} timezone to include {payload.nullTzPropertyCount === 1 ? "it" : "them"}.
          </p>
        )}
      </div>
    </div>
  );
}
