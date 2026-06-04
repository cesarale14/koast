/**
 * TodayHome — the ambient "open the app cold and see your operation" surface
 * (Phase 1 slice one). Presentational + props-fed (payload, places, greeting),
 * so it's renderable in isolation and composition-independent. The greeting
 * PROSE is composed HERE from the structured GreetingFacts (deriveGreeting
 * returns facts, never a string).
 *
 * §2b: keep the brand (cream/forest/gold), calm over dense, ONE focal element
 * (the greeting), large & legible. Two first-class states — busy/gappy ("here's
 * what needs you") and all-clear ("you're clear today"), neither a void.
 *
 * People are LIGHT: realFirstName already nulls OTA placeholders upstream, so a
 * nameless booking renders as "a check-in" by property + action — the default,
 * not a broken avatar. Places texture = coverPhotoUrl (null-graceful).
 */
import type { AgendaRenderPayload, AgendaPropertyGroup, AgendaGap } from "@/lib/agent/render/types";
import type { GreetingFacts, GapCategory } from "@/lib/today/deriveGreeting";
import type { Places } from "@/lib/today/places";

export type TodayHomeProps = {
  payload: AgendaRenderPayload;
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

// ── item phrasing (light people: name when real, property+action otherwise) ──
function fmtDay(iso: string, today: string): string {
  if (iso === today) return "today";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return "tomorrow";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function PropertyBlock({ g, today, cover }: { g: AgendaPropertyGroup; today: string; cover: string | null }) {
  const lines: string[] = [];
  for (const c of g.checkOuts) lines.push(`${c.guest ? `${c.guest} checks out` : "A checkout"} ${fmtDay(c.date, today)}`);
  for (const c of g.checkIns) lines.push(`${c.guest ? `${c.guest} arrives` : "A check-in"}${c.numGuests ? ` (${c.numGuests} guests)` : ""} ${fmtDay(c.date, today)}`);
  for (const t of g.turnovers) lines.push(`Turnover ${fmtDay(t.date, today)}${t.cleanerAssigned ? "" : " — no cleaner yet"}`);
  return (
    <div data-testid="today-property" style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "14px 0", borderBottom: "1px solid var(--hairline)" }}>
      <Thumb cover={cover} property={g.property} />
      <div>
        <div style={{ fontWeight: 600, color: "var(--deep-sea)", fontSize: 17 }}>{g.property}</div>
        {lines.map((l, i) => (
          <div key={i} style={{ color: "var(--tideline)", fontSize: 15, lineHeight: 1.6 }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function Thumb({ cover, property }: { cover: string | null; property: string }) {
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cover} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />;
  }
  // No cover photo — a calm brand initial tile, NOT a broken image.
  return (
    <div aria-hidden style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "var(--dry-sand)", color: "var(--mangrove)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>
      {property.trim().charAt(0).toUpperCase()}
    </div>
  );
}

function gapLine(gap: AgendaGap): string {
  switch (gap.kind) {
    case "no_cleaner":
      return `${gap.property} — turnover needs a cleaner${gap.date ? "" : ""}`;
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
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--golden)", marginBottom: 10 }}>{children}</div>;
}

export function TodayHome({ payload, places, greeting }: TodayHomeProps) {
  const hasToday = payload.groups.today.length > 0;
  const hasUpcoming = payload.groups.upcoming.length > 0;
  const empty = !hasToday && !hasUpcoming && payload.gaps.length === 0;
  const coverOf = (p: string) => places.get(p) ?? null;

  return (
    <div data-testid="today-home" style={{ height: "100%", overflowY: "auto", background: "var(--shore)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 28px 120px" }}>
        {/* Focal element: the greeting */}
        <h1 data-testid="today-greeting" style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 600, color: "var(--deep-sea)", margin: 0, letterSpacing: "-0.01em" }}>
          {greetingLine(greeting)}
        </h1>

        {empty ? (
          <p style={{ marginTop: 18, fontSize: 17, color: "var(--tideline)", lineHeight: 1.6 }}>
            Nothing on the calendar for the next couple of days — you&apos;re all set. I&apos;ll surface anything that needs you the moment it lands.
          </p>
        ) : (
          <>
            {payload.gaps.length > 0 && (
              <section style={{ marginTop: 36 }}>
                <Eyebrow>Needs you</Eyebrow>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {payload.gaps.map((gap, i) => (
                    <li key={i} data-testid="today-gap" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, color: "var(--deep-sea)" }}>
                      <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: GAP_DOT[gap.kind], flexShrink: 0 }} />
                      <span>{gapLine(gap)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasToday && (
              <section style={{ marginTop: 40 }}>
                <Eyebrow>Today</Eyebrow>
                {payload.groups.today.map((g) => (
                  <PropertyBlock key={g.property} g={g} today={payload.today} cover={coverOf(g.property)} />
                ))}
              </section>
            )}

            {hasUpcoming && (
              <section style={{ marginTop: 40 }}>
                <Eyebrow>Coming up</Eyebrow>
                {payload.groups.upcoming.map((g) => (
                  <PropertyBlock key={g.property} g={g} today={payload.today} cover={coverOf(g.property)} />
                ))}
              </section>
            )}
          </>
        )}

        {payload.nullTzPropertyCount > 0 && (
          <p style={{ marginTop: 28, fontSize: 14, color: "var(--amber-tide)" }}>
            {payload.nullTzPropertyCount} {payload.nullTzPropertyCount === 1 ? "property isn't" : "properties aren't"} shown — set {payload.nullTzPropertyCount === 1 ? "its" : "their"} timezone to include {payload.nullTzPropertyCount === 1 ? "it" : "them"}.
          </p>
        )}
      </div>
    </div>
  );
}
