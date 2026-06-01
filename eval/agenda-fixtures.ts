/**
 * agenda-fixtures — seed two synthetic hosts for the agenda eval, idempotently
 * in STAGING. NOT a generic harness file (agenda-specific); the reusable rig
 * is eval/lib/*.
 *
 *   ERWIN — a busy host: 2 check-ins today, 1 checkout tomorrow, 1 guest
 *           message awaiting reply (with a thread, for the drill-down/
 *           read_guest_thread composition test), 1 scheduled turnover.
 *   EMPTY — a host with a property but NO upcoming activity in the window
 *           (the "nothing in the next 48h, NOT 'I don't have visibility'" case).
 *
 * Dynamic-imported after loadEvalEnv(). All ids fixed for idempotent upsert;
 * the host ids are resolved from auth (stable per email).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PW = "Koast-Eval-pw-7f2a9c1b3d";

// Fixed row ids (idempotent upsert).
const P_VILLA = "e0000000-0000-4000-8000-0000000000a1"; // Villa Erwin (Tampa)
const P_BAYSIDE = "e0000000-0000-4000-8000-0000000000a2"; // Bayside Bungalow
const P_EMPTY = "e0000000-0000-4000-8000-0000000000b1"; // Quiet Cabin (empty host)
const B_ERWIN = "e0000000-0000-4000-8000-0000000000c1"; // check-in today, has thread
const B_SARA = "e0000000-0000-4000-8000-0000000000c2"; // check-in today
const B_MIKE = "e0000000-0000-4000-8000-0000000000c3"; // checkout tomorrow
const T_ERWIN = "e0000000-0000-4000-8000-0000000000d1"; // Erwin's message thread
const M_ERWIN = "e0000000-0000-4000-8000-0000000000e1"; // Erwin guest msg 1 (earliest)
const M_ERWIN_2 = "e0000000-0000-4000-8000-0000000000e2"; // host reply
const M_ERWIN_3 = "e0000000-0000-4000-8000-0000000000e3"; // Erwin guest msg 2 (latest)
const CT_TURN = "e0000000-0000-4000-8000-0000000000f1"; // turnover for Mike's checkout
// Day-boundary fixture (deterministic tz test).
const P_BND = "e0000000-0000-4000-8000-0000000000b9"; // EDT property
const B_BND = "e0000000-0000-4000-8000-0000000000c9"; // check-in on the EDT-local "today"
// Nameless / today-only fixture (iCal-shaped, the real-prod majority case).
const P_NAMELESS = "e0000000-0000-4000-8000-0000000000ba"; // Seaside Cottage (EDT)
const B_NL1 = "e0000000-0000-4000-8000-0000000000cd"; // nameless checkout today
const B_NL2 = "e0000000-0000-4000-8000-0000000000ce"; // nameless checkout today
/** Property nickname the GROUNDED answer must surface for the nameless host. */
export const NAMELESS_PROPERTY = "Seaside Cottage";
// Checkout-split fixture (mirrors prod: MULTI-property + mixed days under one
// window "Check-outs (N)" header). Property A: 2 checkouts today + 1 on
// today+2. Property B: 1 checkout today. Nothing tomorrow.
const P_SPLIT_A = "e0000000-0000-4000-8000-0000000000bb"; // Harbor House (EDT)
const P_SPLIT_B = "e0000000-0000-4000-8000-0000000000bc"; // Dockside Flat (EDT)
const B_SP1 = "e0000000-0000-4000-8000-0000000000d5"; // A: Jeremy, checkout today (named)
const B_SP2 = "e0000000-0000-4000-8000-0000000000d6"; // A: nameless, checkout today
const B_SP3 = "e0000000-0000-4000-8000-0000000000d7"; // B: nameless, checkout today
const B_SP4 = "e0000000-0000-4000-8000-0000000000d8"; // A: nameless, checkout on today+2
export const SPLIT_PROPERTY_A = "Harbor House";
export const SPLIT_PROPERTY_B = "Dockside Flat";
/** Injected "now": 00:30 UTC = 8:30pm EDT the PREVIOUS day. The window must
 * resolve to the EDT-local date (BOUNDARY_LOCAL_TODAY), not the UTC date. */
export const BOUNDARY_NOW_ISO = "2026-05-31T00:30:00.000Z";
export const BOUNDARY_LOCAL_TODAY = "2026-05-30"; // EDT-local date at BOUNDARY_NOW
export const BOUNDARY_UTC_TODAY = "2026-05-31"; // the WRONG (UTC) date

export const ERWIN = {
  email: "e2e-erwin@koast-eval.local",
  // Natural-reference terms the GROUNDED answer must surface (no ids):
  groundingTerms: ["Erwin", "Sara"], // the two check-ins-today guests by first name
  villaName: "Villa Erwin",
  bookingErwin: B_ERWIN,
};

export const EMPTY = {
  email: "e2e-empty@koast-eval.local",
};

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function ensureUser(admin: SupabaseClient, email: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`[eval] ensureUser failed for ${email}: ${created.error?.message ?? "unknown"}`);
}

// All fixture properties are America/New_York, and the agenda windows per
// property tz — so "today" must be the property-LOCAL date, not the UTC date.
// (Using UTC made the eval fragile to the hour: in the evening UTC, UTC-today is
// EDT-tomorrow, so the seeded "today" items landed on the agenda's UPCOMING and
// TODAY was empty — emptying overviews and suppressing the card.)
const FIXTURE_TZ = "America/New_York";
function dateStr(offsetDays: number): string {
  const todayLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: FIXTURE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${todayLocal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export interface SeededHosts {
  erwinHostId: string;
  emptyHostId: string;
}

export async function seedAgendaFixtures(admin: SupabaseClient): Promise<SeededHosts> {
  const erwinHostId = await ensureUser(admin, ERWIN.email);
  const emptyHostId = await ensureUser(admin, EMPTY.email);

  const today = dateStr(0);
  const tomorrow = dateStr(1);
  const threeAgo = dateStr(-3);
  const inThree = dateStr(3);
  const inFour = dateStr(4);
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must = (label: string, res: { error: any }) => {
    if (res.error) throw new Error(`[eval seed] ${label} failed: ${res.error.message ?? JSON.stringify(res.error)}`);
  };

  // Both hosts → business tier. The enforce_property_quota trigger is a
  // BEFORE-INSERT that counts existing rows, so re-upserting even a free host's
  // single property trips `count >= limit` on the 2nd run (works once at 0,
  // fails after). business = unlimited makes re-seeding idempotent. Tier is
  // irrelevant to the empty-agenda assertion (no bookings either way).
  must("user_subscriptions", await admin.from("user_subscriptions").upsert(
    [
      { user_id: erwinHostId, tier: "business" },
      { user_id: emptyHostId, tier: "business" },
    ],
    { onConflict: "user_id" },
  ));

  // Properties.
  must("properties", await admin.from("properties").upsert([
    { id: P_VILLA, user_id: erwinHostId, name: ERWIN.villaName, city: "Tampa", state: "FL", timezone: "America/New_York" },
    { id: P_BAYSIDE, user_id: erwinHostId, name: "Bayside Bungalow", city: "Tampa", state: "FL", timezone: "America/New_York" },
    { id: P_EMPTY, user_id: emptyHostId, name: "Quiet Cabin", city: "Asheville", state: "NC", timezone: "America/New_York" },
  ], { onConflict: "id" }));

  // Bookings: 2 check-ins today (Erwin, Sara), 1 checkout tomorrow (Mike).
  must("bookings", await admin.from("bookings").upsert([
    { id: B_ERWIN, property_id: P_VILLA, platform: "airbnb", guest_name: "Erwin Brandt", guest_first_name: "Erwin", guest_last_name: "Brandt", check_in: today, check_out: inFour, num_guests: 3, status: "confirmed" },
    { id: B_SARA, property_id: P_BAYSIDE, platform: "airbnb", guest_name: "Sara Lopez", guest_first_name: "Sara", guest_last_name: "Lopez", check_in: today, check_out: inThree, num_guests: 2, status: "confirmed" },
    { id: B_MIKE, property_id: P_VILLA, platform: "airbnb", guest_name: "Mike Jones", guest_first_name: "Mike", guest_last_name: "Jones", check_in: threeAgo, check_out: tomorrow, num_guests: 4, status: "confirmed" },
  ], { onConflict: "id" }));

  // Erwin's message thread + a pending inbound guest message (latest = guest).
  must("message_threads", await admin.from("message_threads").upsert([
    { id: T_ERWIN, property_id: P_VILLA, booking_id: B_ERWIN, channex_thread_id: "eval-thread-erwin", channel_code: "abb", provider_raw: "AirBNB", message_count: 3, unread_count: 1, last_message_preview: "Also — is parking included?", last_message_received_at: nowIso },
  ], { onConflict: "id" }));
  // A 3-message back-and-forth. The LATEST is the guest (keeps Erwin flagged
  // as awaiting reply for the pending-message heuristic), and the earlier
  // messages are NOT in the one-line agenda preview — so "show me the full
  // thread" genuinely requires read_guest_thread (the composition test).
  const t = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  must("messages", await admin.from("messages").upsert([
    { id: M_ERWIN, property_id: P_VILLA, booking_id: B_ERWIN, thread_id: T_ERWIN, platform: "airbnb", direction: "inbound", sender: "guest", sender_name: "Erwin", content: "Hi! What time can we check in? We're landing around 1pm.", created_at: t(120), channex_inserted_at: t(120) },
    { id: M_ERWIN_2, property_id: P_VILLA, booking_id: B_ERWIN, thread_id: T_ERWIN, platform: "airbnb", direction: "outbound", sender: "property", sender_name: "Host", content: "Hi Erwin! Standard check-in is 4pm — I'll see if an earlier arrival works and confirm.", created_at: t(60), channex_inserted_at: t(60) },
    { id: M_ERWIN_3, property_id: P_VILLA, booking_id: B_ERWIN, thread_id: T_ERWIN, platform: "airbnb", direction: "inbound", sender: "guest", sender_name: "Erwin", content: "Great, thanks! Also — is parking included at the villa?", created_at: t(5), channex_inserted_at: t(5) },
  ], { onConflict: "id" }));

  // Turnover scheduled for Mike's checkout tomorrow (pending).
  must("cleaning_tasks", await admin.from("cleaning_tasks").upsert([
    { id: CT_TURN, property_id: P_VILLA, booking_id: B_MIKE, status: "pending", scheduled_date: tomorrow, scheduled_time: "11:00:00" },
  ], { onConflict: "id" }));

  // Verify the seed actually landed under the resolved host id (the silent-
  // failure guard that bit the first GREEN run).
  const { count } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", erwinHostId);
  console.log(`seeded: erwin=${erwinHostId} (properties=${count ?? 0}), empty=${emptyHostId}`);

  return { erwinHostId, emptyHostId };
}

/**
 * Seed the day-boundary fixture: an EDT (America/New_York) property + a booking
 * checking in on the EDT-local "today" (2026-05-30). buildAgendaRollup(now=
 * BOUNDARY_NOW) must window in the property's tz and include this booking; UTC
 * windowing (the bug) would label "today" as 2026-05-31 and miss it. Returns
 * the boundary host id. Idempotent.
 */
export async function seedBoundaryFixture(admin: SupabaseClient): Promise<string> {
  const hostId = await ensureUser(admin, "e2e-boundary@koast-eval.local");
  const must = (label: string, res: { error: unknown }) => {
    if (res.error) throw new Error(`[eval boundary seed] ${label}: ${JSON.stringify(res.error)}`);
  };
  must("subscription", await admin.from("user_subscriptions").upsert([{ user_id: hostId, tier: "business" }], { onConflict: "user_id" }));
  must("property", await admin.from("properties").upsert([
    { id: P_BND, user_id: hostId, name: "Eastern Edge", city: "Tampa", state: "FL", timezone: "America/New_York" },
  ], { onConflict: "id" }));
  must("booking", await admin.from("bookings").upsert([
    { id: B_BND, property_id: P_BND, platform: "airbnb", guest_name: "Dana Cole", guest_first_name: "Dana", check_in: BOUNDARY_LOCAL_TODAY, check_out: "2026-06-02", num_guests: 2, status: "confirmed" },
  ], { onConflict: "id" }));
  return hostId;
}

/**
 * Seed the nameless / today-only fixture: one property with TWO iCal-sourced
 * checkouts TODAY (guest_name "Airbnb Guest", null first_name — the real-prod
 * majority shape) and NOTHING tomorrow. Exercises (i) graceful no-name
 * rendering (refer by property + action, never a fabricated name or "a guest")
 * and (ii) the today-vs-tomorrow split (today has items, tomorrow is empty —
 * state today's count, don't manufacture an empty "tomorrow" line). Idempotent.
 */
export async function seedNamelessFixture(admin: SupabaseClient): Promise<string> {
  const hostId = await ensureUser(admin, "e2e-nameless@koast-eval.local");
  const must = (label: string, res: { error: unknown }) => {
    if (res.error) throw new Error(`[eval nameless seed] ${label}: ${JSON.stringify(res.error)}`);
  };
  const today = dateStr(0);
  const twoAgo = dateStr(-2);
  must("subscription", await admin.from("user_subscriptions").upsert([{ user_id: hostId, tier: "business" }], { onConflict: "user_id" }));
  must("property", await admin.from("properties").upsert([
    { id: P_NAMELESS, user_id: hostId, name: NAMELESS_PROPERTY, city: "Tampa", state: "FL", timezone: "America/New_York" },
  ], { onConflict: "id" }));
  // Two nameless iCal checkouts today; no tomorrow item.
  must("bookings", await admin.from("bookings").upsert([
    { id: B_NL1, property_id: P_NAMELESS, platform: "airbnb", source: "ical", guest_name: "Airbnb Guest", guest_first_name: null, check_in: twoAgo, check_out: today, num_guests: 2, status: "confirmed" },
    { id: B_NL2, property_id: P_NAMELESS, platform: "airbnb", source: "ical", guest_name: "Airbnb Guest", guest_first_name: null, check_in: twoAgo, check_out: today, num_guests: 3, status: "confirmed" },
  ], { onConflict: "id" }));
  return hostId;
}

/**
 * Seed the checkout-split fixture (mirrors the real-prod shape): MULTI-property
 * + mixed days under one window "Check-outs (4)" header.
 *   Property A (Harbor House): 2 checkouts TODAY (named "Jeremy" + 1 nameless)
 *                              + 1 nameless checkout on today+2.
 *   Property B (Dockside Flat): 1 nameless checkout TODAY.
 *   Nothing tomorrow.
 * Today's checkouts = 3 (2 at A incl. Jeremy, 1 at B); the today+2 item is
 * UPCOMING. The model must state A-today=2, B-today=1, total-today=3, and
 * report the today+2 item as upcoming — never folded into today. This is the
 * shape that broke prod (single-property fixtures don't reproduce the
 * property-level re-bucketing). Idempotent.
 */
export async function seedSplitFixture(admin: SupabaseClient): Promise<string> {
  const hostId = await ensureUser(admin, "e2e-split@koast-eval.local");
  const must = (label: string, res: { error: unknown }) => {
    if (res.error) throw new Error(`[eval split seed] ${label}: ${JSON.stringify(res.error)}`);
  };
  const today = dateStr(0);
  const twoAhead = dateStr(2);
  const threeAgo = dateStr(-3);
  const yesterday = dateStr(-1);
  must("subscription", await admin.from("user_subscriptions").upsert([{ user_id: hostId, tier: "business" }], { onConflict: "user_id" }));
  must("properties", await admin.from("properties").upsert([
    { id: P_SPLIT_A, user_id: hostId, name: SPLIT_PROPERTY_A, city: "Tampa", state: "FL", timezone: "America/New_York" },
    { id: P_SPLIT_B, user_id: hostId, name: SPLIT_PROPERTY_B, city: "Tampa", state: "FL", timezone: "America/New_York" },
  ], { onConflict: "id" }));
  // All check_ins are before today so none is an in-window check-in (isolates
  // the checkout split). Nothing tomorrow (today+1).
  must("bookings", await admin.from("bookings").upsert([
    { id: B_SP1, property_id: P_SPLIT_A, platform: "airbnb", source: "channex", guest_name: "Jeremy Sexton", guest_first_name: "Jeremy", check_in: threeAgo, check_out: today, num_guests: 2, status: "confirmed" },
    { id: B_SP2, property_id: P_SPLIT_A, platform: "airbnb", source: "ical", guest_name: "Airbnb Guest", guest_first_name: null, check_in: threeAgo, check_out: today, num_guests: 3, status: "confirmed" },
    { id: B_SP3, property_id: P_SPLIT_B, platform: "airbnb", source: "ical", guest_name: "Airbnb Guest", guest_first_name: null, check_in: threeAgo, check_out: today, num_guests: 2, status: "confirmed" },
    { id: B_SP4, property_id: P_SPLIT_A, platform: "airbnb", source: "ical", guest_name: "Airbnb Guest", guest_first_name: null, check_in: yesterday, check_out: twoAhead, num_guests: 4, status: "confirmed" },
  ], { onConflict: "id" }));
  return hostId;
}

/** Delete the agent_conversations the eval created for a host (turns cascade).
 * The fixtures themselves are durable (idempotent re-seed). */
export async function cleanupEvalConversations(admin: SupabaseClient, hostId: string): Promise<void> {
  await admin.from("agent_conversations").delete().eq("host_id", hostId);
}
