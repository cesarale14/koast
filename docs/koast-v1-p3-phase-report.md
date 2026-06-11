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
Focused send_guest_reply pass (later same day): 1209 → **1225** passing, 0 failures.

---

## 0a. FOCUSED PASS — send_guest_reply (HARD-FLOOR TIER 1, retire propose_guest_message)

The brand-critical, prod-validated guest surface. Full Phase-1-STOP rigor +
/ultraplan + self-red-team + an independent 4-lens adversarial review of the diff.

**What shipped:** the agent's host-gated guest SEND moved onto the proposals lane
(P2.3) as the new tool `propose_guest_reply` → action_type `send_guest_reply`,
retiring the M7 gated-artifact `propose_guest_message` from EXPOSURE. Naming follows
the lane convention (propose_X tool → X action, like propose_notify_cleaner →
notify_cleaner).

- **Reuse, no reimplementation.** `send_guest_reply.execute` (the approve-time
  handler) is a thin adapter over `proposeGuestMessageHandler` — the SAME M7 Channex
  send single-writer (cold-send gates, thread materialization, messages upsert,
  actor_kind='agent'). No agent side-door.
- **Voice judges moved to PROPOSE time — closes the load-bearing gap.** Under the old
  tool, J1–J6 did NOT run on the agent path. `propose_guest_reply` now runs
  `applyOutputJudges('host-to-guest')` in the tool handler: J1 (emoji) MUTATES the
  draft so the STORED + SENT text is emoji-clean; J2–J6 ANNOTATE the envelope
  (advisory) and persist as `payload.judge_results` for the deferred inline card.
- **Publisher hard-refusal stays at loop pre-dispatch**, extended to the new tool
  name (`loop.ts` guard now matches `propose_guest_message || propose_guest_reply`)
  — so the §2.3.4 legal/regulatory/licensed-professional categorical refusal AND the
  C3 required-capability check both apply to the new tool with one guard. Defense in
  depth: prompt steers + substrate failsafe.
- **Strictly host-gated, NEVER auto-approvable — structural.** New `neverAutoApprove`
  flag on the action def: `isAutoApproveEnabled` returns false for it WITHOUT reading
  any prefs table, AND `getProposalActionMeta` omits it so the settings toggle never
  renders. The send path is host approval, full stop.
- **NO DOUBLE-SEND (proven, 3 belts).** (1) `/api/proposals/[id]/approve` atomically
  claims pending|failed→approved before executing → at-most-once. (2) The invariant
  **status='failed' ⟺ Channex did NOT send**: execute returns {ok:false} (→failed,
  re-approvable) ONLY for `ChannexSendError`/`ColdSendUnsupportedError` (Channex
  rejected — safe to retry); EVERY OTHER throw (a post-Channex-200 local-DB hiccup)
  RE-THROWS so the proposal stays 'approved' (un-reclaimable) and never re-sends —
  the webhook reconciles the local messages row. Mirrors the artifact lane's
  outer-catch. (3) neverAutoApprove guarantees the approve route is the only
  execution path, so the atomic claim always applies; plus proposals.result threads
  into the handler's commit_metadata idempotency guard.
- **J3 fail-open contract interaction (CLAUDE.md).** Because send_guest_reply is
  structurally neverAutoApprove, host approval remains the gate, the propose-time
  judges stay advisory, and FAIL-OPEN-WITH-FLAG stays VALID — no auto-send call-site
  is created by this change. Forward contract recorded: if send_guest_reply ever
  gained auto-approve (it must not), the J3 contract REQUIRES flipping the judges to
  fail-closed via applyOutputJudges' policyOverride hook FIRST.
- **R-3 in-flight artifacts preserved.** Already-emitted `guest_message_proposal`
  artifacts still approve/edit/discard via the untouched artifact route + handler
  (keyed on artifact.kind / action_kind, NOT the tool name). The retired tool def +
  the post-approval handler stay intact; only the registry exposure is removed.
  `propose_guest_message` was never a base stakes entry, and the approval path makes
  no `getStakesClass` lookup — so unregistering the tool breaks nothing in-flight.
- **New `guest_reply` block kind** (schema + GuestReplyBlock component + registry) so
  the drafted reply renders on Today + the bell ProposalCard (id-lean; booking id
  lives in payload.action).
- **Self-red-team (the 4 named vectors):** injection→steered draft (P3.4 thread
  sanitize+fence + untrusted-doctrine + publisher refusal + the host gate — a steered
  draft only ever lands as a pending proposal, never auto-sends); judge bypass (J1 is
  a deterministic strip; J2-J6 advisory; host is the gate — bounded blast radius);
  double-send (the 3 belts above); channel-calibration regression (D41 migrated
  verbatim; channel resolved from thread into the block). Pinned by deterministic
  tests — NO live guest sends; the live guest-reply proof batches to acceptance A3.

**Files:** new `src/lib/agent/tools/propose-guest-reply.ts`,
`src/components/chat/blocks/GuestReplyBlock.tsx`, + 2 new test suites. Modified
`src/lib/proposals/server.ts` (action + neverAutoApprove + result-threading),
`src/lib/agent/render/blocks.ts` + registry + types, `src/lib/agent/tools/index.ts`
(registry swap), `src/lib/agent/loop.ts` (guard extend),
`src/lib/agent/system-prompt.ts` (tool rewire preserving D41/D18/D27 verbatim, the
coupled .replace() strings kept in lockstep), `src/lib/agent/tools/read-guest-thread.ts`,
`src/lib/agent/tests/system-prompt.test.ts` (rename + a retirement regression guard).

**Independent adversarial review (4 lenses: no-double-send · R-3 in-flight ·
prompt fidelity · J3/judges) returned ZERO blockers, ZERO high** — it confirmed
the core safety model sound (atomic claim + failed⟺not-sent + neverAutoApprove +
R-3) and surfaced hardenings, all taken this pass:
- **2xx-ambiguous re-throw** (the named weakest link): the adapter now treats a
  2xx-status `ChannexSendError` (the "200 with no data" case — Channex accepted,
  maybe created the message) as ambiguous → RE-THROW (no re-send), not 'failed'/
  re-approvable. Only NON-2xx `ChannexSendError` (true OTA rejection) +
  `ColdSendUnsupportedError` (pre-Channex) → re-approvable. System-wide
  `AmbiguousSendError` follow-up across the manual + M7 routes logged as H7.1.
- **Publisher refusal now binds to the tool** (the one medium): `propose_guest_reply.handler`
  re-runs `classifyPublisherCategory` as a failsafe, so the §2.3.4 categorical
  refusal travels WITH the tool (3 loci: prompt + loop intercept + tool), not the
  loop alone.
- **Atomic dismiss**: `/api/proposals/[id]/dismiss` now atomically claims
  pending|failed (mirroring /approve), refusing to dismiss an in-flight 'approved'
  proposal — so a sent guest message can't be mislabeled 'dismissed' by a race.
- **PUT auto-approve rejects neverAutoApprove** at the write boundary (symmetric
  with the GET-side omission — no confusing persisted-but-inert pref).
- Catalog-line accuracy (proposals-lane phrasing, kept in lockstep across the 3
  coupled `.replace()` copies) + comment honesty (the result→commit_metadata
  idempotency is inert-by-construction on this lane; at-most-once rests on the
  claim + invariant).

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

- ~~**send_guest_reply**~~ — SHIPPED this pass (see §0a). propose_guest_message
  retired from exposure; the proposals-lane guest send + propose-time J1–J6 +
  publisher refusal + neverAutoApprove are live.
- **P3.1 remaining reads** — threads-list, calendar-rates, property-access,
  channel-sync health, proposals. Each reuse/extract the surface query; gated dark.
- **P3.3 inline ProposalCard in thread** — render a proposals-lane proposal as a
  ProposalCard inline (it already surfaces on Today + the bell); a contained SSE +
  loop + chat-shell change. Now ALSO carries the send_guest_reply path: the new
  tool surfaces on Today + bell (exactly like propose_assign_cleaner); inline
  rendering = a new `proposal_created` SSE event + ChatClient rendering the
  ProposalCard (+ the persisted `payload.judge_results` confidence/StatusDot
  envelope, PendingDraftBubble-style).
- **send_guest_reply host EDIT-before-approve** — the retired artifact lane had an
  inline Edit affordance; the proposals lane is Approve/Dismiss for v1. Edit lands
  with the inline ProposalCard (above).
- **send_guest_reply post-Channex-200 'approved' limbo** — a local-DB hiccup AFTER a
  Channex 200 leaves the proposal in 'approved' (fail-safe: no re-send; webhook
  reconciles the messages row). Follow-up: a typed PostSendPersistError carrying the
  channex id so execute can mark the proposal 'executed' gracefully instead of
  re-throwing to a 500.
- **P3.3 discipline fixture tests** — deterministic emission-discipline tests via
  fixture LLM responses (the prompt discipline itself shipped, now extended for the
  guest-reply propose).

---

## Slices merged (main)
1. `test(p3)` — agent→host visibility seam + H3.1
2. `fix(p3-ota)` — R-5 gate unification
3. `feat(p3-ota)` — OTA trio
4. `docs(p3)` — OTA deferrals (H3.2, H3.3)
5. `feat(p3)` — notify_cleaner
6. `feat(p3.1)` — read_bookings
7. `feat(p3.2)` — send_guest_reply (retire propose_guest_message; proposals-lane
   guest send + propose-time voice judges + publisher refusal + neverAutoApprove)

HELD for the P4 brief.
