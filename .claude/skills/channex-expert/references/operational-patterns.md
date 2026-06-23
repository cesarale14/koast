# Channex Operational Patterns

Task-shaped playbooks. Each is 5–20 lines, assumes you know the
endpoint reference.

## Adding a new OTA channel for a property

1. `POST /channels` with `{ "channel": { "property_id": <id>,
   "channel": "AirBNB" | "BookingCom" | …, "title": "<property> - <OTA>",
   "settings": { <per-OTA fields> }, "rate_plans": [{ room_type_id,
   rate_plan_id, ...mapping }] } }`.
2. Authorize at the OTA side (OTA-specific — Airbnb OAuth, BDC
   connectivity provider assignment, Vrbo password form).
3. `POST /channels/:id/test` to verify auth round-trip.
4. `POST /channels/:id/activate` — **required**. `PUT is_active: true`
   alone silently no-ops (see quirks #?).
5. Push current availability + rates via `/availability` + `/restrictions`
   so the OTA has a baseline.

Failure modes: token exchange failure at step 2 → `test` returns error;
if you skip `activate` the channel will read `is_active: false` forever.

## Reconnecting a broken channel (OAuth expired)

Signal: `channel.settings.token_invalid: true` or
`disconnected_channel` webhook event, or bookings stop arriving.

1. Try `POST /channels/:id/activate` first.
2. If activate fails silently ("Channel activation failed" with no
   detail in the Channex UI): **delete + recreate** is the reliable
   path. `DELETE /channels/:id`, then the full add-channel flow again.
3. After the new channel is active, run a full availability + rate
   resync (the gap while the channel was down leaves stale state on
   the OTA side).

Reactivate-via-API is documented but fragile in practice. Delete-and-
recreate sidesteps the failure modes.

## Diagnosing a failed rate push

Response is HTTP 422 or a 200 with warnings.

1. Check channel status: `GET /channels/:id` — is `is_active: true`?
   Is `settings.token_invalid` false?
2. Check rate plan mapping: is the `rate_plan_id` you pushed actually
   mapped to the channel? Look at `channel.rate_plans[]` for the
   `{room_type_id, rate_plan_id}` you're pushing.
3. Check rate plan type: is it a parent or a slave? Error
   `RATE_IS_A_SLAVE_RATE` = you pushed to a derived plan. Traverse
   `parent_rate_plan_id` up to the root and retry.
4. Check the BDC-specific constraints: rate coverage gap? `stop_sell`
   set property-wide?
5. Cross-reference with `sync_error` webhook events at the same
   timestamp — Channex emits these asynchronously when the OTA side
   rejects the push.

## Investigating duplicate property records

Signal: two properties in Channex with suspiciously similar names,
conflicting channel memberships, or one showing bookings and the other
not.

1. Query **all properties** the account owns: `GET /properties?page[limit]=200`
   — do not scope to a specific property_id.
2. Duplicates often arise from an Airbnb OAuth flow auto-creating a
   property when one already exists (manually created for the same
   physical unit). The auto-created one may have the listing title
   (e.g. "Home in Tampa ★4.82").
3. Identify which one has the rate plans + room types you care about.
   Rule: keep the property with the most recent commerce (active
   channels, rate plans, bookings).
4. Migrate channel mappings off the duplicate → onto the keeper via
   `PUT /channels/:id` with a new `properties[].property_id`. Then
   `DELETE /properties/:duplicate?force=true`.

## Handling pagination gaps

Some list endpoints respect `page[limit]` (up to a cap). Others have a
silent hard cap regardless of what you request. `/reviews` is the known
offender — `meta.total: 110` but the endpoint returns 10 per page and
`page[number]` paginates once then loops.

Workaround pattern:
```
seen = set(); batch = get(page=1, limit=100)
while batch:
  new = [r for r in batch if r.id not in seen]
  if not new: break          # page returned nothing new
  store(new); seen |= {r.id for r in new}
  page += 1
  if page > 50: break         # hard stop
```

When `seen` stops growing, you've hit the cap even if `meta.total`
claims more. Escalate to Channex support if the cap is blocking real
work — in the meantime, webhook ingestion is the only way to get the
long tail.

## Syncing reviews into a local DB

1. GET `/reviews?filter[property_id]=…&page[limit]=100` with the
   dedup-by-id loop above.
2. For each review, extract `id` (stable Channex UUID — treat as
   primary key on your side), `ota_reservation_id` (matches
   `/bookings.ota_reservation_code`), `guest_name` (often null),
   `overall_score` (0–10), `raw_content.public_review` and
   `.private_feedback`, `scores` array, `received_at`.
3. Resolve booking linkage via `ota_reservation_code` on your local
   bookings — **not** via iCal UID. If your bookings are iCal-sourced
   you'll have zero matches; swap the booking source to
   `/booking_revisions/feed` to get the codes.
4. Don't stomp local state on re-sync. Upsert by the Channex review id;
   on conflict only overwrite Channex-sourced fields, leave local
   workflow state (response drafts, "marked as bad review", etc)
   untouched.

## Inspecting what's attached to a Channex property

Unified audit call pattern:
```
GET /properties/:id                    → property settings, currency
GET /room_types?filter[property_id]=:id → all room types
GET /rate_plans?filter[property_id]=:id → all rate plans + inheritance
GET /channels?filter[property_id]=:id   → all channels + mappings
GET /applications/installed             → scope is account-wide, but
                                           each row has a property_id
```

Then cross-reference: each `channel.rate_plans[].rate_plan_id` should
exist in the rate_plans list; each `rate_plan.room_type_id` should
exist in the room_types list. Orphans = broken state.

## Testing a new channel without commercial impact

- Use **far-future dates** (6+ months out) for writes — fewer
  cancellation refunds if something goes wrong.
- Keep deltas small — if current rate is $165, push $165 or $170, not
  $5.
- Keep a rollback ready — the exact prior value + the POST body to
  restore it, before you make the test write.
- For BDC specifically: verify `stop_sell: false` and `availability > 0`
  before writing a rate, so a broken write doesn't leave the date in
  a closed state.
- After the write, GET `/restrictions` for that date range and diff
  what you wrote against what was stored. If the OTA rejected it,
  you'll see a `sync_error` webhook.

## Booking ingestion via the feed

```
loop every 15 min:
  revs = GET /booking_revisions/feed?filter[property_id]=<id>
  for rev in revs.data:
    store(rev)
    POST /booking_revisions/:rev.id/ack
```

Idempotency: dedup by `revision_id` on your side; the feed only returns
unacked, so you shouldn't see duplicates unless you ack-then-crash
mid-loop. Handle it anyway.

Per-revision processing: check `status` = `new` | `modified` |
`cancelled`. For `cancelled`, mark the local booking cancelled but keep
it (for history + outcome reporting). For `modified`, diff old vs new
and emit a change event if your PMS shows per-field changes.

## Installing / confirming an Application is installed

```
GET /applications/installed
  → look for {"application_code": "channex_messages",
              "property_id": <your_property>}
```

If missing, install via (docs):
```
POST /applications/install
{ "installation": {
    "application_code": "channex_messages",
    "property_id": "<uuid>"
} }
```

Post-install, `settings` is `{}`. Some apps need configuration via the
Channex UI before their endpoints fully work (e.g. Stripe Tokenization
for payment capture). Messages/Reviews usually work immediately.

## Webhook setup with reliable delivery

1. Deploy your `/api/webhooks/channex` endpoint. Return 200 fast;
   enqueue processing async. Slow webhook handlers get rate-limited.
2. Create via POST /webhooks with `event_mask` listing only what you
   need (not `*` — too noisy).
3. Dedup incoming deliveries by `payload.revision_id` (bookings),
   `payload.id` (messages/reviews), or envelope `timestamp + event +
   payload-hash`.
4. Add `/booking_revisions/feed` polling as a reconciler. Webhooks
   drop, feeds catch.
5. Rotate Channex API key → you also need to update webhook
   `request_params` or `headers` if you embedded auth there. Webhooks
   themselves use Channex's API key for their own delivery, not yours,
   so on the delivering side nothing changes.
