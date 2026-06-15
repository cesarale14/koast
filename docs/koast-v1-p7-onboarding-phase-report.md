# P7-ONBOARDING — phase report

Closes the launch blocker: a brand-new account could not reach a working Today.
Investigation + ultraplan: `docs/koast-v1-p7-onboarding-investigation-and-ultraplan.md`.
Built merge-on-green, hard gates only (tsc + lint + full jest). Decisions per
Cesar's §7 sign-off.

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
