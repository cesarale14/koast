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
  guest: string;
  date: string;
  numGuests: number | null;
  bookingId: string;
}
export interface AgendaCheckOut {
  property: string;
  guest: string;
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
  guest: string;
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
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function firstName(full: string | null | undefined, fallback: string | null | undefined): string {
  if (full && full.trim()) return full.trim().split(/\s+/)[0];
  if (fallback && fallback.trim()) return fallback.trim().split(/\s+/)[0];
  return "a guest";
}
function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/**
 * Build the host's agenda for [today, today+2d]. Host-scoped via
 * properties.user_id. Returns natural handles + agent-internal booking ids.
 * The caller wraps in try/catch; this also fails soft to an empty agenda on
 * a query error rather than throwing.
 */
export async function buildAgendaRollup(
  supabase: Supa,
  hostId: string,
  now: Date = new Date(),
): Promise<AgendaRollup> {
  const today = utcDateStr(now);
  const windowEnd = utcDateStr(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
  const empty: AgendaRollup = {
    today,
    windowEnd,
    checkIns: [],
    checkOuts: [],
    turnovers: [],
    pendingMessages: [],
    empty: true,
  };

  // 1. Host's properties → id→nickname map.
  const { data: propRows, error: propErr } = await supabase
    .from("properties")
    .select("id, name")
    .eq("user_id", hostId);
  if (propErr || !propRows || propRows.length === 0) return empty;
  const propName = new Map<string, string>();
  for (const p of propRows as Array<{ id: string; name: string }>) propName.set(p.id, p.name);
  const propIds = Array.from(propName.keys());

  // 2-4. Bookings (check-ins + check-outs in window), turnovers, pending msgs.
  const [ciRes, coRes, toRes, msgRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, property_id, guest_first_name, guest_name, check_in, num_guests")
      .in("property_id", propIds)
      .neq("status", "cancelled")
      .gte("check_in", today)
      .lte("check_in", windowEnd),
    supabase
      .from("bookings")
      .select("id, property_id, guest_first_name, guest_name, check_out")
      .in("property_id", propIds)
      .neq("status", "cancelled")
      .gte("check_out", today)
      .lte("check_out", windowEnd),
    supabase
      .from("cleaning_tasks")
      .select("property_id, booking_id, scheduled_date, scheduled_time, cleaner_id, status")
      .in("property_id", propIds)
      .neq("status", "completed")
      .gte("scheduled_date", today)
      .lte("scheduled_date", windowEnd),
    // Fuzzy "awaiting reply": recent inbound guest messages; keep the latest
    // per thread and flag those whose latest is from the guest.
    supabase
      .from("messages")
      .select("id, property_id, booking_id, thread_id, sender, sender_name, content, created_at, channex_inserted_at")
      .in("property_id", propIds)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const turnoverByBooking = new Set<string>();
  const turnovers: AgendaTurnover[] = [];
  for (const t of (toRes.data ?? []) as Array<{ property_id: string; booking_id: string | null; scheduled_date: string; scheduled_time: string | null; cleaner_id: string | null }>) {
    if (t.booking_id) turnoverByBooking.add(t.booking_id);
    turnovers.push({
      property: propName.get(t.property_id) ?? "a property",
      date: t.scheduled_date,
      time: t.scheduled_time,
      cleanerAssigned: t.cleaner_id != null,
    });
  }

  const checkIns: AgendaCheckIn[] = ((ciRes.data ?? []) as Array<{ id: string; property_id: string; guest_first_name: string | null; guest_name: string | null; check_in: string; num_guests: number | null }>).map((b) => ({
    property: propName.get(b.property_id) ?? "a property",
    guest: firstName(b.guest_first_name, b.guest_name),
    date: b.check_in,
    numGuests: b.num_guests,
    bookingId: b.id,
  }));

  const checkOuts: AgendaCheckOut[] = ((coRes.data ?? []) as Array<{ id: string; property_id: string; guest_first_name: string | null; guest_name: string | null; check_out: string }>).map((b) => ({
    property: propName.get(b.property_id) ?? "a property",
    guest: firstName(b.guest_first_name, b.guest_name),
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
        guest: firstName(m.sender_name, null),
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

  return { today, windowEnd, checkIns, checkOuts, turnovers, pendingMessages, empty: isEmpty };
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
  const lines: string[] = [];
  lines.push(
    `[OPERATIONAL AGENDA — live Koast data for this host. Koast IS the operating layer; this is in-house. The booking ids below are AGENT-INTERNAL: use them only as tool-call arguments, and NEVER show an id to the host. Refer to guests by first name and properties by nickname.]`,
  );
  lines.push(`Today: ${rollup.today}. Window: today + next 48h.`);

  if (rollup.empty) {
    lines.push(
      `Nothing on the calendar in the next 48h — no check-ins, check-outs, turnovers, or guests awaiting reply.`,
    );
  } else {
    if (rollup.checkIns.length) {
      lines.push(
        `Check-ins (${rollup.checkIns.length}): ` +
          rollup.checkIns
            .map((c) => `${c.guest} arriving at ${c.property}${c.numGuests ? ` (${c.numGuests} guests)` : ""} on ${c.date} (internal booking id for tools: ${c.bookingId})`)
            .join("; "),
      );
    }
    if (rollup.checkOuts.length) {
      lines.push(
        `Check-outs (${rollup.checkOuts.length}): ` +
          rollup.checkOuts
            .map((c) => `${c.guest} leaving ${c.property} on ${c.date}${c.turnoverScheduled ? " (turnover scheduled)" : " (no turnover scheduled)"} (internal booking id for tools: ${c.bookingId})`)
            .join("; "),
      );
    }
    if (rollup.turnovers.length) {
      lines.push(
        `Turnovers (${rollup.turnovers.length}): ` +
          rollup.turnovers
            .map((t) => `${t.property} on ${t.date}${t.time ? ` at ${t.time}` : ""}${t.cleanerAssigned ? ", cleaner assigned" : ", NO cleaner assigned"}`)
            .join("; "),
      );
    }
    if (rollup.pendingMessages.length) {
      lines.push(
        `Guests who may be awaiting a reply (${rollup.pendingMessages.length}; heuristic — present softly, e.g. "looks like X may be waiting"): ` +
          rollup.pendingMessages
            .map((m) => `${m.guest} at ${m.property} — "${m.preview}" (internal booking id for tools: ${m.bookingId})`)
            .join("; "),
      );
    }
  }

  if (gaps && gaps.total > 0 && gaps.missing > 0) {
    lines.push(
      `Property gaps: ${gaps.missing} of ${gaps.total} properties are missing check-in essentials (door/access, wifi, or parking) — drafting guest messages for those is limited until filled.`,
    );
  }

  lines.push(`[end operational agenda]\n\n`);
  return lines.join("\n");
}
