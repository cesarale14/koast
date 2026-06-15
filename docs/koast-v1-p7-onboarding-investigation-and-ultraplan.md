# P7-ONBOARDING — investigation + ultraplan

**Launch blocker.** A fresh account on `app.koasthq.com` reaches an empty Today
with no path forward. This doc maps the existing machinery, names the gaps
(all verified against the repo), defines the minimum real new-host path, and
lays out the build as phases. **Investigation reported; building HELD for
Cesar's go.** Priority over A5/A6.

---

## 1. The blocker, precisely (two stacked dead-ends)

**Dead-end #1 — no entry point.** A new account verifies email → middleware
allows → `/` → `TodayHomeServer` → `buildAgendaRollup` finds 0 properties →
`emptyRollup{empty:true}` → `TodayHome` renders *"Nothing on the calendar for
the next couple of days — you're all set."* with **no CTA, no link**. The full
6-step `/onboarding` wizard EXISTS but is **unreachable** — `grep` for any
`href`/`router.push`/`redirect` to `/onboarding` across `src/` returns **zero
matches**. No first-run redirect exists either. `/properties` has a working
"Add property" modal but a new user has no reason to click into it from a blank
Today.

**Dead-end #2 — even after adding a property, Today stays empty.**
`import-from-url` (the most-wired add-property path) **never sets `timezone`**
(verified: no `timezone`/`tz` token in the route). `buildAgendaRollup` **skips
any property with a null/invalid timezone** (`nullTzPropertyCount`, agenda.ts).
So a host who *does* find `/properties` and imports a listing still lands back
on an empty Today — the property is invisible to the agenda, Calendar, and
Pricing until a timezone is set by hand (no UI sets it).

Net: the path is broken at the front (no door) AND one step in (property exists
but is inert).

---

## 2. What already exists (so we EXTEND, not rebuild)

| Surface | File | State |
|---|---|---|
| Signup / login / email-verify | `src/app/(auth)/signup,login` + `lib/supabase/middleware.ts` | WIRED. Google OAuth button present, provider not configured. |
| Free-tier default + quota | `migrations/20260413010000_free_tier_property_quota.sql` | WIRED. No `user_subscriptions` row on signup; trigger defaults free=1, pro=15, business=∞. |
| `/onboarding` 6-step wizard | `src/app/(dashboard)/onboarding/page.tsx` (915 lines) | BUILT but UNREACHABLE. Welcome → Property → Calendar → Details → ~~Messages~~(removed) → Done. Writes `properties` + `property_details` + `ical_feeds`. Step-label array still lists removed "Messages" → off-by-one. |
| Add-property modal (URL import) | `PropertiesPage.tsx` 427–667 → `POST /api/properties/import-from-url` | WIRED. Paste OTA URL → `properties` + `listings` (+ optional iCal sync → `bookings`). "Add manually" button disabled ("coming soon"). |
| import-from-url API | `src/app/api/properties/import-from-url/route.ts` (355) | WIRED. **No** timezone, **no** `property_details`, **no** `calendar_rates`, **no** bed/bath/guests. Tampa-name heuristic coords else NULL. |
| Channex import (existing-in-Channex) | `src/app/api/channex/import/route.ts` (556) + `/properties/import` | WIRED. Mirrors Channex props/rooms/rate-plans/bookings into Koast. Assumes they already exist in Channex. |
| **BDC self-service connect** | `connect-booking-com/{route,test,activate}` + `BookingComConnect.tsx` | WIRED + production-tested. **Scaffolds a Channex property** when the property has no `channex_property_id` (verified: `SC-Scaffold-…` createProperty path) → room type → dedicated rate plan → channel → activate + push. Compensating rollback. |
| Auto-scaffold | `src/app/api/properties/auto-scaffold/route.ts` | WIRED. Pre-creates Channex prop+room+rate, auto-adds to existing Airbnb channel. |
| Channex OAuth iframe token | `api/channels/token/[propertyId]` + `group-token` | WIRED (token mint). This is the lever for Airbnb (host maps listings inside Channex's OAuth widget). |
| AddressAutocomplete | `src/components/ui/AddressAutocomplete.tsx` | WIRED on free Nominatim — returns lat/lng. (Not Google Places.) |

**The two existing properties were DB-seeded with `channex_property_id`** — so
the provisioning paths above have never been exercised on a truly fresh
property.

---

## 3. The gaps (verified), ranked by what blocks "a working Today"

1. **No entry point** (dead-end #1) — empty Today has no CTA; `/onboarding`
   unreachable; no first-run routing. *Blocks everything; cheapest to fix.*
2. **timezone never set** (dead-end #2) — every creation path leaves it NULL;
   agenda/Calendar/Pricing skip the property. *Without this the rest is moot.*
3. **Creation doesn't bootstrap a usable property** — `property_details` only
   in the wizard; `calendar_rates` only in the rarely-used manual form;
   bed/bath/guests not imported via URL. Calendar/Pricing/check-in-templates
   are empty for an imported property.
4. **Channex provisioning for a NEW property** (the integration dependency):
   - **BDC**: scaffold-on-connect is wired but **untested on a fresh property**
     (import-from-url → connect-BDC scaffolds a Channex prop). Needs a real
     end-to-end run.
   - **Airbnb**: **no per-property connect UI in Koast.** Airbnb is assumed
     pre-connected at the Channex *tenant* level; today the only path is
     `/channex/import` (which assumes the listing already exists in Channex).
     A brand-new host has nothing in Channex → cannot connect Airbnb. The
     OAuth iframe token route exists; the *flow that uses it for a new host*
     does not.
   - **VRBO**: not implemented (defer).

---

## 4. The minimum real new-host path (target), mapped to what exists

```
create account            ✅ exists
   ↓
land on Today (0 props)    ✅ exists  →  ❌ shows dead-end, must show "Add your first property"
   ↓
add a property:
   • manual details        ⚠️ wizard exists; "add manually" modal button disabled
   • OR import OTA URL      ✅ import-from-url  →  ❌ no tz / details / rates bootstrap
   ↓
property gets a timezone   ❌ MISSING — the linchpin for a working Today
property is bootstrapped    ⚠️ partial — needs details + rate seed
   ↓
connect a channel (optional for v1 first-run, required to push):
   • iCal (Free tier)       ✅ /api/ical/add
   • Booking.com (Pro)      ✅ scaffold+activate (untested fresh)
   • Airbnb (Pro)           ❌ no new-host connect flow (Channex OAuth dependency)
   ↓
return to a WORKING Today   ❌ only works once tz is set + property visible
```

The path is ~70% built. P7 wires the door, sets the timezone, makes creation
bootstrap a usable property, and lands the new-host channel-connect story —
extending existing surfaces, not rebuilding them.

---

## 5. Ultraplan — phases (each merge-on-green, hard gates only)

### P7.1 — Entry point + first-run routing  *(unblocks dead-end #1; lowest risk, highest value)*
- `readTodayHome`/agenda already know property count (it returns `empty` on 0
  props). Thread a distinct **`hasNoProperties`** signal (don't conflate
  "0 properties" with "all caught up") to `TodayHome`.
- Empty Today for a 0-property host renders a **first-run card**: "Add your
  first property" → routes to the canonical add surface (decision §7).
- Make `/onboarding` reachable: link from the first-run card + a top-level
  "Add property" affordance in the sidebar/nav.
- Fix the onboarding step-label off-by-one (drop the removed "Messages").
- *Tests:* curate/agenda renders the first-run state at 0 props and the normal
  empty ("all set") state at ≥1 prop with nothing scheduled — the two must not
  collapse.

### P7.2 — Property creation bootstraps a WORKING property  *(unblocks dead-end #2)*
- **Timezone on creation** — a single `bootstrapNewProperty(propertyId, …)`
  helper every creation path calls, which sets `timezone` (approach = decision
  §7), seeds an empty `property_details` row, and seeds the `calendar_rates`
  base layer so Calendar/Pricing aren't empty.
- Wire it into `import-from-url`, the wizard, and the manual form so all three
  produce an identical, agenda-visible property.
- Import bed/bath/guests where the OTA fetch provides them; safe parsing.
- *Tests:* deterministic — `bootstrapNewProperty` sets a non-null IANA tz and
  writes the details + rate-seed rows; a property created via import-from-url
  is now visible to `buildAgendaRollup` (no `nullTzPropertyCount` bump).

### P7.3 — New-host channel connection  *(the Channex provisioning dependency — §6)*
- **BDC fresh-property end-to-end**: exercise import-from-url → connect-BDC
  scaffold on a real new property; harden whatever the first real run surfaces.
  Hard-floor (Channex write) → controlled, gated, verified like A4.
- **Airbnb new-host flow**: surface a "Connect Airbnb" path that opens the
  Channex OAuth widget via the existing `token/[propertyId]` route, then runs
  the import to mirror the mapped listing. This is the genuinely new surface.
- iCal stays the Free-tier path (already wired); make it the default offered
  step so a Free host reaches a working Today without a live channel.
- VRBO explicitly deferred.

### P7.4 — Plan gating around the quota  *(small)*
- First property works on **Free** (quota free=1) — no billing needed for the
  MVP path. Surface the quota state honestly.
- 2nd+ property needs Pro; Pro upgrade is "coming soon" (Stripe env =
  NEEDS-CESAR). Onboarding must not dead-end a Free host at property #1.

---

## 6. Channex provisioning dependencies (called out explicitly)

For a **brand-new account** (nothing pre-wired in Channex):
- **BDC** is self-contained — the connect flow scaffolds the Channex property,
  room type, dedicated rate plan, and channel, then activates. The only risk is
  that this exact path (no pre-existing `channex_property_id`) has **never run
  on a real fresh property**; P7.3 must prove it under the OTA-write gate.
- **Airbnb** is the hard dependency: Koast has **no host-facing OAuth
  initiation**; it assumes the Airbnb channel already exists in the Channex
  tenant. A new host has nothing there. P7.3 must drive the Channex OAuth widget
  (token route exists) so the host connects Airbnb inside Channex, then import.
  Confirm the whitelabel Channex account supports per-host OAuth mapping.
- **Webhooks**: connect/activate already registers the `booking_new/mod/cancel`
  webhook per property — no new work, but verify it fires for a scaffolded prop.

---

## 7. Decision points for Cesar (architecture-class — raising per CONSULT FLAG)

1. **Timezone source.** (a) derive IANA tz from lat/lng — needs a coords→tz
   lookup (no dep present today; `tz-lookup` is tiny/offline but is a *new
   dep* → needs the no-new-deps justification), or (b) a free reverse-tz API
   call at import, or (c) a timezone `<select>` in the form defaulted from
   coords. **Recommend (a)** offline lib — deterministic, no network, testable;
   it's the linchpin and shouldn't depend on a flaky API.
2. **Canonical add-property surface.** The `/onboarding` wizard vs the
   `/properties` URL-import modal — we have two. **Recommend** the first-run
   card routes into the **wizard** (it already collects details + tz-able
   address + calendar), and the modal stays as the quick "add another." Align
   both on the shared `bootstrapNewProperty`.
3. **Airbnb new-host connect.** Confirm the approach is "drive the Channex OAuth
   widget + import" (vs deferring Airbnb to manual Channex setup for the first
   hosts). This is the biggest unknown and depends on Channex tenant behavior.
4. **Free-first onboarding.** Confirm property #1 onboards on Free (iCal), with
   Pro/live-channel push as the upsell — i.e. we do NOT block onboarding on
   Stripe being live.

---

## 8. HOLD

Reporting investigation + plan. No code until Cesar approves scope + the §7
decisions. Then build P7.1 → P7.4 merge-on-green, OTA-touching steps gated +
controlled like A4.
