# Koast Cockpit — Roadmap & Architecture Spec

> Status: draft v1. Source of truth for the cockpit/copilot arc. Lives in docs/.
> Pairs with docs/conversation-lifecycle-spec.md (the chat/render system spec it extends).

## 1. Vision

A system of action you trust to run your properties — an agent that knows your
state, decides what needs doing, and closes the loop on it. Not a PMS with AI bolted on;
a teammate that happens to run the units.

Sequencing of the bet: single-host operational value first, market intelligence later.
The cross-host data moat (comp-sets) only pays off at market density, and hosts won’t come
for it until it’s good — so the agent has to be worth it on one host’s data alone (the
operational loop, the trust, the hours saved) before the network layer compounds on top.

## 2. Principles

Carried from the render system:

- The agent emits semantic typed data; the frontend owns presentation; the model picks the surface.
- The card is ground truth. Prose summarizes and prioritizes; it never re-serializes the data. When prose and card disagree, the card wins.
- Grounded & trustworthy: never hallucinate state, never miss a gap. Eval-gate behavior. eval-green ≠ prod-correct — verify on the real path.
- Smallest verifiable slice first; spec/plan before code; eval-first RED→GREEN; isolate prod-behavior commits from test-infra; flags read per-request, never frozen at module load.
- Persisted prose is always clean. The chat surface renders plain text, so `finalizeTurn` markdown-strips assistant `content_text` at the chokepoint — stored prose stays plain and can't prime the model to re-emit markdown via reconstructed history. FORWARD INVARIANT: every new assistant-prose-persist surface the cockpit adds MUST route through `finalizeTurn` (or a stripped equivalent), or "persisted prose is always clean" breaks for that writer.

New for the cockpit:

- Three surface types, and the heavy one earns its place (the over-card discipline, one level up):
  - prose — there’s something to *say* (an answer, a question).
  - card — there’s something to *see* (read-only view). [shipped]
  - workstation — there’s *work to do* (actionable surface). [the deferred agent_artifacts path]
- Trust line. Low-stakes reversible actions (block/unblock dates, internal notes) the agent does autonomously, confirms after. High-stakes actions (send a guest message, change a price, refund) it proposes; the host approves. Defined per action as each workstation is built.
- Immersion = ambient presence of the host’s operation. The product is *about your properties* before you touch it: Today on open, people (guest faces) and places (property photos), and a visual language for action state. A cockpit, not a chat shell that happens to know about properties.

## 2b. Design language

References: the Claude app (chat-bar *form* + calm/scale) and the Airbnb host Today view (nav *structure*). Take the patterns, not the palettes.

- Keep the brand. Cream / forest-green / gold — the audit’s identified differentiator. Take the references’ form and scale, never their dark palette. Going dark/generic spends the one thing that doesn’t look like every other AI app.
- Calm over dense. Generous whitespace, one clear focal element, breathing room — not a crammed dashboard.
- Large & legible, mobile-first. Big greeting, big body, big tap targets. The current small grey type is a readability failure to fix outright, not tune.
- The input bar: big, rounded, floating, persistent across tabs. Center pill = property scope (where a chat app would show the model). + for actions; voice optional.
- The home greeting: personal, operational, state-aware (“Morning, Cesar — 2 turnovers need cleaners”) — the ambient presence, warm.
- The nav spine: Today / Calendar / Listings / Messages as a clean floating top nav in the same generous, rounded aesthetic.

## 3. Architecture

- Global chat shell + routed tabs beneath it. The conversation/agent is app-global state that survives navigation. Tabs (Today / Calendar / Listings / Messages) render underneath as routed content. The chat operates *on* the views; it doesn’t replace them.
- Two-way context binding (the crux). Current tab / property / selection flows *up* into the agent’s context (so “block these dates” knows you mean the calendar you’re looking at). The agent’s action flows *back down* into the live view (the block appears with no reload).
- Two view modes. Thin command strip in-tab (last exchange only, doesn’t bury the view) vs. full chat on the home/Today surface. One conversation, two renderings.
- Surface-type union extension. The render union gains workstation (actionable artifact) alongside prose / card. Same emit-typed-data principle; new requirements are action execution, approval gates, and live state.
- Background workers (Virginia VPS). The turnover automation (dispatch / confirm / track / escalate) runs with no host present, so it’s worker code on a timer — deploys to the VPS next to pricing_validator / booking_sync. Dev stays local → git → Vercel. The VPS is a runtime for the closed loop’s no-host-present work, never a dev environment.

## 4. Roadmap

Each phase has a single exit proof. Do not start the next until the proof holds.

Phase 0 — Clear the decks (fast; do before leaning on the gates for the big build)

- Prose date-attribution slip — eval-first fix (prose must not attribute one day’s activity to another; preamble has per-day data).
- `**Today` markdown slip — triage: does that turn predate the markdown-fix deploy? Stale → ignore; postdates → live regression, fix.
- Flaky E2E spec (reconcile-by-id race) — stabilize. *A flaky gate poisons every green downstream, and we’re about to depend on the gates hard.*
- Hygiene: gitignore .mcp.json; sweep all date-seeding fixtures to property-local.
- Add the two missing eval cases: no-gap overview carding; empty-today + upcoming-gaps carding (then decide intended behavior + align the rule wording).
- Proof: suite green, no known live inaccuracy, gates trustworthy.

Phase 1 — Today home (immersion; read-mostly; lower risk → slice one)

- Open-the-app ambient surface: the agent’s already triaged the day, no typing required.
- People + places: guest avatars, property photos.
- Shell quality lift so the surface matches the card’s polish.
- Proof: open the app cold and see your operation — what needs you, today — without asking. It feels like a product.

Phase 2 — Nav spine + persistent copilot shell

- Floating top nav (Today / Calendar / Listings / Messages).
- Global chat shell + routed tabs; chat persists across navigation; background = current tab.
- Thin command strip vs. full chat.
- Fix the conversation list — real titles (or rethink the left rail; most entries are commands, not threads).
- Proof: navigate tabs with the chat persistent; the command strip shows the last exchange without burying the view.

Phase 3 — Context binding + first action (Calendar + block-dates)

- View → agent context; agent action → live calendar update.
- The workstation surface type, first instance.
- Block/unblock = autonomous (the trust line’s safe end).
- Proof: in the calendar, “Block May x, x, x” → calendar updates live → “Dates blocked.” End to end, no reload.

Phase 4 — Expand workstations (messaging, pricing — one at a time)

- Each with its trust line defined (autonomous vs. propose-first).
- Action status visual language: pending / done / waiting / needs-approval.
- Proof: each surface acts with the correct approval gate and shows its state.

Phase 5 — Turnovers subsystem (the big two-sided one; built on the proven substrate)

- Cleaner roster: availability, rates, contact channel (SMS at minimum) — a second user type.
- Closed loop: detect turnover → dispatch cleaner → confirm → track → escalate if it stalls.
- Background workers on the Virginia VPS.
- Proof: a turnover with no cleaner → agent dispatches → cleaner confirms → tracked → escalates if no confirm, end to end, mostly without the host.

Phase 6+ — Market intelligence (the moat; deferred until single-host value + density)

- comp-sets / market-research render kinds; cross-host data network effect.

## 5. Open decisions (resolve when reached, not before)

- Trust line per action (blocks Phase 4, not 1–3; block-dates already settled as autonomous).
- Left rail: keep history with real titles, or replace with properties/day.
- Slice-one entry: Phase 0 first (recommended — clears the gates) vs. straight to Phase 1.
