# Schema reconciliation — P6.2 (Drizzle ↔ live DB)

**Date:** 2026-06-12 · Prod project `wxxpbgbfebpkvsxhpphb` (45 base tables, authoritative)
vs `src/lib/db/schema.ts`. Verified by direct introspection + the P6-discovery workflow.

## Resolved this phase
- **H3.1 — `user_preferences` phantom read (FIXED).** The table was deliberately dropped
  (`20260507020000_drop_deprecated_config_tables`); its only reader, `isAutoApproveEnabled`,
  was issuing a 404-returning phantom query on every proposal create. Now returns `false`
  explicitly (the structural neverAutoApprove / OTA-off guards remain the real safety).
  The stale `userPreferences` declaration removed from schema.ts → that diff line is clean.
- **Vestigial pg_net turnover trigger (HELD).** `bookings_fire_turnover_task` +
  `fire_turnover_task_create()` — installed INERT in P1, never activated (the app creates
  cleaning_tasks directly). DROP written + HELD for confirm in
  `supabase/migrations/HELD_20260612020000_drop_vestigial_pg_net_turnover_trigger.sql`
  (+ optional `DROP EXTENSION pg_net`).

## Documented exceptions (deliberate, not bugs to fix blind)

### A) `message_templates` + `message_automation_firings` — declared, dropped, still referenced
Both were dropped by `20260507020000_drop_deprecated_config_tables`, but:
- `message_templates` is still **declared** in schema.ts (L679) AND referenced by ~7 live
  surfaces (TemplateManager.tsx, onboarding page, messages page, delete-account route,
  properties route, message-thread discard route, onboarding/setup-templates route).
- `message_automation_firings` is declared (L338) + referenced by the messaging_executor path.

So the message-templates **feature is degraded in prod** (reads 404→empty; writes fail).
The drop migration's name ("drop_deprecated_config_tables") implies the feature was meant
to be retired, but the UI/routes were never cleaned up.

**NEEDS-CESAR decision:** keep the feature (re-create both tables via an additive migration)
OR retire it (remove the 7 surfaces + the 2 declarations). This is a product decision, not a
mechanical schema edit — held out of P6.2's autonomous scope to avoid ripping a live feature
or resurrecting a deprecated one without intent. **Recommendation:** retire it — it was
explicitly deprecated, the AI-messaging pipeline (which would supersede static templates) is
the forward direction. A retire-cleanup is a clean follow-up slice.

### B) ~13 undeclared live tables — type-safety gap (additive, non-blocking)
Live + working via raw SQL (`(supabase.from("x") as any)`), but not declared in schema.ts so
they bypass Drizzle type-checking: pricing_recommendations, pricing_performance, pricing_rules,
user_subscriptions, proposals, host_notifications, host_action_patterns, host_surface_telemetry,
channex_outbound_log, concurrency_locks, stripe_events, channex_sync_state, weather_cache.
None is a correctness risk (the raw-SQL paths work + are tested); the gap is compile-time
type-safety only. **Follow-up:** add Drizzle `pgTable` declarations (purely additive, no DB
change) — a mechanical slice best done in one pass with `drizzle-kit introspect`. Documented
here as a known exception per P6.2's "diff clean OR every exception documented" definition of done.

## End state
The Drizzle↔DB diff is **clean for the items P6.2 owns** (user_preferences removed; pg_net held)
and **every remaining exception is documented above** with an owner + a recommended disposition.
