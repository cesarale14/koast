# BDC Clobber Incident — Postmortem
*Investigation date 2026-04-17. No code changed during this investigation — findings only.*

## Symptoms (as reported)
- When partner properties (already live on Airbnb + Booking.com with their own host-managed rates and manually-closed dates) were first added to Koast, the import/connect flow overwrote existing BDC rates and re-opened manually-closed dates.
- Cesar fixed at the Booking.com admin side manually. Properties have been disconnected from Koast since the incident.

## Root Cause Hypothesis

The BDC `/activate` flow is a **write-only 365-day sweep that assumes Koast is authoritative for every date it touches**. It never reads current BDC state before pushing. For any date where Koast has no opinion, the code emits explicit defaults (`availability: 1`, `stop_sell: false`, `min_stay_arrival: 1`) and sends them to Channex, which forwards them to BDC as explicit writes.

Primary clobber point: `src/app/api/channels/connect-booking-com/activate/route.ts:91-119`.

```ts
// activate/route.ts, lines 102-116
for (let d = new Date(startStr + "T00:00:00Z"); d <= new Date(endStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const ds = d.toISOString().split("T")[0];
  const r = rateByDate.get(ds);
  const isBlocked = blockedDates.has(ds);
  restrictionValues.push({
    property_id: channexPropertyId,
    rate_plan_id: bdcRatePlanId,
    date_from: ds,
    date_to: ds,
    rate: r?.applied_rate ? Math.round(Number(r.applied_rate) * 100) : undefined,
    min_stay_arrival: r?.min_stay ?? 1,       // ← defaults to 1 if Koast has no data
    stop_sell: isBlocked || r?.is_available === false,  // ← defaults to false
    availability: isBlocked ? 0 : 1,          // ← defaults to 1 (open) — THE RE-OPEN BUG
  });
}
```

The loop iterates every date `today..today+365`. For each date, it writes an explicit `availability: 1` unless Koast has a booking on that date. **Manually-closed-on-BDC dates that have no corresponding Koast booking get availability flipped to 1**, which is exactly "re-opened manually-closed dates" in the symptom report.

Rate clobber (line 111): `rate: r?.applied_rate ? ... : undefined`. The `undefined` branch is safer — Channex interprets `undefined` as "don't touch rate" — but any date where Koast `calendar_rates.applied_rate` is populated WILL push that rate to BDC regardless of the host's manual BDC rate override.

Min-stay clobber (line 112): `min_stay_arrival: r?.min_stay ?? 1`. If the BDC listing had `min_stay=3` set by the host but Koast has no `min_stay` for that date, this pushes `min_stay_arrival: 1`, overwriting the host's restriction.

Batch behavior (lines 117-119): 365 entries → 2 batches of 200. No per-batch error handling. A mid-sweep failure leaves the calendar half-clobbered with no clear signal.

## Why It Happened

The `/activate` contract assumes Koast is the source of truth for the calendar from day 1. That assumption is correct when a property is being CREATED fresh on Booking.com through Koast, but wrong when a property has an EXISTING Booking.com listing with host-maintained state.

Three missing guardrails:
1. **No pre-flight read.** The client has `getRestrictionsBucketed(propertyId, dateFrom, dateTo)` available at `src/lib/channex/client.ts:498` — it returns the existing per-date state bucketed by rate plan. `/activate` never calls it.
2. **No merge semantics.** Even if state were read, there's no policy for "BDC says date X is closed, Koast has no opinion" — the only policies implemented are "Koast is authoritative" (current behavior) and the not-implemented "don't touch unknown dates."
3. **No dry-run preview.** The host doesn't see what's about to change before pushing 365 days of writes.

## Scope

| Entry point | Pushes calendar state to BDC? | Clobber risk |
|---|---|---|
| `POST /api/properties/import` | No — only creates/updates `properties` + caches `channex_room_types` / `channex_rate_plans` rows. `channex.request PUT /properties/{id}` at line 142 only updates the property title, not the calendar. | **SAFE** |
| `POST /api/properties/import-from-url` | No — creates a property, inserts `listings`, optionally syncs iCal bookings into `bookings`. No Channex outbound calls on the rate/availability path. | **SAFE** |
| `POST /api/channels/connect-booking-com` | No calendar writes. Creates/links the Channex channel + rate plan, writes `property_channels`. The one `channex.updateChannel` call at line 353 only configures the channel's rate-plan mapping (`readonly: false, occupancy: 8`) — not calendar state. | **SAFE** |
| `POST /api/channels/connect-booking-com/activate` | **YES — writes 365 entries to `/restrictions` covering rate, availability, min_stay_arrival, stop_sell for every date in the next year.** | **CLOBBERS** |

One adjacent path worth flagging:
| Path | Behavior | Risk |
|---|---|---|
| `POST /api/pricing/push/[propertyId]` | Writes `restrictions` for every date where `calendar_rates.applied_rate IS NOT NULL`. `stop_sell: !isAvailable` overwrites BDC stop_sell state for those dates. Has HTTP 207 partial-failure handling (unlike `/activate`). | **PARTIAL CLOBBER** — only affects dates with Koast rate data, not the full 365-day window. Still unsafe when reconnecting a partner property. |

## Required Fixes (Track B prerequisites)

These must land in OR before the new `/api/pricing/apply` path, and the existing `/activate` path must be retrofitted concurrently. Can't ship safe `/apply` while leaving `/activate` unsafe — one flow is meaningless without the other, because partner-property reconnection starts with `/activate`.

### F1 — Pre-flight read of BDC state
Before the first push, call `channex.getRestrictionsBucketed(channexPropertyId, startStr, endStr)` for the BDC rate plan only. Build a `bdcStateByDate: Map<date, { rate, availability, stop_sell, min_stay_arrival }>` from the response.

### F2 — Availability merge: union-of-closes, never open-over-closed
For each date, compute `finalAvailability`:
- If BDC has `availability=0` OR `stop_sell=true` AND Koast has no booking forcing a change → **preserve BDC closed state** (send `availability: 0, stop_sell: true` or OMIT from the update batch entirely).
- If BDC has `availability=1` and Koast has a booking → `availability=0, stop_sell=true` (normal cross-channel block).
- If BDC and Koast agree → no write needed (can omit from the batch to reduce Channex traffic).
- **Never compute an `availability=1` write for a date the BDC state shows as closed.** This is the specific invariant that fixes the re-open bug.

### F3 — Rate preservation with delta threshold
For each date with an existing BDC rate and a Koast-side `applied_rate`:
- If |Koast − BDC| / BDC > threshold (propose 10%), OMIT from the batch and flag for host review.
- If within threshold, write Koast's value.
- If Koast has no rate, OMIT — never push `undefined` as a rate (Channex's handling of that is unverified).

### F4 — Min-stay preservation
If BDC has `min_stay_arrival > 1` and Koast has no `calendar_rates.min_stay` for the date, OMIT from the batch rather than pushing `min_stay_arrival: 1`.

### F5 — Dry-run preview surface
Add a new endpoint `POST /api/channels/connect-booking-com/preview-activate` that runs the full compute-diff logic from F1-F4 and returns a diff structure: `{ dates_to_open: [], dates_to_close: [], rate_changes: [{ date, from, to }], min_stay_changes: [...] }`. The connect UI must show this to the host BEFORE committing.

### F6 — Per-batch error handling on `/activate`
Port the HTTP 207 partial-failure pattern from `/api/pricing/push` (collects `failedBatches` with date-range context and returns `partial_failure: true`) to `/activate`. Today, a mid-sweep failure leaves the BDC calendar in an indeterminate state with no host-visible error.

## Track B Integration

- The `/api/pricing/apply` route (Track B Stage 1, per `KOAST_OVERHAUL_PLAN.md`) will write BDC restrictions on user click. If it ships with the same clobber semantics as `/activate`, the first partner-property user who clicks Apply will reproduce this incident.
- Proposed sequencing: F1-F4 land as a shared helper `buildSafeBdcRestrictions(supabase, channex, propertyId, dateRange, newValues)` in `src/lib/channex/` or `src/lib/pricing/`. Both `/activate` and `/apply` call through it. F5 (dry-run) is served by a new endpoint that `/apply` also consumes — the host sees a preview before committing.
- F6 should land first — it's a small change and applies to every batch writer, not just the connect path.

## Recommended Immediate Guardrails (before Track B fully lands)

If shipping the full Track B Stage 1 takes >1 week and you want to re-enable the partner properties sooner, these are the minimum changes to make `/activate` safe, in priority order. None of them require new tables or migrations.

### G1 — Gate `/activate` behind an env flag while reconnect is in progress
`KOAST_ALLOW_BDC_CALENDAR_PUSH=true` required to hit the 365-day loop. Default off. Today, if a partner property reconnects, /activate would run immediately after channel setup and clobber again. Env-flag prevents that while the fixes are drafted.

### G2 — Switch the 365-day sweep to a "write-only-where-Koast-has-data" loop
Minimum viable behavior change in `/activate`:
- Build `restrictionValues` ONLY for dates where `rateByDate.has(ds)` OR `blockedDates.has(ds)`.
- Every other date → NO entry in the batch. Channex leaves those dates untouched.

This is a ~5-line change that eliminates 90% of the clobber surface (dates where Koast has no data). It doesn't solve the case where Koast has a rate and BDC has a different one, but it fixes the re-open bug, which was the most visible part of the incident.

### G3 — Log every outbound batch to a new `channex_outbound_log` table
Currently there's no record of what Koast wrote to Channex. `channex_webhook_log` is inbound-only (booking events). For safety during reconnection, log every `updateRestrictions` call with `{ property_id, rate_plan_id, date_range, entries_count, payload_hash, result }` so an incident can be reconstructed date-by-date. Small migration, high value. Defer the full schema design to Track B; a stopgap with just those fields works.

### G4 — Partner-property-only preflight check
If reconnecting a property that was previously live on BDC (detectable via `properties.channex_property_id IS NOT NULL AND property_channels.channel_code='BDC' exists at connect time`), require an explicit host confirmation: "This property has existing Booking.com state. Pushing from Koast will overwrite it. Continue?" — shown BEFORE /activate runs, modal-style.

G1 + G2 alone make reconnection non-destructive (at the cost of some dates not being synced from Koast until the full pipeline ships). G3 + G4 make it auditable and consent-gated.

## Historical evidence (supplementary)

`channex_webhook_log` captures INBOUND events only (37 rows: 17 `booking_new`, 9 `booking_cancellation`, 11 `revision_poll`). No record of outbound `updateRestrictions` calls exists — so the exact moment of clobber can't be reconstructed from this table. "Skipped_unknown_property" rows on Apr 9-12 confirm webhooks for the partner properties were arriving before property mapping completed, consistent with a connect flow running during that window.

**Gap flagged**: Koast has no outbound Channex API log. Any future clobber incident would be similarly un-reconstructable. G3 above addresses this.

## Entry-point summary (for readers who skip to the end)

- **Safe**: `/api/properties/import`, `/api/properties/import-from-url`, `/api/channels/connect-booking-com`
- **Clobbers (full 365 days)**: `/api/channels/connect-booking-com/activate`
- **Clobbers (dates with Koast rate data)**: `/api/pricing/push/[propertyId]`
- **Will also clobber unless it integrates F1-F4**: the proposed `/api/pricing/apply` from Track B

The fix is not just `/activate` — the shared helper F1-F4 must be consumed by every path that writes restrictions. Anything less leaves a reinfection vector.
