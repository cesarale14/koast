---
name: channex-expert
description: Expert on Channex (app.channex.io) — the channel manager connecting PMSes to OTAs (Airbnb, Booking.com, Vrbo, Expedia, Agoda). Trigger on any task involving the Channex API, a Channex integration, rate plan mapping, Channex restrictions, Channex webhooks, reviews/messages via Channex, channel activation/reconnect, or specific endpoints like /restrictions, /bookings, /booking_revisions/feed, /reviews, /message_threads, /properties, /channels, /rate_plans, /applications. Also trigger on RATE_IS_A_SLAVE_RATE, getRestrictionsBucketed, filter[restrictions], ota_reservation_code, token_invalid, parent_rate_plan_id, derived rate plan, guest_review submit, or channex_messages app. Do NOT trigger on non-Channex channel managers (SiteMinder, MyAllocator, Hospitable, Rentals United, Nuitée), PMS-native OTA integrations that bypass channel managers (Guesty direct, Hostfully direct), the Airbnb Platform API directly, or generic OTA questions without Channex context.
---

# Channex Expert

Reference skill for Channex's production API (`app.channex.io/api/v1`). Covers
the endpoints, mental models, operational playbooks, and anti-patterns that
matter for a PMS integrating with Channex as a whitelabel partner.

## What Channex is

A channel manager sits between a PMS and one or more OTAs. The PMS writes
availability + rates + restrictions through a single API; the channel manager
fans those out to each OTA in each OTA's native format (Airbnb rate plans,
Booking.com restrictions, Vrbo iCal, etc). Inbound traffic — new bookings,
modified bookings, messages, reviews — flows back through the same channel
manager via webhooks or a polling feed.

Access to the Channel API is gated to Whitelabel accounts.

## When to load which reference

- **`references/endpoint-reference.md`** — when you need a specific endpoint's
  method, path, required params, or response shape. This is the catalog.
- **`references/domain-concepts.md`** — when you're orienting to a topic for
  the first time (rate plan mapping, booking ID triad, two-sided reviews,
  application gating). Read these before designing a new integration
  surface.
- **`references/operational-patterns.md`** — when you're doing a specific
  task (reconnect a broken channel, diagnose a failed push, investigate
  duplicate properties). Each playbook is short and task-shaped.
- **`references/known-quirks.md`** — when something is behaving unexpectedly.
  Check here first before escalating to Channex support or assuming a bug
  in your own code.

## Source of truth

When the Channex docs and live API disagree, **the live API wins** and the
divergence gets documented in `known-quirks.md`. Today's reference was
built by probing live endpoints against a real Channex property
(2026-04-24) and cross-referencing the official docs. Items labelled
*probe-validated* were hit live; items labelled *docs-only* are documented
behavior not yet verified against traffic.

## Tips

- Channex's `api-reference.md` doc page lists rate limits and standard
  JSON:API response envelope rules — skim it when you hit an unexpected
  error code.
- Webhook payloads include a stable `event` type string. Treat unknown
  event types as "ignore but don't crash" — Channex adds event types
  without major-version bumps.
- When in doubt about what an endpoint returns, run a GET first against
  your own account. Channex's live behavior is more reliable than the
  docs for response shape.
