# Koast v1 — Hardening Backlog (deferred items, by phase)

Deferred hardening/correctness items surfaced during the v1 execution program
(P1–P7), parked to the phase where they're in-scope rather than fixed inline.
Each item carries enough to action it later without re-discovery. Added to as
phases surface deferrals; cleared as the owning phase ships them.

---

## P6 — External-user de-risk

### H6.1 — Channex webhook revision-claim (TOCTOU) — claim-first on `revision_id`
- **Source:** P2 adversarial review (surfaced via the P2.4 booking bell), 2026-06-10. Added to this list per the P3 brief.
- **Severity:** medium. Pre-existing webhook concurrency; P2 only made the symptom host-visible (duplicate "New booking"/"Booking cancelled" bell rows).
- **Issue:** `src/app/api/webhooks/channex/route.ts` dedups a Channex revision by READING `channex_webhook_log` for a prior terminal row (`action_taken IN created|modified|cancelled|skipped_self`) near the top, but the terminal log row is only INSERTed at the very END of the handler — after `channex.getBooking`, room-type fetch, `updateAvailability`, the `pricing_performance` backfill, and (P2.4) the `host_notifications` bell emit. If Channex re-delivers the same revision while the first request is still in-flight (plausible: the sequential Channex round-trips can exceed the webhook timeout), BOTH requests pass the dedup check and BOTH run the full body → duplicate booking bell, duplicate pricing backfill, duplicate availability push.
- **Fix:** claim the revision BEFORE doing the work. Either (a) insert a `processing` marker row for `revision_id` up front and treat a unique-constraint violation as "already being processed → ack + skip", or (b) take a `concurrency_locks` advisory lock keyed `channex_revision:{revision_id}` (mirrors the BDC-connect 60s mutex pattern). Then every side effect — including the bell emit — is gated by the same claim. Also close the documented-but-unimplemented "booking_id + event_type" fallback for deliveries without a `revision_id` (or correct the comment).
- **Test:** simulate two concurrent POSTs of the same revision; assert exactly one terminal log row, one bell row, one availability push.
- **Files:** `src/app/api/webhooks/channex/route.ts` (dedup block ~L171–204; terminal insert ~L453), `supabase/migrations/*concurrency_locks*`.

---

## P3 — remaining (staged for continuation)

P3 ("the agent's hands") shipped its foundation this session and proved the full
architecture end-to-end (read-as-blocks → propose → approve → named-route
execution, injection-hardened). Shipped: P3.4 (guest-content quarantine +
doctrine), P3.1 (read tools `read_turnovers`/`read_pricing` emit P2.2 blocks via
the generalized loop render-detection, gated on `KOAST_ENABLE_RENDER_AGENDA`),
P3.2-seed (`propose_assign_cleaner` — the agent's first write-as-proposal, full
loop), + a review-fix pass. Remaining, by the same locked architecture:

**Write lane (LOCKED): write tools are `requiresGate:false` handlers calling
`createProposal(createdBy:'agent')` — the proposals table (P2.3), NOT the
agent_artifacts D35 fork. Each new `PROPOSAL_ACTIONS` entry's `execute` calls an
EXTRACTED shared lib fn (the assignCleaner pattern; no side-doors).**

### SHIPPED this P3-finish pass (2026-06-11) — see docs/koast-v1-p3-phase-report.md
- ✅ **OTA trio** (block_dates / adjust_price / set_min_stay) — HARD-FLOOR TIER 1.
  Shared writer `src/lib/channex/ota-apply.ts` (BDC→safe-restrictions, block=
  availability=0/never stop_sell); 3-belt execution-impossibility; whiplash-bounded
  adjust_price; `calendar_change` block; `otaTouching`+`executable` on
  NormalizedProposal + ProposalCard gate; **R-5 unified** (isOtaWriteEnabled now
  delegates to isCalendarPushEnabled, "true"-only). Deferrals: H3.2 (non-BDC block
  room-type gap), H3.3 (migrate the 3 legacy apply routes to the shared dispatch).
- ✅ **notify_cleaner** — `notifyCleaner` extracted from /api/turnover/notify;
  action (otaTouching:false, stakes 'low') + `propose_notify_cleaner`.
- ✅ **read_bookings** (first of the P3.1 reads) — upcoming bookings as booking
  blocks, gated dark.
- ✅ Registry-driven lane-level visibility guard + Today route query-contract test
  (the agent→host seam, pinned in CI).
- ✅ **send_guest_reply (focused TIER-1 pass)** — the proposals-lane guest send;
  `propose_guest_reply` tool → `send_guest_reply` action (adapter reusing the M7
  `proposeGuestMessageHandler` single-writer). propose_guest_message RETIRED from
  exposure (registry + prompt); the tool def + post-approval handler + artifact
  route stay intact for in-flight artifacts (R-3). J1–J6 voice judges +
  publisher-category hard-refusal moved to PROPOSE time (judges in the tool via
  `applyOutputJudges('host-to-guest')`; publisher refusal at the loop pre-dispatch
  intercept, extended to the new tool name). `neverAutoApprove` (structural — no
  settings toggle, isAutoApproveEnabled false) so a guest send is NEVER
  auto-approvable; the J3 fail-open contract stays valid by construction. NO
  double-send: atomic claim + the `status='failed' ⟺ not-sent` error-classification
  invariant + result→commit_metadata idempotency. New `guest_reply` block kind for
  the Today/bell card. Deterministic tests only (no live sends; live proof → A3).

### STILL REMAINING (deferred, by the same locked architecture)
- ~~**P3.2 send_guest_reply**~~ — SHIPPED 2026-06-11 (see the ✅ entry above +
  docs/koast-v1-p3-phase-report.md §0a). The remaining guest-reply-specific
  deferrals are the two below (inline ProposalCard + the edit affordance + the
  post-200 limbo follow-up).
- **P3.1 remaining reads** — threads-list (thread block exists; reuse the inbox
  query), calendar-rates (two-tier; price_diff/calendar_change blocks),
  property-access + channel-sync health (need new block kinds; channel-health is a
  pure property_channels read, NOT GET /api/channels which writes on stale-read),
  proposals. Each reuse/extract the surface query (no parallel logic); gated dark.
- **P3.3 inline ProposalCard in the thread** — a proposals-lane proposal still
  renders as a raw tool-call line in chat (it DOES surface on Today + the bell).
  To render it inline: a new SSE event (e.g. `proposal_created` carrying the
  NormalizedProposal) emitted by the loop when a proposals-lane propose tool
  returns {created, proposal_id}, + ChatClient rendering a ProposalCard for it.
  Touches the SSE discriminated-union schema + the core loop + the chat shell —
  a contained but contract-bearing change; do it carefully in its own pass. **For
  send_guest_reply specifically**, this is also where (a) the host EDIT-before-approve
  affordance returns (the retired artifact lane had it; the proposals lane is
  Approve/Dismiss for v1), and (b) the persisted `payload.judge_results` render as
  the confidence badge + judge StatusDot (PendingDraftBubble-style envelope).
- **send_guest_reply post-Channex-200 'approved' limbo** — when the M7 writer's
  Channex call succeeds (200) but a subsequent local-DB step throws, the adapter
  RE-THROWS (fail-safe: the message is on the OTA, so it must NOT become
  re-approvable → no re-send), leaving the proposal in 'approved' with a 500 to the
  host; the webhook reconciles the messages row. Follow-up: a typed
  `PostSendPersistError` thrown at the handler's post-200 DB-failure point carrying
  the channex_message_id, so the adapter can mark the proposal 'executed' (the guest
  DID get the message) instead of re-throwing — cleaner than the limbo, still no
  re-send. Low priority (rare window; safe today).
- **P3.3 discipline fixture tests** — deterministic tests of the emission
  discipline (questions → blocks/prose; one imperative → exactly one proposal;
  refusal over guessing on unresolved referents) via fixture LLM responses through
  the loop. The prompt discipline itself shipped (extended for the OTA + notify +
  guest-reply proposes); the fixture-harness tests are the remaining piece.

**NEEDS-CESAR:** flip `KOAST_ENABLE_RENDER_AGENDA` in Vercel to light up the
generative-UI line (agenda + block-reads incl. read_bookings) in prod (existing
flag, ships dark).

---

## P3 — surfaced during the visibility diagnostic (2026-06-11)

### H3.1 — `user_preferences` table does not exist in prod → auto-approve reads a phantom table
- **Source:** the propose_assign_cleaner visibility diagnostic (2026-06-11). While confirming the agent→host proposal seam, a direct prod query found NO preferences table at all (`information_schema` has zero `%pref%` tables in `public`), yet `isAutoApproveEnabled` in `src/lib/proposals/server.ts` reads `from("user_preferences").select("preferences")`. CLAUDE.md's 30-table list (verified 2026-04-17) names `user_preferences`, so it was either dropped since or never created in this project.
- **Severity:** low TODAY (safe by construction), latent MEDIUM. The read destructures only `data` and ignores `error`; a PostgREST 404 returns `{data:null}` (does not throw), so `isAutoApproveEnabled` returns `false` — the safe default (all auto-approve OFF). createProposal is unaffected. BUT: (a) every agent/worker/system proposal create logs a silent PostgREST error; (b) the auto-approve feature is dead — when it ships (the Settings toggle `getProposalActionMeta` already feeds), it will read/write a phantom table and silently never enable. OTA auto-approve is doubly safe regardless via the `def.otaTouching && !isOtaWriteEnabled()` short-circuit BEFORE the read.
- **Fix:** decide the home for per-host auto-approve prefs — either (a) a migration creating `user_preferences(user_id uuid pk, preferences jsonb)` (RLS host-scoped), or (b) repoint `isAutoApproveEnabled` + the Settings writer at `host_state` (the `20260511010000_add_host_state_table.sql` table) if that's the canonical per-host KV. Until then, the safe-default behavior holds; do NOT enable any auto-approve UI claiming to persist.
- **Test:** an `isAutoApproveEnabled` unit asserting a missing-table/`error` read yields `false` (pin the safe default), plus a migration smoke once the table lands.
- **Files:** `src/lib/proposals/server.ts` (`isAutoApproveEnabled`), wherever the auto-approve Settings writer lands.

### H3.2 — non-BDC (Airbnb/Direct) date BLOCK is the un-wrapped room-type gap — REFUSED today
- **Source:** P3.2 OTA trio (2026-06-11). `applyOtaRestrictions` routes BDC blocks through `buildSafeBdcRestrictions` (availability=0 on the rate-plan restriction). A non-BDC block needs the room-type `/availability` endpoint (`channex.updateAvailability`), which is NOT yet wrapped in a read-first safe pattern (it's the `/activate` 365-day-reopen clobber path). The dispatch currently REFUSES non-BDC availability changes with skip reason `non_bdc_availability_unwrapped` rather than emit an un-wrapped room-type write — fail-closed.
- **Severity:** low (feature gap, not a risk). BDC blocks work; Airbnb/Direct blocks are deferred. Execution is gated off entirely regardless.
- **Fix (before the flag flips, if non-BDC block is wanted):** add a read-first room-type availability wrapper that resolves `room_type_id` (from `channex_room_types`) and ONLY ever writes availability=0 (a monotonic CLOSE structurally cannot re-open a host-closed date — the clobber vector was re-opening). Then route non-BDC blocks through it instead of refusing.
- **Files:** `src/lib/channex/ota-apply.ts` (the `non_bdc_availability_unwrapped` branch), `src/lib/channex/client.ts` (`updateAvailability`).

### H3.3 — three apply routes still carry an inline per-channel dispatch loop — PARTIALLY DONE (P4.3)
- **Source:** P3.2 OTA trio (2026-06-11). `applyOtaRestrictions` is the extracted shared writer the agent's OTA actions use (no side-door). `/api/pricing/apply`, `/api/calendar/rates/apply`, and `/api/channels/rates` still have their OWN inline BDC→safe-restrictions / non-BDC→direct loop (they predate the extraction and have no test net). They already route BDC through `buildSafeBdcRestrictions`, so this is a DRY/maintainability cleanup, not a safety gap.
- **P4.3 progress (2026-06-12):**
  - ✅ `applyOtaRestrictions` extended into the CANONICAL push mechanic: `targetChannels` (channel subset), `capturePriorState` (non-BDC pre-flight for M2 revert), richer result (`targets`, `bdcPlans`, `priorStateByChannel`, `failedByDate`), and per-batch try/catch (partial-failure granularity). Additive — existing OTA-action callers unaffected. Writer tests cover all new features.
  - ✅ `/api/calendar/rates/apply` MIGRATED to the shared writer (characterization test written first, behavior-preserving). Uses `targetChannels` for the master-no-wipe subset.
- **REMAINING (turnkey — the writer already supports both):**
  - `/api/pricing/apply` → call `applyOtaRestrictions({ capturePriorState: true })`; assemble `prior_state` from `result.bdcPlans` (via `priorStateFromBdcPlan`) + `result.priorStateByChannel`; build `pricing_performance` + `calendar_rates` from `result.successByDate` + `result.targets`; preserve the response (`failed_batches` is consumed by `PricingTab.tsx` for the partial-failure count — keep it a non-empty array on failure). Its existing 313-line route test mocks `buildSafeBdcRestrictions` (which the writer still calls) so it should stay green with minimal updates. **Watch:** non-BDC `failedByDate` granularity vs the old per-batch `failed_batches` shape.
  - `/api/channels/rates` POST → single channel: pass `targetChannel: channel_code`; the route keeps its rate-plan auto-discovery + the `calendar_rates` override upsert; build `per_date` + `push_error` + `bdc_plan` from the writer result (`per_date` is consumed by `CalendarSidebar.tsx`, `push_error` by `PerChannelRateEditor.tsx`). **Watch:** the route currently pushes to `pending_authorization` channels too (the writer filters `status='active'`) and groups contiguous BDC date-ranges (the writer uses one min..max span — equivalent for correctness, reads a wider range). Write a characterization test first.
- **Files:** the two remaining routes above; `src/lib/channex/ota-apply.ts` (done).

---

## P3 — surfaced during the send_guest_reply adversarial review (2026-06-11)

### H7.1 — `200-with-no-data` Channex response is system-wide classified as "not sent" (retryable) — double-send hazard
- **Source:** the send_guest_reply 4-lens adversarial review (the named "weakest link" in the at-most-once model), 2026-06-11.
- **Severity:** low (low probability — Channex returns the created entity under `data` on success), latent MEDIUM (a malformed/empty 200 that actually created the message → re-send to a real guest).
- **Issue:** `sendMessage` / `sendMessageOnBooking` (`src/lib/channex/messages.ts:395-398, 433-439`) throw `ChannexSendError("...returned no data", 200, res)` when `res.ok` is TRUE but `res.data` is absent. All three send call sites — the manual send route (`/api/messages/threads/[id]/send`), the M7 artifact approve route (`/api/agent/artifact`), and now the P3.2 `send_guest_reply` adapter — historically treat EVERY `ChannexSendError` as retryable (not-sent). For a genuinely created-but-empty-body 200 that is a potential double-send on retry.
- **Mitigated for the guest-reply lane already:** `send_guest_reply.execute` (`src/lib/proposals/server.ts`) now RE-THROWS a 2xx-status `ChannexSendError` (treats it as ambiguous/maybe-sent → proposal stays 'approved', no re-send) rather than marking it 'failed'/re-approvable. The manual send route + M7 artifact route are NOT yet hardened.
- **Fix (system-wide):** introduce a distinct `AmbiguousSendError` for the `res.ok && !res.data` case in `messages.ts`, and have all three call sites treat it as terminal-no-retry (webhook reconciles) rather than retryable. Supersede with a true Channex idempotency key if/when that endpoint exposes one.
- **Files:** `src/lib/channex/messages.ts`, `/api/messages/threads/[id]/send/route.ts`, `/api/agent/artifact/route.ts`, `src/lib/proposals/server.ts` (already partially mitigated).

---

## Notes
- This list is the durable home for cross-phase deferrals. Inline-fixable items
  are fixed in their slice; only items that genuinely belong to a later phase
  land here.
