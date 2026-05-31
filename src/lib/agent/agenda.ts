/**
 * agenda — the host's operational-state rollup (M13 D-agenda).
 *
 * Koast IS the operating layer (doctrine point 1): the host's bookings,
 * turnovers, and guest messages live in Koast's DB. The agent had no tool or
 * context to read them, so open prompts ("what should I prioritize today")
 * fell back to base-model deflection ("I don't have visibility…"). This builds
 * a per-turn, host-scoped agenda for today + the next 48h and a preamble that
 * gets injected POST-PREFIX into the turn's messages (NOT the cached system
 * prompt — a daily-changing agenda in the prefix would bust prompt-cache every
 * turn). Modeled on the per-turn sufficiency rollup.
 *
 * Natural references only reach the host (guest first name, property nickname);
 * booking_id is carried for agent-internal tool-chaining (read_guest_thread)
 * and is prompt-instructed never to surface.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export interface AgendaCheckIn {
  property: string;
  /** First name when the booking carries a real one; null for OTA placeholders
   * ("Airbnb Guest") or feed-sourced bookings with no name — rendered by
   * property + action instead. */
  guest: string | null;
  date: string;
  numGuests: number | null;
  bookingId: string;
}
export interface AgendaCheckOut {
  property: string;
  guest: string | null;
  date: string;
  turnoverScheduled: boolean;
  bookingId: string;
}
export interface AgendaTurnover {
  property: string;
  date: string;
  time: string | null;
  cleanerAssigned: boolean;
}
export interface AgendaPendingMessage {
  property: string;
  guest: string | null;
  preview: string;
  bookingId: string;
}

export interface AgendaRollup {
  today: string;
  windowEnd: string;
  checkIns: AgendaCheckIn[];
  checkOuts: AgendaCheckOut[];
  turnovers: AgendaTurnover[];
  pendingMessages: AgendaPendingMessage[];
  empty: boolean;
  /** Properties with no timezone set — their date-windowed events are SKIPPED
   * (a missing item beats a wrong-day one) and the count is surfaced so the
   * agent can flag it rather than silently imply nothing is scheduled. */
  nullTzPropertyCount: number;
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** YYYY-MM-DD in the given IANA timezone. Node ships full ICU, so Intl applies
 * the tz offset incl. DST. Throws on an invalid tz (caller treats as null-tz). */
function localDateStr(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** OTA / feed placeholder names that are NOT real guest names: "Airbnb Guest",
 * "Booking.com Guest", bare "Guest", etc. iCal-sourced bookings carry these
 * (the majority case in prod), so splitting on whitespace would surface the
 * platform token ("Airbnb") as if it were the guest's name. */
const PLACEHOLDER_NAME = /^(?:airbnb|booking(?:\.com|_com)?|bdc|abb|vrbo|hma|expedia|homeaway)?[\s.]*guest$/i;
function isPlaceholderName(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  return t.length === 0 || PLACEHOLDER_NAME.test(t);
}
/** First name when the booking carries a REAL one; null for OTA placeholders or
 * empty. A nameless booking is referred to by property + action downstream —
 * never a fabricated name or "a guest". */
function realFirstName(full: string | null | undefined, fallback: string | null | undefined): string | null {
  const pick = (s: string | null | undefined): string | null => {
    if (!s || !s.trim() || isPlaceholderName(s)) return null;
    return s.trim().split(/\s+/)[0];
  };
  return pick(full) ?? pick(fallback);
}
function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/**
 * Build the host's agenda for today + the next 48h, windowed PER PROPERTY in
 * that property's own IANA timezone (properties.timezone). A property with no
 * timezone is SKIPPED, never UTC-fallback — a wrong-day item is worse than a
 * missing one — and counted so the agent can flag it. Host-scoped via
 * properties.user_id; returns natural handles + agent-internal booking ids.
 * The caller wraps in try/catch; this also fails soft to an empty agenda.
 */
export async function buildAgendaRollup(
  supabase: Supa,
  hostId: string,
  now: Date = new Date(),
): Promise<AgendaRollup> {
  const emptyRollup = (
    today: string,
    windowEnd: string,
    nullTzPropertyCount = 0,
  ): AgendaRollup => ({
    today,
    windowEnd,
    checkIns: [],
    checkOuts: [],
    turnovers: [],
    pendingMessages: [],
    empty: true,
    nullTzPropertyCount,
  });

  // 1. Host's properties WITH timezone.
  const { data: propRows, error: propErr } = await supabase
    .from("properties")
    .select("id, name, timezone")
    .eq("user_id", hostId);
  if (propErr || !propRows || propRows.length === 0) {
    return emptyRollup(utcDateStr(now), addDaysStr(utcDateStr(now), 2));
  }

  // Per-property window in each property's own tz. Null/invalid tz → SKIP + log
  // + count (never UTC-fallback).
  const propName = new Map<string, string>();
  const propWindow = new Map<string, { today: string; end: string }>();
  let nullTzPropertyCount = 0;
  for (const p of propRows as Array<{ id: string; name: string; timezone: string | null }>) {
    propName.set(p.id, p.name);
    let localToday: string | null = null;
    if (p.timezone) {
      try {
        localToday = localDateStr(now, p.timezone);
      } catch {
        localToday = null;
      }
    }
    if (!localToday) {
      nullTzPropertyCount++;
      console.warn(
        `[agenda] property ${p.id} (${p.name}) has no/invalid timezone ('${p.timezone}') — skipping its date-windowed events.`,
      );
      continue;
    }
    propWindow.set(p.id, { today: localToday, end: addDaysStr(localToday, 2) });
  }

  const windowedIds = Array.from(propWindow.keys());
  // Representative "today" for the summary label; per-property windows still
  // applied below. Single-tz hosts (the common case) get the right date — a
  // single-"today" framing for a genuinely multi-region host is a later refinement.
  const repToday = windowedIds.length
    ? propWindow.get(windowedIds[0])!.today
    : utcDateStr(now);
  const repEnd = windowedIds.length
    ? propWindow.get(windowedIds[0])!.end
    : addDaysStr(utcDateStr(now), 2);
  if (windowedIds.length === 0) {
    return emptyRollup(repToday, repEnd, nullTzPropertyCount);
  }

  // Fetch bound: union of the per-property windows (tz offsets shift the local
  // date by at most ±1 day, so this is a tight superset). Per-property windows
  // are then applied in-app via inWindow().
  const sortedTodays = windowedIds.map((id) => propWindow.get(id)!.today).sort();
  const sortedEnds = windowedIds.map((id) => propWindow.get(id)!.end).sort();
  const globalMin = sortedTodays[0];
  const globalMax = sortedEnds[sortedEnds.length - 1];

  const [ciRes, coRes, toRes, msgRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, property_id, guest_first_name, guest_name, check_in, num_guests")
      .in("property_id", windowedIds)
      .neq("status", "cancelled")
      .gte("check_in", globalMin)
      .lte("check_in", globalMax),
    supabase
      .from("bookings")
      .select("id, property_id, guest_first_name, guest_name, check_out")
      .in("property_id", windowedIds)
      .neq("status", "cancelled")
      .gte("check_out", globalMin)
      .lte("check_out", globalMax),
    supabase
      .from("cleaning_tasks")
      .select("property_id, booking_id, scheduled_date, scheduled_time, cleaner_id, status")
      .in("property_id", windowedIds)
      .neq("status", "completed")
      .gte("scheduled_date", globalMin)
      .lte("scheduled_date", globalMax),
    // Fuzzy "awaiting reply": recent inbound guest messages; keep the latest
    // per thread and flag those whose latest is from the guest. NOT date-
    // windowed, so it doesn't need per-property tz handling.
    supabase
      .from("messages")
      .select("id, property_id, booking_id, thread_id, sender, sender_name, content, created_at, channex_inserted_at")
      .in("property_id", windowedIds)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const inWindow = (propId: string, date: string): boolean => {
    const w = propWindow.get(propId);
    return !!w && date >= w.today && date <= w.end;
  };

  const turnoverByBooking = new Set<string>();
  const turnovers: AgendaTurnover[] = [];
  for (const t of (toRes.data ?? []) as Array<{ property_id: string; booking_id: string | null; scheduled_date: string; scheduled_time: string | null; cleaner_id: string | null }>) {
    if (!inWindow(t.property_id, t.scheduled_date)) continue;
    if (t.booking_id) turnoverByBooking.add(t.booking_id);
    turnovers.push({
      property: propName.get(t.property_id) ?? "a property",
      date: t.scheduled_date,
      time: t.scheduled_time,
      cleanerAssigned: t.cleaner_id != null,
    });
  }

  const checkIns: AgendaCheckIn[] = ((ciRes.data ?? []) as Array<{ id: string; property_id: string; guest_first_name: string | null; guest_name: string | null; check_in: string; num_guests: number | null }>)
    .filter((b) => inWindow(b.property_id, b.check_in))
    .map((b) => ({
      property: propName.get(b.property_id) ?? "a property",
      guest: realFirstName(b.guest_first_name, b.guest_name),
      date: b.check_in,
      numGuests: b.num_guests,
      bookingId: b.id,
    }));

  const checkOuts: AgendaCheckOut[] = ((coRes.data ?? []) as Array<{ id: string; property_id: string; guest_first_name: string | null; guest_name: string | null; check_out: string }>)
    .filter((b) => inWindow(b.property_id, b.check_out))
    .map((b) => ({
      property: propName.get(b.property_id) ?? "a property",
      guest: realFirstName(b.guest_first_name, b.guest_name),
      date: b.check_out,
      turnoverScheduled: turnoverByBooking.has(b.id),
      bookingId: b.id,
    }));

  // Latest message per thread; flag threads whose latest is from the guest.
  const seenThread = new Set<string>();
  const pendingMessages: AgendaPendingMessage[] = [];
  for (const m of (msgRes.data ?? []) as Array<{ property_id: string; booking_id: string | null; thread_id: string | null; sender: string | null; sender_name: string | null; content: string }>) {
    const key = m.thread_id ?? m.booking_id ?? `${m.property_id}:loose`;
    if (seenThread.has(key)) continue; // already saw this thread's latest
    seenThread.add(key);
    if (m.sender === "guest" && m.booking_id) {
      pendingMessages.push({
        property: propName.get(m.property_id) ?? "a property",
        guest: realFirstName(m.sender_name, null),
        preview: truncate(m.content),
        bookingId: m.booking_id,
      });
    }
  }

  const isEmpty =
    checkIns.length === 0 &&
    checkOuts.length === 0 &&
    turnovers.length === 0 &&
    pendingMessages.length === 0;

  return {
    today: repToday,
    windowEnd: repEnd,
    checkIns,
    checkOuts,
    turnovers,
    pendingMessages,
    empty: isEmpty,
    nullTzPropertyCount,
  };
}

/**
 * Render the agenda as the POST-PREFIX preamble prepended to the turn's last
 * user message. `gaps` (optional) carries the sufficiency-derived count the
 * loop already computes. Internal booking ids are included for tool-chaining
 * and explicitly flagged never-to-surface.
 */
export function agendaPreamble(
  rollup: AgendaRollup,
  gaps?: { missing: number; total: number },
): string {
  // NOTE: plain prose, NOT XML/angle-bracket tags — a tag-wrapped block primes
  // the model to express tool calls as XML text (and leak the ids). Keep ids as
  // labelled prose the model reads but is told never to surface.
  //
  // Relative-day label for UPCOMING items (today's items live under a TODAY
  // header, so they need no per-item date). "tomorrow" / "on <date>".
  const relDay = (date: string): string =>
    date === rollup.today ? "today" : date === addDaysStr(rollup.today, 1) ? "tomorrow" : `on ${date}`;
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

  // Per-item detail renderers. The property is the LINE prefix (see dayLines),
  // so the item detail omits it. `withDate` is FALSE under TODAY (all today)
  // and TRUE under UPCOMING (each item carries its own day).
  const coDetail = (c: AgendaCheckOut, withDate: boolean): string =>
    `${c.guest ? `${c.guest} checking out` : "a checkout"}${withDate ? ` ${relDay(c.date)}` : ""}${c.turnoverScheduled ? ", turnover scheduled" : ", no turnover scheduled"} (internal booking id for tools: ${c.bookingId})`;
  const ciDetail = (c: AgendaCheckIn, withDate: boolean): string =>
    `${c.guest ? `${c.guest} arriving` : "a check-in"}${c.numGuests ? ` (${c.numGuests} guests)` : ""}${withDate ? ` ${relDay(c.date)}` : ""} (internal booking id for tools: ${c.bookingId})`;
  const toDetail = (t: AgendaTurnover, withDate: boolean): string =>
    `${withDate ? relDay(t.date) : "scheduled"}${t.time ? ` at ${t.time}` : ""}${t.cleanerAssigned ? ", cleaner assigned" : ", NO cleaner assigned"}`;

  // Stable property order across all dated items.
  const isToday = (d: string) => d === rollup.today;
  const propOrder: string[] = [];
  const seenProp = new Set<string>();
  for (const p of [
    ...rollup.checkOuts.map((c) => c.property),
    ...rollup.checkIns.map((c) => c.property),
    ...rollup.turnovers.map((t) => t.property),
  ]) {
    if (!seenProp.has(p)) { seenProp.add(p); propOrder.push(p); }
  }

  // Pre-bucket by DAY then by PROPERTY with per-property counts, so the model
  // READS "Villa Jamaica: 2 check-outs today" straight off the line instead of
  // re-tallying a day total across properties (which folds counts/days).
  const dayLines = (today: boolean): string[] => {
    const out: string[] = [];
    for (const p of propOrder) {
      const cos = rollup.checkOuts.filter((c) => c.property === p && isToday(c.date) === today);
      const cis = rollup.checkIns.filter((c) => c.property === p && isToday(c.date) === today);
      const tos = rollup.turnovers.filter((t) => t.property === p && isToday(t.date) === today);
      if (!cos.length && !cis.length && !tos.length) continue;
      const parts: string[] = [];
      if (cos.length) parts.push(`${plural(cos.length, "check-out")} (${cos.map((c) => coDetail(c, !today)).join("; ")})`);
      if (cis.length) parts.push(`${plural(cis.length, "check-in")} (${cis.map((c) => ciDetail(c, !today)).join("; ")})`);
      if (tos.length) parts.push(`${plural(tos.length, "turnover")} (${tos.map((t) => toDetail(t, !today)).join("; ")})`);
      out.push(`${p}: ${parts.join("; ")}`);
    }
    return out;
  };

  const lines: string[] = [];
  lines.push(
    `[OPERATIONAL AGENDA — live Koast data for this host. Koast IS the operating layer; this is in-house. The booking ids below are AGENT-INTERNAL: use them only as tool-call arguments, and NEVER show an id to the host. Refer to guests by first name and properties by nickname.]`,
  );
  lines.push(
    `Today is ${rollup.today}; the window is today + the next 48h. Items are grouped TODAY vs UPCOMING and listed per property, each property carrying its OWN counts — read each property's line as written. Never re-tally across properties, never move an item between days, and never report an UPCOMING item as today.`,
  );

  if (rollup.empty) {
    lines.push(
      `Nothing on the calendar in the next 48h — no check-ins, check-outs, turnovers, or guests awaiting reply.`,
    );
  } else {
    const today = dayLines(true);
    lines.push(`TODAY (${rollup.today}):`);
    lines.push(...(today.length ? today : [`Nothing scheduled today.`]));

    const upcoming = dayLines(false);
    if (upcoming.length) {
      lines.push(`UPCOMING (rest of the next 48h, after today):`);
      lines.push(...upcoming);
    }

    // Pending messages — not date-bucketed (a "may be waiting" signal, fetched
    // regardless of date), so it sits outside the TODAY/UPCOMING groups.
    if (rollup.pendingMessages.length) {
      lines.push(
        `Guests who may be awaiting a reply (${rollup.pendingMessages.length}; heuristic — present softly, e.g. "looks like X may be waiting"): ` +
          rollup.pendingMessages
            .map((m) => `${m.guest ? `${m.guest} at ${m.property}` : `an unanswered guest message at ${m.property}`} — "${m.preview}" (internal booking id for tools: ${m.bookingId})`)
            .join("; "),
      );
    }
  }

  if (rollup.nullTzPropertyCount > 0) {
    lines.push(
      `Note: ${rollup.nullTzPropertyCount} ${rollup.nullTzPropertyCount === 1 ? "property has" : "properties have"} no timezone set, so ${rollup.nullTzPropertyCount === 1 ? "its" : "their"} schedule is NOT included above — if the host asks about ${rollup.nullTzPropertyCount === 1 ? "that property" : "those"}, say its location/timezone needs setting first (don't imply nothing is scheduled there).`,
    );
  }

  if (gaps && gaps.total > 0 && gaps.missing > 0) {
    lines.push(
      `Property gaps: ${gaps.missing} of ${gaps.total} properties are missing check-in essentials (door/access, wifi, or parking) — drafting guest messages for those is limited until filled.`,
    );
  }

  lines.push(`[end operational agenda]\n\n`);
  return lines.join("\n");
}
