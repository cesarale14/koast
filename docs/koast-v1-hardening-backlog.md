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

- P3.2 notify_cleaner — extract `notifyCleaner(svc,{taskId,hostId})` from
  /api/turnover/notify; register (otaTouching:false); + `propose_notify_cleaner`.
- P3.2 send_guest_reply — proposals-lane action reusing `proposeGuestMessageHandler`
  (the M7 Channex send single-writer) via an adapter (idempotency from
  proposals.result, not artifact.commit_metadata). Run `applyOutputJudges(
  'host-to-guest')` (J1-J6) at propose-time + the publisher-category hard-refusal
  (`classifyPublisherCategory` → refusal_envelope) at loop pre-dispatch (extend
  the propose_guest_message intercept). Retire propose_guest_message exposure.
  Strictly host-gated; NO auto-approve (J3 fail-open valid only while host
  approval gates the send).
- P3.2 OTA trio (block_dates / adjust_price / set_min_stay) — **HARD-FLOOR TIER 1
  (BDC clobber class); full Phase-1-STOP rigor.** otaTouching:true, stakesClass
  'high'. Extract shared apply lib fns from /api/pricing/apply +
  /api/calendar/rates/apply + /api/channels/rates (route-inline today); ALL route
  through `buildSafeBdcRestrictions` (block uses availability=0, NEVER stop_sell;
  the non-BDC room-type `updateAvailability` path is the documented un-wrapped
  KNOWN GAP — wrap before any flag-flip). Built fully + mock-tested + EXECUTION-
  IMPOSSIBLE while OTA off. Add a `calendar_change` block kind for block/min_stay
  display. **ProposalCard executable gate:** add `otaTouching`+`executable` to
  NormalizedProposal (server-side, via getProposalActionDef + isOtaWriteEnabled);
  ProposalCard hides/disables Approve when !executable (Dismiss stays live).
  **R-5:** unify `isOtaWriteEnabled` ('1'||'true') with `isCalendarPushEnabled`
  ('true' only) so the proposal-side gate and the route agree.
- P3.1 remaining reads — bookings-list (greenfield query), threads-list,
  calendar-rates (two-tier), property-access, channel-sync health (pure
  property_channels read, NOT GET /api/channels which writes on stale-read),
  proposals — each reuse/extract the surface query (no parallel logic).
- P3.3 emission discipline — the seed shipped (the "# Proposing operational
  actions" prompt section + propose_assign_cleaner's description). Extend the
  prompt + add discipline tests as the write set grows.

**NEEDS-CESAR:** flip `KOAST_ENABLE_RENDER_AGENDA` in Vercel to light up the
generative-UI line (agenda + block-reads) in prod (existing flag, ships dark).

---

## P3 — surfaced during the visibility diagnostic (2026-06-11)

### H3.1 — `user_preferences` table does not exist in prod → auto-approve reads a phantom table
- **Source:** the propose_assign_cleaner visibility diagnostic (2026-06-11). While confirming the agent→host proposal seam, a direct prod query found NO preferences table at all (`information_schema` has zero `%pref%` tables in `public`), yet `isAutoApproveEnabled` in `src/lib/proposals/server.ts` reads `from("user_preferences").select("preferences")`. CLAUDE.md's 30-table list (verified 2026-04-17) names `user_preferences`, so it was either dropped since or never created in this project.
- **Severity:** low TODAY (safe by construction), latent MEDIUM. The read destructures only `data` and ignores `error`; a PostgREST 404 returns `{data:null}` (does not throw), so `isAutoApproveEnabled` returns `false` — the safe default (all auto-approve OFF). createProposal is unaffected. BUT: (a) every agent/worker/system proposal create logs a silent PostgREST error; (b) the auto-approve feature is dead — when it ships (the Settings toggle `getProposalActionMeta` already feeds), it will read/write a phantom table and silently never enable. OTA auto-approve is doubly safe regardless via the `def.otaTouching && !isOtaWriteEnabled()` short-circuit BEFORE the read.
- **Fix:** decide the home for per-host auto-approve prefs — either (a) a migration creating `user_preferences(user_id uuid pk, preferences jsonb)` (RLS host-scoped), or (b) repoint `isAutoApproveEnabled` + the Settings writer at `host_state` (the `20260511010000_add_host_state_table.sql` table) if that's the canonical per-host KV. Until then, the safe-default behavior holds; do NOT enable any auto-approve UI claiming to persist.
- **Test:** an `isAutoApproveEnabled` unit asserting a missing-table/`error` read yields `false` (pin the safe default), plus a migration smoke once the table lands.
- **Files:** `src/lib/proposals/server.ts` (`isAutoApproveEnabled`), wherever the auto-approve Settings writer lands.

---

## Notes
- This list is the durable home for cross-phase deferrals. Inline-fixable items
  are fixed in their slice; only items that genuinely belong to a later phase
  land here.
