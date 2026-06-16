# P7-ONBOARDING — phase report

Closes the launch blocker: a brand-new account could not reach a working Today.
Investigation + ultraplan: `docs/koast-v1-p7-onboarding-investigation-and-ultraplan.md`.
Built merge-on-green, hard gates only (tsc + lint + full jest). Decisions per
Cesar's §7 sign-off.

## P7 — COMPLETE (final summary)
A brand-new account now goes: **fresh signup → first-run card → wizard →
property visible on Today → tap the access nag → fill the form → nag clears +
the check-in draft gate stops demanding it → Calendar shows seeded rates →
Pricing produces recs (marked low-confidence while comps are thin).** Everything
shipped merge-on-green; commits in each section below.

1. **Entry point (P7.1, `db983b1`)** — first-run "Add your first property" card
   on the empty Today → the (previously unreachable) `/onboarding` wizard;
   `todayView` keeps first-run distinct from all-set.
2. **Bootstrap + timezone invariant (P7.2, `db983b1`)** — one shared
   `bootstrapNewProperty` on all four creation paths sets a non-null IANA tz
   (offline `tz-lookup`), ensures `property_details`, seeds `calendar_rates` when
   a base rate is given. tz-never-null makes the property agenda-visible.
3. **iCal-on-Free + channel connect (P7.3, `9c7d65b`)** — iCal is the Free path;
   Booking.com two-way is the post-onboarding connect (scaffold-on-connect);
   Airbnb deferred behind `KOAST_ENABLE_AIRBNB_CONNECT` (off).
4. **Plan gating (P7.4, `9c7d65b`)** — property #1 onboards on Free, no Stripe;
   the quota trigger caps Free at 1 with a friendly 403.
5. **Store read-bridge (P7.5, `c8d9709`)** — the capability gate (Today nag + the
   M8 C3 check-in draft gate) now reads `property_details` too, so filling the
   host access form clears the nag AND lets the agent draft; the nag is a tappable
   deep-link. Wizard base-rate field seeds the Calendar.
6. **Validator broadened (`koast-workers bc5bc8b`)** — daily validator covers ALL
   properties (calendar_rates baseline for non-Channex), `--all-properties` now on
   the timer ExecStart (detector on); generation does NOT widen apply.
7. **Low-confidence chip (`cef424e`)** — "Early estimate" chip + rationale note on
   recs and auto-proposals when comps are insufficient; verified live (3 capped,
   chipped proposals).
8. **Pattern named + swept** — tz-skip / store-split / validator-filter are one
   class (works for the founding 2, silent no-op for new hosts). Only the
   validator was an active dead-end; **`koast-workers/db.py get_active_properties()`
   is the same shape but DEAD (no callers) — noted as a latent trap**;
   reviews/messages sync filter to channex by design.

## What shipped

### P7.1 + P7.2 — entry point + the never-null-timezone invariant (`db983b1`)
The two stacked dead-ends, both closed.

**P7.1 (entry).** A 0-property account now sees a first-run **"Add your first
property"** card on Today (→ the `/onboarding` wizard, which was fully built but
had **zero** inbound links). `hasNoProperties` is threaded
`readTodayHome → TodayHomeServer → TodayHome` as a signal distinct from the
agenda's `empty`, so the first-run state can never collapse into "you're all
set" (a property with nothing scheduled). Pure `todayView()` helper pins that
distinction in a unit test (no DOM needed). Onboarding step-label off-by-one
fixed (retired "Messages"; Done is index 4).

**P7.2 (invariant).** One shared `bootstrapNewProperty()` runs on **every**
creation path:
- **timezone is NEVER null** — offline `tz-lookup` from coords, country /
  launch-region fallback, set only when missing (never clobbers a host-set tz).
  `buildAgendaRollup` skips null-tz properties, so a null tz made a
  freshly-added property invisible to Today/Calendar/Pricing — that was dead-end
  #2. Now structurally impossible.
- a `property_details` row is ensured.
- when a base rate is known, the `calendar_rates` base layer is seeded
  (idempotent, never clobbers).

No divergent add-paths: the wizard + manual form go through one server
chokepoint (`POST /api/properties` → INSERT + bootstrap); `import-from-url` and
`channex/import` call bootstrap inline. `tz-lookup` added (small, pure, offline,
zero-dep) per the approved decision.

### P7.3 + P7.4 — channel-connect discoverability + Free-tier honesty (`9c7d65b`)
- **BDC connect discoverability:** the wizard's Done step now offers a "Connect
  Booking.com for two-way sync" CTA → the property page (where the proven
  self-service `BookingComConnect` flow lives, which scaffolds a Channex
  property on demand for a fresh property).
- **Airbnb connect DEFERRED** behind `isAirbnbConnectEnabled()` (env
  `KOAST_ENABLE_AIRBNB_CONNECT`, default OFF) — `src/lib/channels/connect-flags.ts`.
  v1 onboarding = iCal (Free) + Booking.com two-way. Airbnb fresh-tenant OAuth is
  unproven external provisioning and gets its own focused spike against a test
  tenant; a stranger's first five minutes must not ride on it.
- **Free-tier honesty:** property #1 onboards on **Free** (no Stripe dependency)
  — the create route does not gate on Pro; the `enforce_property_quota` trigger
  caps Free at 1 and the route surfaces it as a friendly 403. The Done step
  states "Free plan includes 1 property."

### P7.5 — access-info item actionable + self-clearing; Calendar seed (`c8d9709`)
Surfaced during Cesar's first-look probe: the Today "missing check-in details"
item wasn't tappable, AND it sat on a real disconnect — the item
(`classifySufficiency` → `evaluateCapabilities`) and the M8 C3 check-in draft
gate read **memory_facts** capabilities, while the host access-info form
(`/api/properties/[id]/access`) writes **property_details** columns (which the
draft route ALSO reads for the actual content). So the gate checked a different
store than where the content lives.
- **Read-bridge** (no memory_facts writes): `evaluateCapabilities` now also
  accepts `property_details`; a capability is present if EITHER a memory_fact OR
  the matching column carries it. `checkRequiredCapabilities` +
  `classifySufficiency` fetch and pass it. Filling the form now clears the Today
  item AND keeps the check-in draft gate consistent with the content it reads.
- **Tappable**: the item deep-links → `/properties/[id]?settings=access`
  (`essentialsHref` + a nickname→id map; falls back to `/properties`).
- **Calendar seed**: a "Base nightly rate" field in the wizard → bootstrap seeds
  the `calendar_rates` base layer, so a wizard-created property's Calendar isn't
  empty.
- Full memory_facts convergence (one store) is a later phase; the read-bridge is
  the launch-correct, low-risk fix. +10 tests.

## The "original-2-only" pattern — named + swept (P7 readiness class)
The three P7 dead-ends are one class: **works for the original two properties,
silently no-ops for a new host.** Each is a path that assumed the seeded state
of the founding fleet (Airbnb-Channex-connected, timezone set, capabilities in
memory_facts) and quietly produced nothing for a property that lacks it — no
error, just absence. This is *the* external-user-readiness risk.
- **tz-skip** — agenda skipped null-tz properties (P7.2: tz never null).
- **store-split** — capability gate read memory_facts; host form wrote
  property_details (P7.5: read-bridge).
- **validator-filter** — recs only for Airbnb-Channex properties (below).

**Sweep of every place with this shape** (koast `src/` + `koast-workers/`):
- **ACTIVE dead-ends found: only the validator** (now fixed). Its enumeration is
  dynamic (no hardcoded ids) but filtered to `channex_property_id IS NOT NULL AND
  channel_code='ABB' AND rate_plan_id` — evidence: the exact query run against
  prod returns only the 2 founding properties; the new property is
  `validator_covers=false`.
- **Dead code (latent, no callers): `koast-workers/db.py` `get_active_properties()`**
  filters `WHERE channex_property_id IS NOT NULL` — unused (no caller); left in
  place but noted as a trap if ever wired up. `get_all_properties()` is the
  unfiltered sibling.
- **By-design (not dead-ends): `reviews/sync.ts` + `messages/sync.ts`** filter to
  channex properties — correct, an iCal host carries no OTA messages/reviews
  (that's the Free-tier reality, not an accident).
- **Benign:** mock fixtures, comment-example ids, the channel-specific ops
  (connect/sync/status/group-token/auto-scaffold) correctly scoped to channex,
  and one internal cert-runner that hardcodes a property id (internal tool only).

### Validator fix (`koast-workers bc5bc8b`)
Recs now generate for **every onboarded property** (read-only insight; *apply*
stays Channex/Pro-gated). `--all-properties` broadens the target set; the
current-rate baseline is the live Airbnb rate when connected, else the
`calendar_rates` base layer (seeded by `bootstrapNewProperty`). Gated/opt-in so
the daily timer is unchanged until the ExecStart adds the flag; `--property` +
`--skip-detector` + `--dry-run` make controlled runs safe.

**Controlled run evidence** (`--all-properties --property <new> --skip-detector`):
the new Free/iCal property produced **60 pricing_recommendations** (current-rate
coverage 60 from the calendar_rates baseline, live=0), **no proposals/bells**.

**Guardrails:**
- *Apply surface NOT widened* — `applyOtaRestrictions` belt 3 refuses a
  no-Channex property (`property_not_connected`) even with the OTA flag ON;
  `isOtaWriteEnabled` delegates to the single gate. Generation ≠ apply.
- *Coherent + low-confidence, SURFACED* — the new property's recs are coherent
  (140–150 around a 150 baseline; max 6.7% delta). Low confidence (`competitor.
  confidence=0` / `comp_set_insufficient`) is now rendered as an **"Early
  estimate" chip** (shared `isLowConfidenceRec` predicate) on BOTH surfaces:
  `WhyThisRate` (the Pricing review panel) and the auto-proposal
  `CalendarChangeBlock` (+ a low-confidence note folded into the proposal
  rationale). Fallback comps (confidence 0.5) are not flagged. `cef424e`.

**Timer enabled + auto-wave verified.** The daily service ExecStart now runs
`--all-properties` (detector ON), so new hosts get recs on the 06:00 ET tick.
Controlled detector run on the new property: **3 proposals** (cap is 8 — no
flood), **all carrying the chip** (`lowConfidence=true`) and the rationale note,
coherent ("drop $150 → $145 to fill a gap night"). Apply stays refused
(no-Channex). **P7 is done.**

## Deferred (flagged, not silently dropped)
- **Airbnb new-host connect** — behind the flag above; its own spike.
- **Persistent sidebar "Add property" item** — deferred. It's awkward under the
  1-property Free cap v1 launches on (a Free host with their 1 property can't add
  another) and tangles with the tab-visibility filter. The first-run card +
  the `/properties` "Add property" modal cover discoverability for v1. Add the
  persistent item when Pro/multi-property unlocks (it pairs with the quota lift).
- ~~**Wizard base-rate field**~~ — DONE in P7.5c (the wizard now collects an
  optional base nightly rate → bootstrap seeds the Calendar grid).
- **Pricing recommendations for new-host properties** — a brand-new property has
  `pricing_rules` auto-created on first Pricing-tab visit, but **0
  recommendations** until the daily VPS validator runs (6am ET). Could not read
  `pricing_validator.py` from the dev box (no SSH to the Virginia VPS), so
  **verify the validator's property query enumerates ALL properties (new hosts
  included), not just the original fleet, before host #2** — observe whether the
  new test property gets recs after the next 6am ET / 10:00 UTC run, or check on
  the VPS directly. A hardcoded/host-filtered query would be a one-line VPS fix.

## LIVE new-host acceptance probe (run with Cesar)
Fresh account → working Today, then the paused A5 billing gate. Each step has a
verifiable expectation.

1. **Fresh signup.** New email → verify → land on `app.koasthq.com`.
   - EXPECT: Today shows the greeting + the **first-run card** ("Add your first
     property"), NOT "you're all set".
2. **Enter the wizard.** Tap the card → `/onboarding`. Pick "I have an
     Airbnb listing" (iCal path) → name + address (autocomplete) → Continue.
   - VERIFY (DB): the new `properties` row has **`timezone` non-null**, owned by
     the new user.
3. **Calendar.** Paste an Airbnb iCal export URL → Test Connection.
   - EXPECT: bookings import (if the feed has any).
4. **Details.** Optionally fill wifi/door/parking → Save (or Skip).
   - VERIFY (DB): a `property_details` row exists for the property.
5. **Finish → Dashboard.**
   - EXPECT: the first-run card is GONE; the property is agenda-visible (its
     check-ins/turnovers show if the iCal had upcoming bookings; otherwise the
     calm "all set" state — but the property is no longer invisible).
   - EXPECT (P7.5): if access info is blank, "missing check-in details" shows as
     a TAPPABLE item → the access form. Fill door/wifi/parking → the item CLEARS
     on next load (and the agent can now draft check-in messages). If a base
     rate was entered in the wizard, the Calendar grid is populated.
6. **(P7.3, hard-floor, gated like A4) BDC fresh-connect.** On the property page →
   Connect Booking.com → Hotel ID → the connect flow **scaffolds a Channex
   property** (the never-run-on-a-fresh-property path) → test → activate.
   - VERIFY: a Channex property/room/rate-plan got provisioned; BDC side reflects
     the push; `property_channels` row authorized. Controlled + independently
     verified, exactly like A4.
7. **(A5) Billing gate.** With a Free property now existing, exercise the paused
   A5 Channex-gated surface.

## NEEDS-CESAR (for the probe)
- A throwaway email for the fresh account.
- An iCal export URL for the test property (step 3).
- A Booking.com Hotel ID for the fresh-connect test (step 6) — or confirm we run
  step 6 against an existing test hotel.
- (carryover) Stripe test-mode env for the full A5 billing exercise; PITR toggle.
