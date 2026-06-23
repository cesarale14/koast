# Channex Known Quirks

Numbered list of places where the API departs from what the docs
suggest, or where behavior has bitten integrators in the past. Each
item: **what you'd expect** → **what actually happens** → **workaround**.

## 1. `filter[restrictions]` is required on GET /restrictions

**Expect:** Like most list endpoints, `filter[property_id]` + date
params return all data for the property.  
**Actual:** Omitting `filter[restrictions]` returns **400 Bad Request**
with details `["restrictions is required"]`.  
**Workaround:** Always send `filter[restrictions]=rate` at minimum, or
`filter[restrictions]=rate,availability,min_stay_arrival,stop_sell`
for the common bundle. Probe-validated 2026-04-24.

## 2. There is no `/restrictions/rooms` endpoint

**Expect:** Symmetry with other resources suggests a "bucketed"
endpoint at `/restrictions/rooms`.  
**Actual:** `GET /restrictions/rooms` → **404 `resource_not_found`**.
Bucketing is a response-shape feature of `/restrictions`, not a
separate endpoint.  
**Workaround:** Always use `/restrictions` with `filter[restrictions]=…`.
The response is already bucketed by rate_plan_id. If you have a client
helper called `getRestrictionsBucketed`, it's just calling the same
endpoint with the filter set — don't search for a second endpoint.
Probe-validated 2026-04-24.

## 3. Rate format dual-accepted, not documented consistently

**Expect:** One canonical rate format.  
**Actual:** POST /restrictions accepts both integer minor units
(`20000` = $200.00) and decimal string (`"200.00"`). GET responses
return decimal string. If you mix parsers (one place assumes
integer-cents, another assumes decimal-dollars), you'll get rates 100×
off.  
**Workaround:** Pick one representation for your codebase and stick
with it. Prefer decimal string on input — it matches the read format
and avoids the cents-vs-dollars ambiguity.

## 4. Webhook event_mask separator: docs show `;`, live uses `,`

**Expect:** Per docs, `event_mask` is semicolon-separated:
`"booking_new;booking_modification"`.  
**Actual:** Production webhooks in the wild use comma-separated:
`"booking_new,booking_modification,booking_cancellation"`. Probe of a
live webhook returned comma form; Channex accepted it at create time.  
**Workaround:** Use comma separators for new webhooks. If updating a
semicolon-created webhook, preserve its separator rather than converting.
The wildcard `"*"` is unaffected.

## 5. Three-way booking ID mismatch

**Expect:** One ID per booking.  
**Actual:** Channex internal `booking_id` (UUID), OTA
`ota_reservation_code` (Airbnb HM-code / BDC numeric string / etc), and
OTA iCal UID (`<hash>@airbnb.com` format from iCal-sourced syncs) are
three separate values that do not translate to each other without an
explicit cross-reference.  
**Workaround:** Store all the IDs you receive. When cross-referencing
entities in Channex (reviews → bookings), use `ota_reservation_code` —
it's the common key. If your booking ingestion is iCal-based and you
store only the UID, you'll have no way to join reviews back to
bookings; switch to `/booking_revisions/feed` or backfill.

## 6. `/reviews` pagination silently caps

**Expect:** `meta.total: 110` means `page[limit]=100&page[number]=2`
returns 10 more.  
**Actual:** Endpoint returns ~10 per page regardless of
`page[limit]`, and `page[number]` doesn't page forward beyond the
first batch — same data, different page number. Result: you can only
GET the first 10 of 110 reviews.  
**Workaround:** The dedup-by-id loop still helps for small property
backlogs, but for large ones you cannot backfill via REST. The
`review` webhook event delivers new reviews in real time —
subscribe to it and accept that pre-subscription reviews require
escalating to Channex support. As of 2026-04-24 this is still the
state.

## 7. `guest_name` on /reviews is often null for Airbnb — iCal cohort permanently anonymous



**Expect:** Airbnb reviews carry the guest's name; Channex exposes it.  
**Actual:** Across 10 a live Airbnb-connected property reviews probed 2026-04-24, every
`guest_name` was null despite Airbnb displaying names in its own UI.
`reviewer_name` / `reviewer` / `guest` are also null — Channex's
`guest_name` is the only guest-identity field and it's unreliable for
Airbnb.  
**Workaround:** Design UIs assuming `guest_name` may be null — fall
back to "Airbnb Guest" or similar. If you need the real name, resolve
via the linked booking (`ota_reservation_code` match) and its
`customer.name`.

**Extension** (probe-validated 2026-04-28 + Andrew/Channex support
confirmation): the booking-link join recovers names ONLY for
guests whose bookings ride through Channex (post-OAuth Airbnb +
all BDC). The **iCal cohort is permanently anonymous** — historical
Airbnb bookings ingested via iCal feed pre-OAuth never received
HM-codes, so `bookings.ota_reservation_code` is NULL for them and
the join fails. After ~50 days post-checkout, even Channex-direct
bookings age out of `/bookings` listings (per quirk #20), and the
review's link target disappears too.

The vendor-confirmed long-term workaround is a host-side manual
override — Andrew at Channex confirmed there's no upstream fix
shipping. Koast's implementation: `guest_reviews.guest_name_override`
column + inline-pencil UI on review cards (override editor — see
the Koast tech-debt entry "session 6.7.x — override editor"). For
the iCal cohort, the host pastes the real name from their Airbnb
host dashboard once per review.

The pre-OAuth → post-OAuth transition is a one-way ratchet: every
review created post-Channex-OAuth can resolve via the join (until
its booking ages out 50 days post-checkout); every review tied to
a pre-OAuth iCal booking is permanently override-only.

## 8. Review `ota_reservation_id` uses confirmation-code format

**Expect:** If your bookings are keyed by iCal UID, reviews will use
the same format.  
**Actual:** `/reviews` exposes `ota_reservation_id` like `HM3KACRAW4`
(Airbnb confirmation code) or `6385131611` (BDC). It matches
`/bookings.ota_reservation_code`, **not** the iCal UID
`<hash>@airbnb.com`.  
**Workaround:** Store both identities on your bookings table — the
iCal UID (if iCal-sourced) and the OTA confirmation code (from
Channex). Or migrate booking ingestion to `/booking_revisions/feed`
which supplies both natively.

## 9. `channel.inventory_mode` is null on live channels

**Expect:** `inventory_mode` is a documented enum (`api | ical |
read-only`) usable as a feature-support signal.  
**Actual:** Probe of a live Airbnb-connected property's Airbnb, BDC, and VRBO channels
(2026-04-24) returned `inventory_mode: null` on all three. The field
exists in the attribute set but isn't populated.  
**Workaround:** Use `channel.is_active` + `channel.settings.token_invalid`
as the health signals. For OTA-specific capability checks (can I send
messages? can I submit guest reviews?), use the OTA name directly.

## 10. Airbnb guest-review submit is bound to an incoming review

**Expect:** You can create a standalone host-review of a guest any
time after checkout.  
**Actual:** Airbnb's two-sided review model requires a paired
incoming review. POST `/reviews/:review_id/guest_review` where
`:review_id` is the incoming (guest-wrote-this-about-property) review
id. No incoming review in Channex ⇒ no path to submit an outgoing one.
BDC has no guest-review capability at all.  
**Workaround:** Don't model "outgoing reviews" as a separate queue
sourced from bookings. Model them as an action on incoming review
cards. For BDC, hide the submit-review affordance.

## 11. `channel.settings` is an open schema — shape varies per OTA

**Expect:** Uniform settings across channels.  
**Actual:** AirBNB has `tokens + token_invalid + scope +
mappingSettings`. BDC has `hotel_id + machine_account +
allow_payout_* + tax_settings + mappingSettings`. VRBO has `password +
sync_days + sync_logic + payout_type`. Field presence is OTA-dependent.  
**Workaround:** Read channel settings per-OTA with a discriminator on
`channel.channel`. Don't try to unify. `mappingSettings` is roughly
consistent but its internal shape differs too.

## 12. `/applications/installed` does not include `is_active`

**Expect:** Docs claim installations have
`{id, property_id, application_code, is_active, settings}`.  
**Actual:** Probe returns `{id, application_code, application_id,
property_id, settings, relationships}` — no `is_active` field. All
installed apps appear to be implicitly active; uninstalled apps don't
appear.  
**Workaround:** Treat "installed = present in the response". Don't
read `is_active`; it's undefined.

## 13. App-gated endpoints return 403 (or 422), not 404

**Expect:** Missing capability endpoints return 404.  
**Actual:** `/message_threads` and `/reviews` require the
`channex_messages` app installed. Without it: **403 Forbidden**. For
OTAs that don't support a capability (e.g. Expedia Affiliate Network
messaging): **422 Unprocessable Entity**. Either can be confusing if
you're debugging a "why is this endpoint broken" and looking for 404.  
**Workaround:** GET `/applications/installed` early in integration
setup. If the app is missing, surface that clearly in your error
handling before letting users hit the endpoints. Monitor for 403s on
Messages/Reviews as a "was the app uninstalled?" signal.

## 14. Rate plans mapped to a channel can't be deleted without force

**Expect:** `DELETE /rate_plans/:id` works.  
**Actual:** If the rate plan is referenced by an active channel
mapping, DELETE fails. Add `?force=true` to unmap + delete in one
call.  
**Workaround:** Either use `?force=true` knowingly, or walk the
channels first to unmap cleanly (PUT each channel with the rate_plan
removed from its `rate_plans` array) and then delete. Same applies to
room types via `/room_types/:id`.

## 15. Unacked booking revisions re-deliver for 30 minutes and then email warn

**Expect:** Feed is fire-and-forget; ack is optional.  
**Actual:** Without ack, `/booking_revisions/feed` keeps returning the
same revision. After 30 minutes of inaction, Channex emails the
account owner a "non-acked booking" warning. Also emits the
`non_acked_booking` webhook event.  
**Workaround:** Always ack after successful processing. Wrap the
processing-then-ack in a try/catch so transient failures ack-skip
(and retry next poll) rather than silently blackholing the revision.

## 16. Slave/child rates reject direct writes

**Expect:** Any rate plan id is writable.  
**Actual:** Rate plans with `inherit_rate: true` (slave/child rates)
reject writes with error code `RATE_IS_A_SLAVE_RATE`.  
**Workaround:** Always write to the parent. Traverse
`parent_rate_plan_id` up to the root (where it's null). For the
derived-by-percent / derived-by-amount rules, the modifier lives on
the child's `options.rate` config — you adjust that separately via
PUT on the rate plan, not via POST /restrictions.

## 17. `channel.is_active` + `PUT is_active: true` silently no-ops

**Expect:** PUT a channel with `is_active: true` to activate.  
**Actual:** The PUT succeeds and returns `is_active: true` in the
response, but channel doesn't actually go live until you
`POST /channels/:id/activate`.  
**Workaround:** Always use the explicit `/activate` endpoint after
create or after a reconnect. Don't trust `is_active` alone as a
"channel is working" signal — combine with `settings.token_invalid`.

## 18. Deleting a property does not clean up all its channels

**Expect:** `DELETE /properties/:id` cascades.  
**Actual:** Orphaned channel records can remain in the account after a
property delete, especially if the delete was forced. These show up in
`GET /channels` with a `properties` array referencing a now-deleted
property id, causing confusion.  
**Workaround:** Before `DELETE /properties/:id`, enumerate
`GET /channels?filter[property_id]=:id` and DELETE each channel
explicitly. Same hygiene for rate plans and room types if you care
about clean audits.

---

## 19. `/reviews/:id/guest_review` accepts shape-only — Airbnb is the real validator

**Expect:** A 200 from Channex on the guest_review submit endpoint
means Airbnb received and accepted the review.  
**Actual:** Channex's validation is shape-only. Categories like
`INVALID_PROBE_xyz`, ratings of `99`, public_review of `"x"` all
return HTTP 200 `{success: true}` from Channex and get stored in
`reply.guest_review` on the review entity. Airbnb then silently
rejects them downstream — verified via host dashboard, the review
shows "pending" not posted. Probe-validated 2026-04-24 against a
live Villa Jamaica review.  
**Workaround:** Build the canonical Airbnb validation rules into
your client (category whitelist `cleanliness | communication |
respect_house_rules`, rating 1–5 integer, public_review length
50–1000) and enforce them BEFORE the Channex call. Track three
timestamps locally — host clicked submit / Channex 200'd /
Airbnb actually accepted — and only consider a submission
"confirmed" when a follow-up GET on the review shows
`reply.guest_review.public_review` matches what you sent. If
>6h elapse without a match, log a warning; assume Airbnb dropped
it.

## 20. `/bookings` and `/booking_revisions/feed` exclude historical post-checkout bookings

**Expect:** Channex exposes every booking the property has ever
received, paginated.  
**Actual:** Both endpoints expose only recent + upcoming bookings.
Bookings whose checkout date is past some TTL window age out and
disappear from /bookings entirely. Filtering by
`ota_reservation_code` returns 0 results for aged-out codes — they
are not retrievable. Probe-validated 2026-04-25 against a live
property: 9 bookings exposed (3 Airbnb future + 6 BDC future)
while 49 historical Airbnb iCal-sourced bookings existed locally
with no Channex counterparts.  
**Workaround:** Reviews can outlive their booking visibility on
Channex's side — a guest's review remains queryable via /reviews
long after the underlying booking has aged out of /bookings. If
your UI joins reviews → bookings to surface guest names, accept
that historical reviews will fail the join. Provide a manual-
override field on the review (`guest_name_override` or similar)
so a host can patch in the real name from their OTA host
dashboard. Forward bookings still flow with full metadata; the
gap is retroactive only.

## 21. `/reviews` exposes `expired_at` + `is_expired` — UI gating is the consumer's job

**Expect:** Airbnb's two-sided review model hides the guest's review
text from the host until either (a) the host submits their own review
or (b) the 14-day window expires. Channex would only return text
once the consumer is allowed to see it.  
**Actual:** Channex returns the full `content` (and structured
`raw_content` when available) on every `/reviews/:id` response that
is public. Public means: window expired OR host submitted. The
trick is that Channex makes the review visible the moment Airbnb
makes it public — and Airbnb makes it public at window expiry too.
A consumer that gates only on host-side `submitted_at` will render
text + an active "Review this guest" button on every
expired-but-unsubmitted review.

The two fields the consumer needs:
- `expired_at` — ISO timestamp, the moment the 14-day window
  closes. Stable per review.
- `is_expired` — boolean, already-derived from `expired_at` vs
  Channex's clock. Useful for one-shot reads but stales between
  syncs; prefer storing `expired_at` and re-deriving locally.

**Workaround:** Store `expired_at` on the local review row at sync
time and derive `is_expired = expired_at <= now()` at read time.
Gate the host-side action on `!submitted_at && !is_expired`. When
`is_expired` flips true, replace the action with a non-actionable
label ("Review time expired") rather than a disabled button — the
action is permanently gone, not temporarily blocked.

**Edge case** (probe-validated 2026-04-25): reviews whose window
expired more than ~50 days ago can stop appearing in the
`/reviews?filter[property_id]=X` listing entirely, and their
direct-GET responses lose `expired_at`. A previously-synced row
that is now invisible to Channex keeps its last-stored
`expired_at` value forever — usually NULL — and the gating logic
treats it as "not expired." Either accept stale UI on long-aged-
out reviews or fall back to `incoming_date + 14 days` when
Channex returns no `expired_at`. The Channex-authoritative spec
prefers the former; flag to product if those rows are
user-visible.

**Addendum** (probe-validated 2026-04-26 RDX-DIAG): aged reviews
drop from the `/reviews?filter=` listing **but still respond to a
direct GET `/reviews/:id` with full `expired_at` populated**. Per-id
refetch restores the field on a previously-synced row, so the
`incoming_date + 14d` fallback is only needed for rows we haven't
re-fetched. The 50-day visibility-loss threshold is approximate
and seems to apply to listing only, not direct-GET.

## 22. Outer-catch rollback is part of the three-stage write pattern

**Expect:** Inner try/catch around the Channex call rolls back the
intent-stamp on classified errors (typed Channex exceptions), so
the host can retry.  
**Actual:** Unhandled exceptions between the intent-stamp and the
typed-error catches bypass the inner rollback and leave the row in
the orphan state — `submitted_at` (or equivalent intent timestamp)
set while `acked_at` stays NULL. Real failure paths that surface
this: client instantiation throw, lock re-read failure, runtime
exceptions in the validation layer, anything that runs after the
stamp but before the typed-error try/catch is entered.
Probe-validated 2026-04-25 on the `submit-guest-review` route —
review `321d7369` (Villa Jamaica) was orphaned (submitted_at set,
acked_at null, no payload, no Channex record) and the only path
that fits is an unhandled exception slipping through to the outer
catch, which was returning 500 without rolling back.

**Workaround:** Mirror the rollback in the outer catch. Conditional
on `acked_at IS NULL` so a post-ack throw can't undo a real
submission:

```ts
} catch (err) {
  await reviewTable
    .update({ submitted_at: null, payload: null })
    .eq("id", reviewId)
    .is("acked_at", null);
  return NextResponse.json({ error: String(err) }, { status: 500 });
}
```

The pattern: every state machine that stamps before an external
write needs rollback at every exception layer — typed-error catch,
untyped-error catch, outer-most route catch. Inner classification
is for surfacing the right HTTP status; state cleanup is
independent and must run on every error path.

---

## 23. Airbnb host-direct replies do NOT propagate to Channex `is_replied`

**Expect:** If a host writes a public reply to a guest review via
Airbnb's host UI directly (bypassing Channex), Airbnb's API
eventually pushes that reply state back to Channex, and a
subsequent `GET /reviews?filter[property_id]=X` shows
`attributes.is_replied = true` plus `attributes.reply.reply` text.

**Actual** (probe-validated 2026-04-26 against a Villa Jamaica
account with 11 historical Airbnb reviews, only 1 of which had been
replied to via the Channex API): Channex returns `is_replied = false`
and `reply: {}` for **every review** the host had not replied to via
the Channex API, regardless of whether the host believes they
replied directly in Airbnb's UI. The single review replied to via
the Channex `POST /reviews/:id/reply` endpoint shows `is_replied =
true` and `reply.reply` populated verbatim. Round-trip works for
Channex-originated replies; Airbnb-originated replies are invisible.

**Workaround:**
- Treat `is_replied = false AND is_expired = true` as a
  closed-without-response bucket; surface it as muted history, not as
  actionable "needs response." (PMS UIs should not nag the host
  about a reply window that has already closed.)
- Treat `is_replied` as authoritative for "did the response go via
  Channex." Don't rely on it to mean "did the host reply at all."
- If accurate "did the host reply (anywhere)" is needed, the only
  available signal today is the Airbnb host UI itself — out of band
  for any partner integration. No API workaround.

**Implication for sync code:** re-evaluate `is_replied` on every
sync iteration (not only initial insert) so that a Channex-originated
reply published outside our system still flows in. But do not expect
this to ever flip `true` purely from host-direct activity.

---

## 24. Closed BDC threads silently reopen on `POST /message_threads/:id/messages`

**Expect:** A BookingCom thread with `is_closed = true` (set either
by a prior `POST /message_threads/:id/close` or by the BDC-only
`/no_reply_needed` action) rejects new sends, since "closed" should
mean the conversation lifecycle is done. Channex would surface a
422 with a "thread closed" error code, or refuse the write outright
so the integration can branch on it (e.g. start a new thread).

**Actual** (probe-validated 2026-04-26 MSG-S2 F.5 against a Villa
Jamaica BookingCom thread, last activity 9 days prior, `is_closed
= true` per the prior `/message_threads` listing): Channex returns
**200 OK** with the created message entity. The next sync via
`GET /message_threads/:id` flips `is_closed` from `true → false`,
preserving the thread. From the host's perspective the thread has
been seamlessly reopened.

**Workaround:**
- Don't pre-gate the composer on `is_closed`. Treat it as a
  display-state hint only ("Marked as no reply needed") rather than
  a blocking signal.
- After a successful send to a closed thread, refresh the thread's
  `is_closed` from Channex (or wait for the next sync) so the local
  state flips.
- AirBNB threads do not expose `is_closed` semantics meaningfully
  in the same way — the field is present but never observed `true`
  in probes. The reopen-on-send behavior is BDC-specific.

**Probe note:** sample size is one BDC thread on one Channex
account. Behavior may differ if the underlying BDC channel itself
has closed the conversation server-side; this probe was Channex-
side `is_closed`, not BDC-side. Re-validate if a host reports a
"closed conversation can't be reopened" issue at the BDC end.

---

## 25. Channex does NOT echo property-originated `/messages` POSTs back via webhook

**Expect:** When a partner integration sends an outbound message
via `POST /message_threads/:id/messages` and the account is
subscribed to the `message` webhook event, Channex pushes a
mirror event to the `callback_url` shortly after the send so the
integration can converge its local state via the same idempotent
upsert path that handles inbound messages. This is the
"everything flows through one ingest pipeline" pattern.

**Actual** (probe-validated 2026-04-26 MSG-S2 — F.3 send to AirBNB
thread `2792eb00…` at 04:22 UTC, F.5 send to BDC thread
`05ebfc7c…` at 04:42 UTC, both Channex 200): no `message` webhook
event arrived for either send. The webhook log shows zero entries
referencing the new `channex_message_id`s in the 30-min observation
window post-send. Inbound (`sender = guest`) messages DO fire
webhooks — only outbound (`sender = property`) sends are silent.

**Workaround:**
- Treat the `POST /message_threads/:id/messages` 200 response body
  as the canonical record of the send. The response includes the
  full message entity (id, sender, inserted_at, attachments) —
  persist directly from it; don't wait for a webhook echo.
- A polling worker (60-min cadence is fine — see
  `koast-development/playbooks.md` two-headed sync subsystem)
  reconciles outbound messages on the next pass via
  `GET /message_threads/:id/messages`, which DOES return
  property-sender rows.
- The webhook handler's idempotent upsert on
  `channex_message_id` is still load-bearing for the inbound path;
  it's just defensive insurance for outbound that never fires.

**Implication for sync code:** the route's local upsert at send
time IS the canonical write path for outbound. Don't design the
system so outbound state only converges via the webhook — it never
will for this side of the conversation.

---

**How to extend this file:** every new surprise you hit while working
against Channex should land here with the expect/actual/workaround
triad. Include the probe date so future readers know how fresh the
finding is.
