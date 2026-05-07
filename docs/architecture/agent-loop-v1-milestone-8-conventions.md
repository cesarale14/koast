# Agent Loop v1 — Milestone 8 Conventions

**Status:** Locked, v1.0
**Drafted:** 2026-05-05
**Canonical locations:**
- `~/koast/docs/architecture/agent-loop-v1-milestone-8-conventions.md` (repo, canonical for code-import)
- `decisions/2026-05-05-m8-conventions.md` (vault, canonical for Method-grounding via mcpvault)

**Pre-deliverables (already shipped):**
- F2 voice doctrine — `~/koast/docs/voice.md` and `method/voice-doctrine.md`
- Convergence diagnostic — `decisions/2026-05-05-convergence-diagnostic.md`

**Method grounding:** This milestone closes contradictions and absences against the seven Beliefs of `method/koast-method.md` to make Koast Method-honest at v1 launch (defined: external launch, first paying hosts).

**Naming:** "Trust Surface Convergence" — the work that closes the asymmetry where Koast can DO things but the host cannot INSPECT what Koast knows or did.

---

# Section 1 — Milestone framing

## 1.1 What M8 is

M8 is the convergence milestone that takes the shipped product (M2-M7 substrate plus mobile pass) from "substrate solid, host inspection asymmetric" to "Method-honest at v1 launch." It closes 9 active contradictions identified by the convergence diagnostic and ships the foundation pieces for the trust inspection layer (memory + activity surfaces).

The milestone is bounded: **2.5-3 weeks of focused work, 13 items in scope plus the M5 #11 fold-in.** No new substrate work beyond what items demand. No exploratory scope.

## 1.2 What M8 is not

M8 does not ship:

- F3 Zod schema enforcement at LLM call sites (deferred to M9)
- F5 voice_mode setting + Mode 2 propagation across LLM call sites (M9)
- F6 original_draft diff capture (M9)
- F8 host_action_patterns calibration substrate (M9)
- P1 confidence metadata in agent outputs (M9)
- P2 source attribution in agent text outputs (M9)
- P3 data-sufficiency thresholds per agent tool (M9)

M8 ships the *visible surface* of trust (what the host sees). M9 ships the *underlying architecture* of honesty (output schemas, refusal generation, confidence calibration). Both depend on the F2 voice doctrine (already shipped).

The full anti-scope is enumerated in Section 6.

## 1.3 Scope summary

13 items in scope, derived from the convergence diagnostic at `decisions/2026-05-05-convergence-diagnostic.md`:

**Section A contradictions (9):**
- C1 — Pulse sparkline: remove the mock or source from real data
- C2 — Hero dollar amounts → confidence-banded ranges
- C3 — Conversational onboarding (replace property-quirk form fields)
- C4 — Wire Topbar audit-log icon
- C5 — Recent activity surface (`/koast/inspect/activity`)
- C6 — Static tabs → conditional visibility per host operation
- C7 — Frontdesk placeholder removal
- C8 — Persistent chat layout slot across dashboard routes
- C9 — Drop deprecated config tables (atomic, post-audit)

**Foundation absences (3 + the M5 #11 fold-in):**
- F1 — Memory inspection UI (`/koast/inspect/memory`)
- F7 — Honest scope language across surfaces (consolidated in `/koast/guide`)
- F9 — Audit feed unification (`unified_audit_feed` VIEW)

**Polish item folded in:**
- P4 — Content-aware stakes hook (folded into M8 because it overlaps with F4 substrate work at the propose_guest_message call site)

**M5 #11 fold-in:** The CF backlog had M5 #11 (audit log surface) as deferred engineering debt; the diagnostic re-classified it as convergence-scope. M8 closes it as part of C5/F9. The CF backlog gets a cleanup note: "M5 #11 closed in M8."

**Out of scope at the architectural level:**
- Calibration tab in `/koast/inspect/` (deferred to M9 alongside F8 substrate; M8 ships two-tab surface)

## 1.4 Milestone-level effort estimate

~37 effort-units total. At ~2.5 effort-units per focused day, ~14-16 days of focused implementation work plus buffer for Round-2 questions surfacing during implementation. Realistic 2.5-3 week milestone.

Deferral levers if scope tightens:
1. Tier 2 context-aware starters (Q9a) — ship Tier 1 only, Tier 2 in a fast-follow
2. Guide sub-sections 2-3 (Q10b) — ship sub-section 1 (Capabilities) only, others in fast-follow

Both are graceful cuts that don't compromise launch-honesty.

---

# Section 2 — Architectural decisions (D1-D20)

This section is the architectural spine. Each decision is locked. Decisions reference items by their convergence-list ID (C1-C9, F1-F9, P1-P4).

## D1 — Chat layout slot mount strategy (C8)

**Decision:** Shared mount across routes. Single persistent ChatClient. Conversation ID and SSE connection survive navigation. Layout-level state store. Chat panel is a layout child of the dashboard layout, peer to the route outlet.

**Reasoning:** Per Belief 2, "the chat is pinned to every screen — the host doesn't navigate TO chat." Method-in-code: "the chat surface is a layout slot, not a route." Shared mount is the Method-faithful implementation. Per-route mount adds SSE lifecycle complexity, multiplies state-loss-on-navigation risk, and doesn't unlock the orb-mode flexibility argument it claims to (orb-mode is collapsed-state of persistent panel, not a different mount strategy).

**Implications:**
- Route renders into the sibling slot; chat panel is permanent
- Conversation state lives in layout-level store (Zustand or equivalent)
- Existing per-page ChatClient lifecycle assumptions must be audited at Phase 1 STOP and refactored if found

## D2 — SSE lifecycle on persistent mount (C8)

**Decision:** SSE persists during conversation activity, idle timeout closes the connection (5 min default), polling fallback for wakeup. Conversation state in layout-level store.

**Reasoning:** Always-on SSE accumulates server-side resources from idle hosts. Always-closed fails the "persistent mount" goal. Activity-based persistence with idle timeout balances the two. Polling fallback wakes the stream when there's something to push without requiring a separate lifecycle channel.

**Implications:**
- Idle timeout: 5 minutes (Round-2 if user feedback shows it's wrong)
- Polling interval during idle: lightweight `?any-updates` endpoint at modest frequency (Round-2)
- Stream re-opens on host interaction or polled "something to push" signal
- M9 may evolve toward dedicated lifecycle channel; M8 ships polling

## D3 — Audit data architecture (C5, F9)

**Decision:** Postgres VIEW (`unified_audit_feed`) joining five sources with normalized envelope. Not materialized. Source table + source ID preserved for drill-down.

**Sources:**
1. `agent_audit_log`
2. `channex_outbound_log`
3. `notifications`
4. `sms_log`
5. `pricing_performance`

**Envelope shape:**
```typescript
{
  occurred_at: timestamp,
  actor: 'koast' | 'host' | 'system',
  category: 'memory_write' | 'guest_message' | 'rate_push' | 'notification' | 'sms' | 'pricing_outcome',
  entity_type: text,
  entity_id: text,
  outcome: 'pending' | 'completed' | 'failed' | 'cancelled',
  summary: text,
  source_table: text,
  source_id: uuid,
  metadata: jsonb
}
```

**Reasoning:** Triggered unified table (alternative) is operational complexity overkill for M8. App-code merge is the wrong direction (re-implements joins TypeScript can't do as well as Postgres). VIEW is fast (with indexes), evolvable (no migrations to change shape), and doesn't preclude materialization later if performance demands.

**Implications:**
- VIEW filter clauses on each source restrict to host-action-relevant rows; system events excluded
- Indexes on each source for `(host_id, occurred_at)` patterns required; Phase 1 STOP audits and adds if needed
- Drill-down to source_table + source_id from inspect surface for technical detail

## D4 — Inspection surface tab scope (C5, F1)

**Decision:** Two-tab inspection surface in M8: Activity + Memory. Calibration tab deferred to M9 alongside F8 substrate.

**Reasoning:** F8 substrate is M9 work. Shipping a Calibration tab in M8 with "we're learning" empty state that never fills meaningfully (because substrate isn't doing real work) is dishonest. Two-tab surface at M8 launch satisfies Belief 4 ("show me what you're doing silently") via Activity and Belief 3 ("the host can always inspect what Koast knows") via Memory. Calibration is a future addition announced when it ships.

**Implications:**
- Route shape supports adding `calibration` as third tab in M9 without restructuring
- Layout component holds tab strip; sub-routes are siblings

## D5 — Inspection surface route shape (C5, F1)

**Decision:** Nested routes under `/koast/inspect/` parent. M8 ships `/koast/inspect/activity` and `/koast/inspect/memory`. Layout carries tab strip. M9 adds `/koast/inspect/calibration`.

**Reasoning:** Deep-linking matters (host shares "look at this Koast did" via URL). Hash fragments don't reliably round-trip. Browser back/forward navigates between tabs. Nested routes accommodate Calibration cleanly in M9.

**Naming:** `/koast/inspect/` chosen over `/koast/audit`, `/koast/transparency`, `/koast/activity`. "Inspect" is the verb the host uses naturally; neutral enough for Activity/Memory/Calibration peer tabs.

## D6 — Memory inspection primary view (F1)

**Decision:** Entity-type top-level (Property / Guest / Voice / Operational), nested sub-entities within Property, empty states with honest scope language for the three mostly-empty categories.

**Reasoning:** Belief 3 names four memory categories as peer entity types. Property-first demotes Voice and Operational to secondary surfaces, which contradicts the Method's framing. Entity-type top-level honors the Method's category structure.

**Implications:**
- Each Property card shows summary count and expandable sub-entities
- Sub-entity types: 6 canonical (front_door, lock, parking, wifi, hvac, kitchen_appliances) + Other bucket
- Voice section: empty state with observation count + Mode 1 threshold
- Operational section: empty state with F7-compliant honest scope language
- Guest section: empty state pending `guests` table (M9 or later)

## D7 — Memory edit affordances (F1)

**Decision:** Three edit affordances per fact row: correct, supersede, mark wrong. New `supersession_reason: 'outdated' | 'incorrect'` column on memory_facts to discriminate. Edits route through the agent loop (chat opens with prepopulated prompt), not inline edit.

**Reasoning:** Method consistency — memory updates are conversational, not direct edits. Audit trail integrity — every update flows through agent loop, gets paired audit row. Cascading correctness — agent loop can ask follow-up questions if needed.

**Implications:**
- Migration: add `supersession_reason` nullable column to memory_facts
- Edit affordance click → opens chat with context-aware prompt
- For "correct": prompt invites new value
- For "supersede": prompt invites obsolescence reason
- For "mark wrong": prompt frames as extraction error feedback
- "Mark wrong" signals feed M9's calibration learning (substrate ships in M8; use deferred to M9)
- No bulk operations in M8

## D8 — Hero dollar amounts: range source and treatment (C2)

**Decision (D8a — source):** Read existing range from pricing engine output. Don't recompute. Engine produces `{point_estimate, range_low, range_high, confidence, n_signals_contributing}`; dashboard reads all five.

**Decision (D8b — treatment):** Range as primary, source line below.

```
+$28-$36 weekend uplift
based on 8 comparable weekends, last 90 days
```

Below threshold (4 comparables minimum, Round-2 confirms): show "Tracking — need ~3 more weekends of data" instead of a range.

**Reasoning:** Doctrine §3.4 specifies structural confidence: range, sample size, time period, comparison set named. Confidence chips read as marketing — range size *is* the confidence signal. Source line is voice-doctrine-compliant Koast-to-host density.

**Implications:**
- Phase 1 STOP audits engine output schema; if `range_low`/`range_high`/`confidence` aren't surfaced cleanly, schema-export change is part of M8 scope
- Threshold for surface-vs-track is Round-2 (4 comparables provisional)
- Component name: `ConfidenceBandedRange`

## D9 — Conversational onboarding shape (C3)

**Decision:** Hybrid. Open elicitation primary, structured fallback for hard requirements + stable infrastructure.

**Open elicitation triggers structured fallback when:**
- A "required" memory fact is missing AND the host wants to use a dependent capability (e.g., trying to draft guest messages without door code)
- The host is mid-conversation and an action is blocked

**Required (capability hard floor for `propose_guest_message`):**
- Property name + city + property type
- Door/access code (or "set on arrival via lockbox" flag)
- Wifi name + password
- Parking instructions

**Should-have (capability uses, doesn't block):**
- Check-in time
- Check-out time
- House rules summary

**Nice-to-have (capability enhancement):**
- Local recommendations
- Property quirks
- Cleaner contact info

**Stable infrastructure (Belief 1 narrow exception, structured form):**
- Bank account, tax ID, OTA credentials, regulatory artifacts

**Reasoning:** Doctrine §4.4 specifies blocking vs. offering surfaces for "host input needed." Required-capability blocks → structured ask. Otherwise → open elicitation. Stable infrastructure stays as configuration per Belief 1.

## D10 — Onboarding opening prompt with starter questions (C3)

**Decision:** Brief context-set + open question + selectable starter questions below the input.

**Opening prompt shape:**
```
Hi — I'm Koast. I'll learn about your operation as we work together;
you don't need to fill out forms or memorize where things live in
the product. Just tell me things and I'll remember them.

Let's start with your first property — what should I know about it?

[Starter buttons appear below input]
```

**Two-tier starter generation:**

*Tier 1 (first-run, mostly static):*
- "Tell me about your first property"
- "I'm coming from another tool — here's what I had set up there"
- "Walk me through what you can do"
- "Just one property for now"

*Tier 2 (context-aware, LLM-generated):*
Generated from current sufficiency signals after the host has given any context. Examples:
- "Tell me about your Davis Islands property"
- "What should I know about your guests at Cozy Loft?"
- "Want me to start watching rates for next weekend?"

**Behavior:** Starter buttons populate the input on click but don't auto-send. Host edits before sending. Tier 1 ships in M8; Tier 2 ships in M8 if scope holds, defers if scope tightens.

**Reasoning:** Solves cold-start problem ("what do I say first?") without forcing structured path. Surfaces "host_input_needed" non-blocking gaps as offerings rather than interruptions. Voice-doctrine-compliant per §2.1.4 (warmer onboarding calibration) and §5.5 (no chipper / structured-feeling framings).

## D11 — Onboarding completion signaling (C3)

**Decision:** Sufficiency-signal-based completion (primary), idle-fallback (secondary).

**Primary path:** Koast surfaces "I have enough to start [specific capabilities]" when sufficiency_signal flips to "rich" for v1-essential capabilities. Voice example: "I think I have enough to draft check-in messages and watch your rates. Anything else worth telling me, or want me to take something off your plate?"

**Secondary fallback:** 24-hour idle threshold triggers soft re-engagement ("Want to keep going where we left off, or jump to something else?"). If no response after another 24 hours, onboarding marks complete with whatever's been captured.

**Reasoning:** Sufficiency-driven completion gives the host clear signal without checklist feel. Idle fallback handles abandoned onboarding gracefully. Combined: open elicitation has natural endings without feeling either rushed or open-ended.

## D12 — Conditional tab visibility logic (C6)

**Decision:** Per-request visibility predicates with React Query caching. Each tab declares its visibility predicate as a SQL existence check.

**Always visible (substrate-required):**
- Dashboard
- Properties
- Messages
- Pricing

**Visible when data exists:**
- Calendar (when at least one property has bookings or rate data)
- Reviews (when guest_reviews row count > 0)
- Turnovers (when cleaning_tasks row count > 0)
- Market Intel (when comp data exists)
- Comp Sets (same as Market Intel — possibly fold to one)

**Removed entirely (handled by C7):**
- Frontdesk

**Reasoning:** Belief 2 commits to "tabs reflect host's actual operation." Static 9-strip implies more depth than substrate has. Per-request visibility is fast (cheap SQL existence checks), evolvable (predicates can change), and visually clean (host sees only what's relevant).

**Implications:**
- Component: `ConditionalTabStrip`
- Each tab has a visibility predicate function
- Caching via React Query (5-minute stale time reasonable)
- Hidden tabs are silently absent from nav (no greyed-out treatment)

## D13 — Capabilities surfacing via guide (C6, F7)

**Decision:** `/koast/guide/` parent route with three sub-sections shipped in M8:
- `/koast/guide/capabilities` — list of 9 capability categories with visibility predicates explained
- `/koast/guide/memory` — Belief 3 distilled (200-300 words on how memory works)
- `/koast/guide/koast-on-your-behalf` — Belief 4 distilled (200-300 words on the control gradient + honest-scope notes about F8 calibration arriving in ~3 weeks of accumulated approvals)

Topbar affordance: small "?" or "Guide" button next to inspect icon, opens `/koast/guide/`.

**Reasoning:** F7 (honest scope language) needs a single home where the host can read the operating model. Hidden tabs are silently absent from nav (D12); the guide explains. Belief 1 framing for hosts confused about "why no settings page" lives here. Voice-doctrine-compliant per §1.3.

**Implications:**
- Components: `GuideLayout`, `GuideSubsection`, `CapabilityRow`
- Sub-section 1 (Capabilities) is required for M8; sub-sections 2-3 are deferral candidates if scope tightens
- Empty states across the product reference the guide for fuller explanation

## D14 — Frontdesk placeholder removal (C7)

**Decision:** Remove from sidebar entirely. No "Coming soon" replacement. Direct booking ships when the substrate exists, not before.

**Reasoning:** The Method commits to visible interface reflecting only what substrate actually does. "Coming soon" is the failure mode. Belief 6 implies surfaces appear when substrate justifies them — Frontdesk is anti-pattern as currently shipped.

**Implications:**
- Single sidebar config change
- No data migration needed
- If a host has a deep-link to a Frontdesk-related URL, it 404s gracefully (no redirect)

## D15 — Deprecated config tables migration (C9)

**Decision:** Atomic drop in single migration after Phase 1 STOP audit returns clean.

**Tables dropped:**
- `message_templates`
- `review_rules`
- `user_preferences`
- `message_automation_firings`

**Phase 1 STOP audits (pre-migration):**
- Code references in functional paths (expect zero)
- Production data row counts (expect zero per Method-in-code)
- FK constraints pointing into these tables (expect none)

**If audit reveals work needed:** Drop migration scope expands to handle references/data/FKs. Possible escalations: rename tables to `_deprecated_<name>` for observation period, then drop later. M8 conventions doc notes the escalation path; default is atomic drop.

**Reasoning:** Belief 1's narrow-exception-for-stable-infrastructure rejects the configure-templates-and-rules paradigm. Empty deprecated tables are configuration-creep paths of least resistance for future code. Atomic drop forces the discipline.

## D16 — Audit icon behavior (C4)

**Decision:** Click → side drawer with ~10 most recent audit entries inline + "see all activity" link to `/koast/inspect/activity`. Notification indicator (small dot) on icon when activity exists since host's last visit to inspect surface.

**Drawer entry shape:**
```
14:32 · Drafted check-in message for Sarah Mitchell · pending approval
14:21 · Saved memory: Davis Islands wifi password · committed
13:45 · Pushed rate to BDC for Cozy Loft Sat 11/15 → $215 · completed
```

**Reasoning:** Audit icon's job is "show me what just happened?" — glanceable, not deep navigation. Drawer pattern is mobile-friendly (M5 drawer infrastructure reusable) and desktop-natural. Notification indicator is functional UI per voice doctrine §1.3 (not chipper).

**Implications:**
- New `last_seen_inspect_at` timestamp column on user/host profile
- Component: `AuditDrawer`
- Indicator clears on drawer open or `/koast/inspect/activity` visit

## D17 — Activity tab content shape (C5)

**Decision (D17a — feed):** Reverse chronological. Day separators inline ("Today" / "Yesterday" / "Wed Nov 13"). Pagination/infinite scroll after ~50 entries.

**Decision (D17b — filtering):** Filtering chips at top of feed. Five categories: All / Memory / Messages / Pricing / Notifications. Active state visually clear; persistence across visits not required for M8.

**Decision (D17c — detail rendering):** Inline expand within feed. Click row → row expands to show full source detail. Click again → collapses.

**Detail content includes:**
- Full summary
- Source table reference (`agent_audit_log id=...` etc.)
- For agent actions: proposal artifact reference (link to proposal card), tool call inputs, outcome result
- For Channex pushes: collapsed-by-default request/response under "show technical detail"
- For errors: error trace, what was attempted, what host can do

**Decision (D17d — reversibility):** Yes for substrate-supported categories, with hardcoded per-category reversibility-window map for M8.

**Per-category reversibility:**
- Memory writes: indefinite (via supersession)
- Memory supersessions: indefinite (via un-supersede)
- Rate pushes: 30 minutes (via revert-push)
- Guest messages: not reversible Koast-side; recall is platform-side (Airbnb resolution center, etc.); surface "this can be recalled through Airbnb for the next 5 minutes" copy when applicable
- Notifications, SMS: not reversible; informational only

**Reasoning:** Filtering chips matter once host operations grow; ship them in M8 to avoid "I want filtering" feedback. Inline expand handles detail without route change. Reversibility surfaces Belief 4's commitment honestly.

## D18 — Refusal envelope substrate (P4 fold-in, F4 substrate)

**Decision:** TypeScript spec for `RefusalEnvelope` shipped in M8. Chat-surface rendering for envelope shipped in M8. Content-aware refusal at `propose_guest_message` shipped in M8 (P4 fold-in) — refuses on the three Koast-as-publisher categories from voice doctrine §2.3.4.

**RefusalEnvelope spec:**
```typescript
type RefusalEnvelope = {
  kind: 'hard_refusal' | 'soft_refusal' | 'host_input_needed';
  reason: string;              // 1-2 sentences, specific
  alternative_path?: string;    // for hard/soft refusal
  override_available?: boolean; // for soft refusal only
  missing_inputs?: string[];   // for host_input_needed only
  suggested_inputs?: string[]; // for host_input_needed only
};
```

**M8 refusal generation surface:** `propose_guest_message` detects requests matching the three Koast-as-publisher refusal categories (legal correspondence, regulatory submissions, substantive licensed-professional communication) and returns a `hard_refusal` envelope with the language specified in voice doctrine §2.3.4.

**M9 (deferred):** Output schema enforcement at all four LLM call sites generates RefusalEnvelopes when grounding fails. P1 confidence metadata, P3 sufficiency thresholds bind here.

**Reasoning:** F4 substrate (envelope spec + rendering) is independent of F3 schema enforcement. Shipping F4 substrate in M8 with at least one real generation case (P4 at propose_guest_message) gives M8 a verifiable refusal path without waiting for M9. P4 was polish in the diagnostic; folding into M8 closes the loop where the work overlaps.

## D19 — F7 honest scope language pattern (F7)

**Decision:** Empty state principle locked. Three things named in every empty state:
1. What this surface will become
2. What's needed to fill it
3. Where the host can act (or "fills via natural use" if no specific action)

Tone: same Koast-to-host voice, doctrine §1.3 anti-patterns explicitly apply.

**Banned framings:**
- "Coming soon!"
- "We're working on this!"
- "This feature isn't available yet."

**Specific copy is Round-2 implementation work.** Principle is locked; exact strings drafted during item implementation and reviewed against doctrine.

**Reasoning:** F7 needs to be principle-driven, not enumerated, because empty states proliferate as substrate grows. Doctrine §1.5 (substrate grows; voice extends by principle) governs.

## D20 — Implementation order (Q20)

**Decision:** Strict topological order. No parallelism within a session.

**Order:**
1. Migrations and infrastructure
2. Foundation surfaces (C8, C7, C9, C1)
3. Trust inspection foundation (F9, C5, F1)
4. Voice + refusal substrate (F4, P4)
5. Hero and tabs (C2, C6)
6. Onboarding (C3)
7. Audit affordances (C4)
8. Guide (D13's three sub-sections)
9. Honest scope language pass (F7 — applied during item implementation, finalized at end)
10. CLAUDE.md updates and M8 close

**Rationale:** Linear ordering matches M5/M6/M7 discipline. Easier to track, recover from failures, write progress notes against. Parallelism saves days at the cost of significant tracking complexity over a 2.5-3 week milestone.

---

# Section 3 — Phase 1 STOP discipline

## 3.1 Phase 1 STOP is mandatory

Every M8 session that begins implementation work runs Phase 1 STOP first. Not optional. Not "if anything looks weird." Always halt after audit and surface the structured report for human review.

## 3.2 Audit categories

### Category 1: Architectural assumptions

Verify each architectural assumption from Section 2 holds against current code:

- **D1 (chat layout slot):** Audit ChatClient mount lifecycle in current code. Does any code assume per-page mount/unmount? If yes, surface count of references, files affected, refactor estimate.
- **D2 (SSE lifecycle):** Audit current SSE connection lifecycle assumptions. Are there state assumptions incompatible with idle-timeout + polling-fallback?
- **D8a (pricing engine output):** Audit `pricing_engine` (or equivalent) public output schema. Does it expose `range_low`, `range_high`, `confidence`, `n_signals_contributing`? If not, schema-export change is part of M8 scope.
- **D7 (memory_facts schema):** Verify migration to add `supersession_reason` is non-breaking. Confirm schema declaration shape, any existing constraints.
- **D16 (topbar audit icon):** Verify icon is rendered in current code. Confirm `onOpenAuditLog` callback is unwired (per diagnostic). Confirm where to wire it.
- **D17d (reversibility):** Verify each category's reversibility substrate exists or doesn't. Memory supersession is shipped (M6); rate push revert needs implementation in M8 if not already there; guest message recall is platform-side.

### Category 2: Deprecated config table audit (D15)

For each of the four tables (`message_templates`, `review_rules`, `user_preferences`, `message_automation_firings`):

- **Code references audit:** grep across `~/koast/src/` for any reference (import, query, table name in raw SQL). Surface count and file list per table.
- **Production data audit:** SELECT COUNT(*) on each table in production. Expect zero per Method-in-code. If non-zero, surface count and recommend escalation path.
- **FK constraint audit:** Query `pg_constraint` for any FK pointing into each table. Surface any found.

**Halt point:** Any audit returning non-empty → expand C9 scope. Default escalation is rename-to-`_deprecated_<name>` for observation period, drop later. Surface the recommended escalation in the report.

### Category 3: Audit feed source verification (D3)

For each source table:
1. `agent_audit_log`
2. `channex_outbound_log`
3. `notifications`
4. `sms_log`
5. `pricing_performance`

Audit:
- Verify table exists with assumed schema
- Verify host_id column name (some sources may use `user_id` or `account_id`)
- Verify timestamp column name (`occurred_at` vs `pushed_at` vs `sent_at` vs `created_at`)
- Verify indexes exist on `(host_id, <timestamp>)` for the feed query patterns
- Map each source's columns to envelope shape; surface non-obvious mappings

**Halt point:** Any source missing required indexes → index addition is part of M8 scope. Surface recommended index DDL.

### Category 4: Convergence diagnostic re-verification

The diagnostic is dated 2026-05-05. M8 implementation may start days or weeks later. Intervening commits may have addressed some items.

For each of the 13 M8 items:
- Verify the contradiction (if applicable) still exists as described
- Verify the absence (if applicable) is still absent
- Surface any partial addressment requiring scope adjustment

### Category 5: Method document re-read

Read `method/koast-method.md` and `method/koast-method-in-code.md` via mcpvault.

Verify each architectural decision (D1-D20) against current Method commitments. Surface any drift.

The Method may have evolved since the diagnostic was produced. M8 implements against the current Method, not a snapshot.

### Category 6: Voice doctrine binding verification

Read `~/koast/docs/voice.md` (or `method/voice-doctrine.md` via mcpvault).

Verify §6.7 convergence-item-specific bindings match this conventions doc. For each M8 item involving voice work, confirm what doctrine sections it imports.

## 3.3 Halt report shape

After audit, Claude Code halts and produces this structured report. Human reviews and signs off (or requests adjustments) before any code changes.

```
PHASE 1 STOP — M8 conventions audit
Generated: <timestamp>
Conventions doc: ~/koast/docs/architecture/agent-loop-v1-milestone-8-conventions.md (commit <hash>)
Method: method/koast-method.md (last update <date>)
Voice doctrine: ~/koast/docs/voice.md (last update <date>)

=== Category 1: Architectural assumptions ===
✓ D1 chat layout slot: <evidence>
✗ D2 SSE lifecycle: <what was found instead, with refactor estimate>
[etc. for each architectural decision in scope]

=== Category 2: Deprecated tables audit ===
message_templates: <code references count>, <data rows>, <FKs>
review_rules: ...
user_preferences: ...
message_automation_firings: ...
Recommendation: <atomic drop / escalation path>

=== Category 3: Audit feed source verification ===
agent_audit_log: <table state, schema match, index audit>
channex_outbound_log: ...
[etc.]
Recommended index additions: <DDL list>

=== Category 4: Convergence diagnostic re-verification ===
C1 (sparkline): <still present / addressed>
[etc. for each M8 item]
Scope adjustments recommended: <list>

=== Category 5: Method document drift ===
<Any drift between conventions doc D1-D20 and current Method>

=== Category 6: Voice doctrine binding verification ===
<Bindings confirmed / mismatches>

=== Outstanding ambiguities or human-decisions-needed ===
<Each item, with what's blocked by it>

=== Recommended next action ===
<Sign-off & proceed / adjust X then proceed / deeper investigation needed>
```

## 3.4 Round-2 questions (deferred to implementation)

Some decisions are deliberately deferred to surface during implementation. Conventions doc names them so Claude Code surfaces, not silently chooses:

1. **D2** — SSE wakeup polling specifics (interval, payload shape)
2. **D8b** — Threshold for surface-vs-track on hero ranges (4 comparables provisional)
3. **D11** — Idle threshold for onboarding completion fallback (24-hour provisional)
4. **D16** — Notification indicator state model (when does dot appear/clear)
5. **D17d** — Per-category reversibility window specifics
6. **D19** — Specific empty state copy strings (principle locked; exact wording not)
7. **D3** — Index gaps on source tables (revealed by Phase 1 STOP audit)
8. **D7** — Chat prompt templates for edit affordances (correct/supersede/mark-wrong)

Each surfaces during Phase 1 STOP or early implementation. Human resolves before that surface ships.

---

# Section 4 — Implementation order and smoke gates

## 4.1 Sequenced item order (per D20)

**Phase A — Migrations and infrastructure (Days 1-2)**
- Migration: add `supersession_reason` to memory_facts (D7)
- Migration: drop deprecated config tables (D15, atomic post-audit)
- Migration: index additions on audit feed sources (if Phase 1 STOP audit reveals gaps)
- Database VIEW: `unified_audit_feed` (D3)

**Phase B — Foundation surfaces (Days 3-5)**
- C8: Persistent chat layout slot + SSE lifecycle (D1, D2)
- C7: Frontdesk placeholder removal (D14)
- C1: Sparkline removal or real-data sourcing (decision: remove for M8; track real-data implementation in CF backlog)

**Phase C — Trust inspection foundation (Days 6-10)**
- F9: Audit feed unification (D3 — VIEW already created in Phase A; this phase wires it to query helper)
- C5: `/koast/inspect/activity` route, ActivityFeed component, filtering chips, inline-expand detail (D5, D17)
- F1: `/koast/inspect/memory` route, MemoryBrowser component, edit affordances routing through agent loop (D5, D6, D7)

**Phase D — Voice + refusal substrate (Days 11-12)**
- F4: RefusalEnvelope TypeScript spec, chat-surface rendering (D18)
- P4: Content-aware refusal at propose_guest_message for Koast-as-publisher categories (D18)

**Phase E — Hero and tabs (Days 13-15)**
- C2: ConfidenceBandedRange component, dashboard integration (D8)
- C6: ConditionalTabStrip with visibility predicates (D12)

**Phase F — Onboarding (Days 16-18)**
- C3: Conversational onboarding flow, opening prompt + starter generation (Tier 1 + Tier 2 if scope holds), sufficiency-signal completion + idle fallback (D9, D10, D11)

**Phase G — Audit affordances (Day 19)**
- C4: AuditDrawer component, topbar icon wired, notification indicator (D16)
- Migration: add `last_seen_inspect_at` column

**Phase H — Guide (Days 20-21)**
- `/koast/guide/` route layout
- Sub-section: Capabilities (required)
- Sub-section: How memory works (defer if scope tight)
- Sub-section: How Koast works on your behalf (defer if scope tight)

**Phase I — Honest scope language pass (Day 22)**
- F7: Audit empty states across all M8 surfaces, ensure D19 principle is honored
- Doctrine compliance review on all new copy

**Phase J — M8 close (Day 23)**
- CLAUDE.md updates: M8 conventions reference added
- DESIGN_SYSTEM.md §15 updated to reference voice doctrine
- M5 #11 closed in CF backlog (cleanup note)
- M8 implementation report drafted

Total: 23 working days = 4.5 weeks at single-track pace, 2.5-3 weeks at typical Cesar pace with sustained focus.

## 4.2 Mid-milestone smoke gates

After each Phase, brief verification before next Phase begins. Smoke gate is *executable*, not just visual review. Each one runs against a real environment (typically staging) with real data.

**Gate after Phase A (migrations + VIEW):**
- Migrations apply cleanly to staging
- Drop migration succeeds (post-audit confirmed clean)
- VIEW returns rows; envelope shape correct; host_id filtering works
- No production-side breakage (verify with smoke query)

**Gate after Phase B (foundation surfaces):**
- Chat panel persists across all dashboard routes
- Conversation state survives navigation
- SSE idle timeout triggers; polling reconnects when needed
- Frontdesk tab gone from sidebar; deep-linked Frontdesk URLs 404 cleanly
- Sparkline gone (or real-data version in if that's the path)

**Gate after Phase C (trust inspection foundation):**
- `/koast/inspect/activity` renders feed for real test host
- Filtering chips work; inline expand reveals source detail
- `/koast/inspect/memory` renders entity-grouped facts for real test host
- Edit affordances open chat with prepopulated prompt; agent loop runs the update; memory_facts row updated correctly with supersession_reason
- All three reversibility affordances function (memory undo, rate push revert, supersede un-supersede)

**Gate after Phase D (refusal substrate):**
- `propose_guest_message` with legal/regulatory/licensed-professional content returns RefusalEnvelope with kind='hard_refusal'
- RefusalEnvelope renders correctly in chat surface (doctrine-compliant voice)
- Override doesn't apply for hard refusal; redirect language correct

**Gate after Phase E (hero and tabs):**
- Dashboard hero shows `+$28-$36 weekend uplift` style range with source line
- Below-threshold case shows "Tracking" copy
- Visibility predicates correctly hide/show tabs per host data state
- Cross-property test: same code shows different tabs to different test hosts

**Gate after Phase F (onboarding):**
- Fresh test host onboards through conversational flow
- Opening prompt + starters render
- Tier 1 starters populate input on click without auto-send
- Tier 2 starters generate context-aware after first host signal
- Required-fact gap triggers structured fallback when capability is requested
- Sufficiency signal flips, "I have enough to start" surfaces
- 24-hour idle threshold simulated (ff for testing) → soft re-engagement

**Gate after Phase G (audit affordances):**
- Topbar icon click opens AuditDrawer with ~10 most recent entries
- "See all activity" navigates to /koast/inspect/activity
- Notification indicator appears on icon when activity since last_seen_inspect_at
- Indicator clears on drawer open

**Gate after Phase H (guide):**
- /koast/guide/ route renders layout
- /koast/guide/capabilities lists 9 categories with visibility predicate explanations
- (If shipped) /koast/guide/memory and /koast/guide/koast-on-your-behalf render with content
- Topbar guide button navigates correctly

**M8 close gate (Phase J):**
- Full smoke against staging with real test data
- Real-host onboarding through C3 conversational flow (verify production-shape, not just feature-shape)
- Real audit data flowing through unified VIEW
- Persistent chat across all dashboard routes
- Memory inspection on accumulated memory_facts (M6 + M8 data)
- Hero ranges showing on dashboard with real pricing engine output
- All voice doctrine surfaces reviewed against doctrine

## 4.3 Escalation patterns

**If a smoke gate fails:**
1. Surface the failure to human via session note in `milestones/M8/items/<item-name>.md`
2. Do not proceed to next Phase
3. Diagnose: is this a substrate issue (existing code wrong) or implementation issue (M8 code wrong)?
4. If substrate: surface CF-style entry in `milestones/M8/round-2-questions.md`, escalate to human decision
5. If implementation: fix in current Phase, re-run smoke gate

**If Phase 1 STOP reveals scope expansion:**
1. Surface the expansion in halt report
2. Human decides: absorb into M8 scope (slip schedule), defer item to M9, or split (some now, some later)
3. Update conventions doc with revised scope
4. Re-run Phase 1 STOP if architectural decisions changed

**If a Round-2 question surfaces during implementation:**
1. Halt the current item
2. Surface the question via session note
3. Human resolves
4. Resume implementation
5. Update `milestones/M8/round-2-questions.md` with the resolution

---

# Section 5 — Deliverable specification

## 5.1 Code artifacts

**Migrations (`~/koast/drizzle/migrations/`):**
1. `add_supersession_reason_to_memory_facts.sql` — D7
2. `add_last_seen_inspect_at_to_user_profile.sql` — D16
3. `drop_deprecated_config_tables.sql` — D15 (post-audit, atomic)
4. Index additions per Phase 1 STOP audit findings — D3
5. (Possibly) pricing engine schema-export changes — D8a, if Phase 1 STOP reveals need

**Database VIEW:**
- `unified_audit_feed` — D3

**Frontend routes:**
- `/koast/inspect/_layout` — D5
- `/koast/inspect/activity` — D17
- `/koast/inspect/memory` — D6
- `/koast/guide/_layout` — D13
- `/koast/guide/capabilities` — D13 sub-section 1
- `/koast/guide/memory` — D13 sub-section 2 (deferral candidate)
- `/koast/guide/koast-on-your-behalf` — D13 sub-section 3 (deferral candidate)

**Frontend components (new):**
- `ActivityFeed` (D17)
- `MemoryBrowser` (D6, D7)
- `AuditDrawer` (D16)
- `StarterQuestions` (D10)
- `ConditionalTabStrip` (D12)
- `ConfidenceBandedRange` (D8)
- `GuideLayout`, `GuideSubsection`, `CapabilityRow` (D13)
- `EmptyState` (D19)
- `RefusalEnvelopeRenderer` (D18)

**Frontend modifications:**
- Dashboard layout: chat as persistent layout slot (D1, D2)
- Topbar: audit icon wired (D16), guide icon added (D13)
- Pricing dashboard: hero amounts → `ConfidenceBandedRange` (D8)
- DashboardView: pulse sparkline removed
- Sidebar/nav: Frontdesk removed (D14)
- Onboarding route: replaced with conversational flow (D9, D10, D11)

**Backend additions:**
- `unified_audit_feed` query helper (D3)
- Sufficiency-signal hooks for onboarding completion (D11)
- Visibility predicate functions per tab (D12)
- Starter generation: Tier 1 selector + Tier 2 LLM-generation endpoint (D10)
- Memory edit chat-prompt templates (D7)
- `RefusalEnvelope` TypeScript spec + rendering (D18)
- `propose_guest_message` content-aware refusal (D18, P4 fold-in)
- "Last seen" timestamp tracking (D16)
- Pricing engine schema-export (D8a, if needed)

**Backend modifications:**
- ChatClient SSE lifecycle: idle timeout + polling fallback (D2)

**Configuration / docs:**
- `~/koast/CLAUDE.md` updated: M8 conventions reference, M5 #11 closed in backlog
- `~/koast/DESIGN_SYSTEM.md` §15 updated to reference voice doctrine

## 5.2 Test artifacts

Required test coverage (target ~100-150 net new tests):

- `ActivityFeed` rendering: empty / sparse / dense / each category
- `ConditionalTabStrip` visibility logic per predicate
- `AuditDrawer` recent-entries query + "see all" navigation
- `MemoryBrowser` entity grouping + edit affordance interactions
- `ConfidenceBandedRange` rendering with various data + threshold-fallback
- `ConversationalOnboarding` flow: opening + starter rendering + sufficiency-completion + idle fallback + structured fallback for hard requirements
- Audit VIEW query correctness across all five sources
- `RefusalEnvelope` rendering for hard / soft / host_input_needed
- Content-aware refusal at propose_guest_message for legal / regulatory / licensed-professional

Test count is a quality signal, not a quality gate. Aim for coverage that catches regressions, not coverage for its own sake.

## 5.3 Documentation artifacts

**Vault writes (via mcpvault):**
- `decisions/2026-05-XX-m8-conventions.md` — this conventions doc, mirrored
- `milestones/M8/scope.md` — locked scope summary
- `milestones/M8/round-2-questions.md` — deferred decisions tracker
- `milestones/M8/items/<item-name>.md` — per-item progress notes during implementation
- `milestones/M8/report.md` — implementation report at milestone close

**Repo writes:**
- `~/koast/docs/architecture/agent-loop-v1-milestone-8-conventions.md` — this doc, canonical
- `~/koast/docs/architecture/agent-loop-v1-milestone-8-report.md` — close-of-milestone report

**CLAUDE.md updates:**
- M8 conventions reference under "milestones" section
- M5 #11 fold-in note: backlog item closed as part of M8

## 5.4 Phase gates

- **Phase 1 STOP gate:** Audit completes, structured report generated, human signs off before code changes
- **Mid-milestone smoke gates:** After each of Phases A-H, smoke gate runs (Section 4.2)
- **M8 close gate:** Full staging smoke against real data (Section 4.2)

---

# Section 6 — Anti-scope (explicit)

## 6.1 Deferred to M9

- **F3** — Zod schema enforcement at LLM call sites
- **F5** — voice_mode setting + Mode 2 propagation across LLM call sites
- **F6** — original_draft diff capture for voice learning
- **F8** — host_action_patterns calibration substrate
- **P1** — confidence metadata in agent outputs
- **P2** — source attribution in agent text outputs
- **P3** — data-sufficiency thresholds per agent tool

## 6.2 Deferred past convergence (M10+ or open-ended)

- `guests` table + back-population from booking columns
- Voice extraction worker (Mode 1 generative voice)
- Sub_entity_type vocabulary expansion
- Operational memory category build-out
- Orb-mode foregrounding (collapsed-chat affordance)
- Multi-user model + RLS rewrites
- Agent tool catalog expansion (~36 missing tools per Method-in-code Phase 2)
- Direct booking subsystem
- Acquisition speculation paths (per diagnostic appendix — Path 1-4)

## 6.3 Not in M8 even though tempting

- Bulk operations on memory (D7 — single-fact ops only at v1)
- SSE wakeup lifecycle channel (D2 — polling fallback for M8)
- Materialized audit feed (D3 — regular VIEW)
- Detail-page deep-linking for individual audit entries (D17c — inline expand only)
- Tier 2 context-aware starters if scope tightens (D10 — Tier 1 sufficient)
- Guide sub-sections 2-3 if scope tightens (D13 — sub-section 1 sufficient)
- Filtering beyond locked 5 categories (D17b)

## 6.4 Substrate enabling work happening *during* M8 (not anti-scope)

These look like scope expansion but are the cost of doing the items right:

- Index additions on audit feed source tables (if Phase 1 STOP reveals gaps)
- `supersession_reason` column migration on memory_facts
- `last_seen_inspect_at` column addition on user profile
- Pricing engine schema-export changes (if Phase 1 STOP reveals need)
- ChatClient mount lifecycle refactor (if Phase 1 STOP reveals current code assumes per-page mount)

These are surfaced explicitly so Claude Code doesn't treat them as scope creep.

---

# Section 7 — Implementation prompt for Claude Code

This is the handoff document Claude Code receives when M8 implementation begins. It's structured as the runbook for the milestone.

## 7.1 Session start protocol

Every M8 implementation session begins with:

```
1. Pull vault: cd ~/koast-vault && git pull
2. Read via mcpvault:
   - decisions/2026-05-05-m8-conventions.md (this doc)
   - method/koast-method.md
   - method/voice-doctrine.md
   - milestones/M8/scope.md
   - milestones/M8/round-2-questions.md
   - milestones/M8/items/<current-item-name>.md (if mid-item)
3. Read repomix-output.txt for current code state
4. Confirm session focus with human: "Working on Phase X, item <Y>?"
```

If session is the first M8 session post-conventions-lock, run Phase 1 STOP per Section 3.

## 7.2 Phase 1 STOP execution

First M8 implementation session executes Phase 1 STOP audit per Section 3. Specifically:

1. Read Section 3 of this conventions doc (audit categories)
2. Execute each audit category's checks
3. Produce structured halt report per Section 3.3 shape
4. Write report to `milestones/M8/phase-1-stop-report.md` via mcpvault
5. Commit report: `cd ~/koast-vault && git commit -am "M8: Phase 1 STOP audit complete" && git push`
6. Halt — do not proceed to implementation
7. Surface to human: "Phase 1 STOP report at milestones/M8/phase-1-stop-report.md. Sign off before I begin implementation."

Do not proceed to any code changes until human review and sign-off.

## 7.3 Per-item implementation pattern

For each item (C1-C9, F1, F4, F7, F9, P4):

1. Read `milestones/M8/items/<item-name>.md` if exists, else create it via mcpvault
2. Verify the item's architectural decisions (referenced D1-D20 in this conventions doc)
3. Verify the item's voice doctrine bindings per voice doctrine §6.7
4. Implement per the architectural decisions
5. Write tests covering the acceptance criterion
6. Update `milestones/M8/items/<item-name>.md` with progress, decisions made, test additions
7. Run the item's smoke gate (Section 4.2)
8. Commit code with substantive message: `git commit -m "M8 <item-id>: <what shipped>"`
9. Update CF backlog if any new CFs surfaced

## 7.4 Round-2 question protocol

When a Round-2 question surfaces during implementation:

1. Halt the current item
2. Write question to `milestones/M8/round-2-questions.md` with:
   - What's blocked
   - What candidate resolutions exist
   - Recommended resolution if any
3. Commit and push
4. Surface to human: "Round-2 question on <item>: <summary>. See milestones/M8/round-2-questions.md."
5. Wait for human resolution
6. Resume implementation with locked answer

## 7.5 Doctrine compliance review

Every voice-bearing surface (every M8 item that produces host-facing or guest-facing language) gets a doctrine compliance review before its smoke gate passes. Review checks:

- Voice context correct (Koast-to-host vs. host-to-guest vs. Koast-as-publisher)
- Calibration axes per surface (density, formality, hedging, technical precision, length)
- Anti-patterns (voice doctrine §5) absent
- Confidence calibration honest (voice doctrine §3)
- Refusal patterns correct shape (voice doctrine §4) where applicable

If review fails: revise copy, re-run review, then smoke gate.

## 7.6 Vault hygiene during M8

Vault writes go through mcpvault per the policy in CLAUDE.md. No exceptions. If mcpvault unavailable in a session: halt, surface, do not fall back to filesystem writes.

Per-session vault writes expected:
- Session note at session start (`sessions/YYYY-MM-DD-m8-<topic>.md`)
- Item progress note as implementation proceeds (`milestones/M8/items/<item-name>.md`)
- Round-2 questions if surfaced (`milestones/M8/round-2-questions.md`)
- Phase 1 STOP report (one-time, first M8 session)

Per-session Git operations:
- `git pull` at session start in vault
- `git pull` at session start in koast repo
- `git commit && push` after substantive work in either repo
- Commit messages substantive (per CLAUDE.md vault policy)

## 7.7 Milestone close protocol

Final M8 session executes:

1. Verify all 13 items + P4 fold-in shipped (refer to `milestones/M8/scope.md`)
2. Verify all smoke gates passed
3. Run M8 close gate (full staging smoke per Section 4.2)
4. Draft `milestones/M8/report.md` covering:
   - What shipped (per item)
   - What was deferred (with reasoning)
   - Round-2 questions resolved during implementation
   - Carry-forwards generated (CFs from M8 work that didn't fit)
   - M5 #11 closed (CF backlog cleanup note)
   - Voice doctrine evolutions if any
5. Mirror report to `~/koast/docs/architecture/agent-loop-v1-milestone-8-report.md`
6. Update `~/koast/CLAUDE.md` with M8 conventions reference, M5 #11 cleanup note
7. Tag the milestone close commit
8. Surface to human: "M8 shipped. Report at milestones/M8/report.md."

---

# Section 8 — References

## 8.1 Method documents

- `method/koast-method.md` — the seven Beliefs and values commitment
- `method/koast-method-in-code.md` — engineering grounding of Method commitments

## 8.2 Voice doctrine

- `~/koast/docs/voice.md` — code-import canonical
- `method/voice-doctrine.md` — Method-grounding canonical

## 8.3 Convergence diagnostic

- `decisions/2026-05-05-convergence-diagnostic.md` — 22-item gap analysis against Method

## 8.4 Prior milestones

- M5 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-5-conventions.md`
- M6 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-6-conventions.md`
- M7 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-7-conventions.md`
- M7 report: `~/koast/docs/architecture/agent-loop-v1-milestone-7-report.md`

## 8.5 Project-level documents

- `~/koast/CLAUDE.md` — project working agreements, vault policy
- `~/koast/DESIGN_SYSTEM.md` — visual + interaction conventions
- Repomix output: `~/koast/repomix-output.txt`

---

*End conventions, v1.0.*
