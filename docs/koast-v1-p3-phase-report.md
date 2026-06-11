# Koast v1 — P3 finish pass (the agent's hands) — phase report

**Date:** 2026-06-11 · **Branch:** main · **Mode:** nonstop, merge-on-green, hard
gates only (destructive migrations held, OTA flags OFF, no prod-data mutations,
NEEDS-CESAR for env/secrets). All slices merged green to `main` (auto-deploy).

P3 ("the agent's hands") shipped its foundation in the prior pass (read-as-blocks
→ propose → approve → named-route execution, injection-hardened; `propose_assign_cleaner`
seed). This pass opened with a HIGH prod diagnostic, then drove the staged write
set forward by the same locked architecture: write tools are `requiresGate:false`
handlers calling `createProposal(createdBy:'agent')` against the proposals table
(P2.3); each `PROPOSAL_ACTIONS` entry's `execute` calls an EXTRACTED shared lib fn
(no agent side-doors).

Test trajectory: 1195 → **1209** passing (+14 suites of new coverage), 0 failures.

---

## 0. HIGH diagnostic — agent-created cleaner proposal not visible on Today (prod)

**Symptom (reported):** `propose_assign_cleaner` created a proposal (Karem → Villa
Jamaica 2026-06-11, payload correct) but the host saw NO approval option.

**Root cause (prod row inspected directly):** the DATA LAYER WAS CORRECT.
- Row `8c70c1c0…`, `host_id = 312f9366…` = the host's auth.uid = Villa Jamaica's
  owner. RLS (`auth.uid()=host_id`) passes; the Today GET filter matches. Suspect
  #1 (host_id not stamped → RLS hides it) **FALSE**.
- The `proposal_created` bell event fired (unread). Suspects #2 (query filter) and
  #3 (flag/empty-state) **FALSE** — GET filters host_id+status correctly,
  TodayHome renders the suggests slot, nothing gates it.
- The actual cause was a CLIENT-SIDE STALENESS bug: `TodaySuggests` self-fetched
  its pending list once on mount, so a proposal the agent created from the CHAT
  surface never appeared on an already-mounted Today. The bell (the escape hatch)
  worked — the host approved at 03:46 (audit: actor_kind=host, confirmed). The
  live defect was already fixed by commit `3e1b9f1` (poll + visibility/focus
  refetch + the `PROPOSALS_CHANGED_EVENT` bell nudge), verified wired end-to-end.

**Hardening shipped:** a REGISTRY-DRIVEN lane-level visibility guard — for EVERY
action in `PROPOSAL_ACTIONS`, an agent-created proposal must stamp host_id, land
pending, and fire the bell. The whole staged write set (notify_cleaner, OTA trio)
is held to the seam automatically. Plus a Today route query-contract test (host_id
+ status scoping; NOT created_by — agent proposals can't silently vanish).

**Latent finding (H3.1, backlog):** `user_preferences` does not exist in prod, so
`isAutoApproveEnabled` reads a phantom table — safe today (returns false → the
intended default), latent when an auto-approve UI ships.

---

## 1. OTA trio (block_dates / adjust_price / set_min_stay) — HARD-FLOOR TIER 1

BDC-clobber class; full Phase-1-STOP rigor. Built fully, mock-tested, and
EXECUTION-IMPOSSIBLE while the OTA flag is off.

- **Three independent belts of execution-impossibility**, all reading the unified
  gate: (1) ProposalCard hides Approve when `!executable` (server-computed via
  `getProposalActionDef.otaTouching` + the gate); (2) `executeProposal` hard-refuses
  an otaTouching action while off; (3) `applyOtaRestrictions` self-refuses.
- **R-5 — gate unification.** `isOtaWriteEnabled` now DELEGATES to
  `isCalendarPushEnabled`, so the proposal-side gate and the 8 route-level write
  guards return the identical boolean for every env value (can't diverge). Aligned
  DOWN to the stricter "true"-only route semantics (fail-closed; only the
  undocumented "1" changes — now safe-off on both). `gate-divergence.test.ts` pins
  the full env matrix.
- **Shared single writer** `src/lib/channex/ota-apply.ts` (no side-door): BDC →
  `buildSafeBdcRestrictions` (read-first safe-merge; block = availability=0, NEVER
  stop_sell); non-BDC → direct `updateRestrictions` for rate/min-stay. Non-BDC
  AVAILABILITY (an Airbnb/Direct block) is REFUSED (`non_bdc_availability_unwrapped`,
  H3.2) rather than emit an un-wrapped room-type write — fail-closed.
- **Whiplash bound** on adjust_price at PROPOSE time (`applyPricingRules`: min/max
  + max-daily-delta vs the current applied rate) — the model's raw number can never
  reach a proposal, and thus never Channex, unbounded.
- `calendar_change` block kind (schema + `CalendarChangeBlock` + registry); three
  propose tools registered + advertised; emission discipline extended.

Deferrals: **H3.2** (wrap the non-BDC room-type `/availability` path, write-0-only,
before any non-BDC block ships), **H3.3** (migrate the 3 legacy apply routes to the
shared dispatch; needs route tests first).

---

## 2. notify_cleaner

`notifyCleaner(svc,{taskId,hostId})` extracted from `/api/turnover/notify` (the
route now delegates; behavior-preserving). Action (otaTouching:false, stakes 'low')
+ `propose_notify_cleaner` tool that requires a STAFFED turnover (refuses if no
cleaner is assigned). Auto-covered by the registry-driven visibility guard.

---

## 3. read_bookings (first of the P3.1 remaining reads)

Upcoming bookings (checkout today onward) as id-lean booking blocks; host-scoped
greenfield query with property-name join; exposure-gated on `KOAST_ENABLE_RENDER_AGENDA`
in lockstep with the prompt.

---

## 4. Deferred (precise plans in koast-v1-hardening-backlog.md)

- **send_guest_reply** — DEFERRED to a focused TIER-1 pass. Consult-flagged: the
  send mechanics are a clean reuse of `proposeGuestMessageHandler`, but retiring
  propose_guest_message is high-blast-radius (18 prod sites + 6 test files) on the
  prod-validated, voice-doctrine-heavy guest-messaging surface (intersects the J3
  fail-open contract). Full plan recorded in the backlog.
- **P3.1 remaining reads** — threads-list, calendar-rates, property-access,
  channel-sync health, proposals.
- **P3.3 inline ProposalCard in thread** — render a proposals-lane proposal as a
  ProposalCard inline (it already surfaces on Today + the bell); a contained SSE +
  loop + chat-shell change.
- **P3.3 discipline fixture tests** — deterministic emission-discipline tests via
  fixture LLM responses (the prompt discipline itself shipped).

---

## Slices merged (main)
1. `test(p3)` — agent→host visibility seam + H3.1
2. `fix(p3-ota)` — R-5 gate unification
3. `feat(p3-ota)` — OTA trio
4. `docs(p3)` — OTA deferrals (H3.2, H3.3)
5. `feat(p3)` — notify_cleaner
6. `feat(p3.1)` — read_bookings

HELD for the P4 brief.
