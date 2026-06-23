---
name: koast-development
description: Working context for Koast (formerly StayCommand, app.koasthq.com) — the ~/koast repo, the agent action-layer (read-as-blocks / write-as-proposal / host-approves), the reconciled proposal + confidence design system, Channex OTA integration, two-tier calendar_rates model, apply/sync/per-channel push paths, pricing engine, whiplash guard, buildSafeBdcRestrictions, getRestrictionsBucketed, bootstrapNewProperty onboarding, Villa Jamaica/Cozy Loft test properties, and STR PMS pricing/calendar/booking-sync/messaging/reviews work. Skip for unrelated code or the Ireland VPS BTC5MIN/Polymarket/weather bots.
---

# Koast Development

Koast is an STR PMS competing with Hospitable, Hostfully, and
PriceLabs. Target users are Type B power hosts (solo operators, 3-30
properties) first and Type A cohost companies (managing for owners)
second. Tiering is Free (iCal read-only) vs Pro (Channex two-way
sync passthrough). Live at `app.koasthq.com`; repo at `~/koast`
(branch `main`, auto-deploys to Vercel). Solo founder codebase,
built with Claude Code in session arcs.

**Current state: v1.0.0 SHIPPED** (tag `cf8e9b0`, 2026-06-18 — A1–A6
acceptance all PASS), followed by the coherence design pass. The
arc is the M14 *cockpit* roadmap reaching ship. A fresh session
should treat the product as launched-but-not-yet-public: it works
end to end for the operator, and the launch gates below are flipped
the day the first *external* host signs up. Full reconstruction in
the vault: `milestones/M14/M14-v1-launch-and-design-pass.md`
(`[[M14-v1-launch-and-design-pass]]`), arc at `[[M14-cockpit-roadmap]]`.

## PRODUCT NORTH-STAR (the lens for every decision)

**Koast is an agent that runs the operation — proactive +
autonomous-by-earned-trust — not a PMS with a chatbot.** Judge every
feature by two questions: does it make the agent **more proactive**
(pre-answers, doesn't wait to be queried), and does it **earn more
autonomy** (trustworthy-enough-to-delegate)? This is the cockpit
vision (`[[M14-cockpit-roadmap]]` pillars 1 + 4) and it is the standing
lens the operator wants applied to every post-v1 phase. The
Agent-PMS doctrine (`[[koast-operational-doctrine]]`, 8 points) is the
canonical operating layer — read it before touching agent voice,
tool contracts, or navigation.

## Agent action-layer model (invariant)

The agent acts through one shape, no side-doors:

- **Read = blocks/cards.** The agent renders state (a booking, a
  rate, a thread) as typed blocks via the block→component registry
  (`BlockData` discriminated union), not prose dumps.
- **Write = proposal.** The agent never mutates external state
  directly. It emits a **proposal** the host approves. Two backend
  lanes exist and must stay reconciled:
  - **proposals lane** — `createProposal` / `/api/proposals`,
    atomic claim, `requiresGate:false`. At-most-once is enforced by
    the atomic claim `UPDATE … .in("status",["pending","failed"])`
    plus the invariant **`status='failed' ⟺ Channex did NOT send`**.
  - **artifact lane** — the M7 D35 dispatcher fork, `agent_artifacts`,
    `/api/agent/artifact`.
- **Approve through the same route.** Both lanes render the **one**
  presentational `ProposalCardView` and approve through the lane's
  own claim path. **Claim-once is proven from both lanes.** Don't add
  a second approve path; extend the card/route.
- **`send_guest_reply`** (live guest send, host-gated) carries the
  structural **`neverAutoApprove`** flag and runs J1–J6 voice judges
  at propose-time. It reuses the M7 Channex single-writer. NEVER make
  it auto-approvable. (`propose_guest_message` is retired.)
- **J3 fail-open is valid ONLY while host-approval gates the send.**
  Any future auto-send call-site must flip fail-mode to
  fail-closed-or-stricter first (see CLAUDE.md J3 binding contract).

## Design system — the reconciled rules (HARD INVARIANTS)

The v1 design pass unified three drifted visual languages + a
half-finished rebrand into one. **Canonical record + rationale: the
vault decisions hub `decisions/2026-06-23-design-system-reconciliation.md`
(`[[2026-06-23-design-system-reconciliation]]`). Live token contract:
`~/koast/DESIGN_SYSTEM.md` reconciled header + `src/app/globals.css`.**
Read those before any UI work — don't restate token values from
memory. The locked decisions, one line each: **Q1** teal accent
system; **Q2** mono = machine-truth / warm-sans = human-voice
(Fraunces display-only); **Q3** one token layer.

**Two HARD INVARIANTS (never violate):**
- **GOLD = MONEY ONLY.** Gold (`--golden`) appears iff the thing is a
  dollar amount — the learnable "Koast found money" signal. If it's
  not money, it's teal. Any other gold use is a bug.
- **CONFIDENCE IS NEVER A WARNING COLOR.** The confidence system never
  uses amber/coral. An early estimate is a disclosure, not a problem.
  (Warnings are a separate axis: `--amber-tide`.)

**Sweep traps** (the recolor created these — they matter for the
Phase-4 sweep): legacy tokens are already teal-by-role, don't "fix"
toward green; `neutral-*` is remapped to warm Koast tones in
`tailwind.config.ts` — **do not mass-sweep `neutral-*`**; the
genuinely banned literals are stock
`red-*`/`indigo-*`/`blue-*`/`purple-*`/`yellow-*` + emoji.

Still binding from before the pass: no emojis, no pulsing/glowing
dots (solid status dots only), no default Tailwind grays/shadows, no
chart libraries (Canvas + rAF), platform logos via `src/lib/platforms.ts`.
See `~/koast/DESIGN_SYSTEM.md`.

## Confidence system — the trust spine

One **`ConfidenceCue`** primitive (driven by `ConfidenceEnvelope`,
`src/lib/agent/confidence/envelope.ts`) renders **identically across
the proposal card, the rate block, and the inbox draft bubble**.
Three signals: **thin-comps** ("Early estimate"), **draft** (reply
awaiting approval), **new_guest** ("first message to this guest").
Register is **competence, not apology** — states what it knows
plainly, and is **silent when confident**. When adding a confidence
signal, extend the cue/envelope; don't invent a new chip, and don't
reach for a warning color.

The proposal card's **before→after delta is focal** (not buried in
prose): **gold ▲ for a raise**, **neutral ▼ for a drop** (a drop is
never coral).

## Onboarding — single creation path + the new-host pattern

- **`bootstrapNewProperty` (`src/lib/properties/bootstrap.ts`) is the
  SINGLE property-creation path.** Every creation route (Channex
  import, `POST /api/properties`, import-from-url) funnels through it
  so a new property is born with the non-null invariants the rest of
  the system assumes. Do not create a property row outside this path.
- **Non-null-timezone invariant.** A `timezone=NULL` property silently
  drops out of the agenda/Today computation. Bootstrap sets it;
  anything that creates or migrates property rows must preserve it.
- **THE PATTERN to watch for: "works for the original 2 properties,
  silently no-ops for new hosts."** Every v1 launch blocker was this
  shape — code that implicitly assumed the seeded Villa Jamaica /
  Cozy Loft state and did nothing for a host starting from zero
  (the tz-null agenda-skip, a content/capability store-split, a
  validator that filtered to known properties, a dead
  `get_active_properties` trap). **Rule: any per-property validator,
  deriver, or loop must enumerate NEW hosts, not the seeded set.**
  When touching one, test with a fresh account, not the test properties.

## Launch gates (flip the day the first external host signs up)

Deliberately not flipped yet — they cost money or change posture:
- **Stripe live keys + the $79 Pro price object.** Env currently
  points at a **$149 Business** price object; the Pro tier is **$79** —
  that price object must exist before real billing.
- **Supabase PITR on** (point-in-time recovery).
- **Per-property OTA-write posture** — set the clobber-safe write
  posture per property deliberately, not inherited from the test
  property's flipped `KOAST_ALLOW_BDC_CALENDAR_PUSH`.
- **(Optional) VAPID push-key rotation.**

## Environments

Two Supabase projects, one codebase (established 2026-05-02):
- **Production** `wxxpbgbfebpkvsxhpphb` (`aws-1-us-east-1`) — live
  `app.koasthq.com`.
- **Staging** `aljowaggoulsswtxdtmf` (`aws-0-us-east-1`) — free tier.

Switch locally with `source ~/koast/.env.staging` /
`source ~/koast/.env.local` (both gitignored); `echo
"$SUPABASE_PROJECT_REF"` to confirm which is active. **Migration
discipline:** every new migration runs against staging first, gets
verified, then production; applies are recorded in
`koast_migration_history`. **A migration file is locked once applied
to any environment** — corrections ship as a NEW migration. Every
table-creating migration includes an explicit `ALTER TABLE … ENABLE
ROW LEVEL SECURITY` (staging lacks the prod auto-enable trigger). See
`~/koast/docs/architecture/staging-environment.md`.

## Workflow

Every Koast session follows this pattern:

1. **Read the baseline** — `~/koast/CLAUDE.md` for project-level
   rules and current state, `~/koast/repomix-output.xml` for the repo
   map. Both first.
2. **Read the scoped context** — for cockpit/agent/product-direction
   work, read `docs/cockpit-roadmap-spec.md` (the living spec) and
   the vault arc `[[M14-cockpit-roadmap]]`. For the design system /
   proposal-card / confidence work, read `DESIGN_SYSTEM.md` +
   `docs/koast-v1-design-pass-build-plan.md` + the launch record
   `[[M14-v1-launch-and-design-pass]]`. For strategic work,
   `ROADMAP/PATH_TO_5K.md` and `ROADMAP/FEATURE_INVENTORY.md`.
3. **Diagnose before coding** — for non-trivial bugs or behavior
   changes, run a read-only investigation first, report findings,
   wait for the user to approve scope. See `references/conventions.md`.
4. **Know the Channex traps** — see `references/channex-reference.md`
   for the endpoint-specific gotchas that have bitten us before. The
   `channex-expert` skill auto-composes alongside this one for
   Channex-touching tasks; consult both.
5. **Respect the architectural invariants** — the agent action-layer
   model above (read-as-blocks / write-as-proposal / one approve
   route), the design hard-invariants (gold=money-only,
   confidence-never-a-warning-color), the single onboarding creation
   path, the two-tier `calendar_rates` model, and the three push
   paths (apply / sync / per-channel) and which carry the whiplash
   guard. See `references/architecture.md`.
6. **Commit discipline** — a self-contained session commits once with
   a detailed body. UI / design-pass work runs as focused slices,
   merge-on-green (tsc + ESLint + jest each commit), with the
   operator's eye on the render between slices — not a session-tail
   batch. Follow CLAUDE.md's TIER model + commit format (no
   Co-Authored-By trailer).

## Reference material

- `references/architecture.md` — Next.js + Supabase + Channex + VPS
  layout, table-by-table domain model, three push paths.
- `references/channex-reference.md` — endpoint reference, the quirks
  list that has tripped us up (rate format, pagination, filter
  params), the safety pattern behind `buildSafeBdcRestrictions`.
- `references/conventions.md` — session numbering, commit style,
  diagnose-first workflow, verification-test-path convention,
  safety-mechanism conservatism rule.
- `references/tech-debt.md` — active cleanup list with file:line
  pointers, so future sessions can pick up debt opportunistically
  without needing a fresh audit. (The Phase-4 coherence sweep —
  delete dead `ActionProposal`/`.proposal` legacy, kill remaining
  banned colors, unify motion — is the current queued tail.)
- `references/playbooks.md` — repeatable session patterns
  (diagnostic-first, probe-then-implement, safety-rails for external
  writes, probe→write→verify for live tests). Loads when a session
  matches one of the named pattern triggers.

Consult these references when the task touches their domain. Don't
preload all of them unless the work spans multiple areas.
