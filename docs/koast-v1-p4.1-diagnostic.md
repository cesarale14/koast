# P4.1 — The $230 diagnosis (diagnostic-first, read-only)

**Date:** 2026-06-11 · **Property:** Villa Jamaica (`bfb0750e…`) · **Mode:** read-only, prod evidence, no writes.

## Question
Live prod recs say *"local comps suggest a floor of $238 — above your max_rate of $230; Koast is holding at $230."* Separate two hypotheses before any fix:
- **(a)** engine CORRECT + config-bound — the host's `max_rate` ceiling binds; engine detects it and asks for a raise.
- **(b)** true output degeneracy — curve collapse independent of the ceiling.

## Verdict: **(a), decisively. No collapse.**

### Evidence 1 — the ceiling-lifted curve differentiates (pre-clamp `raw_engine_suggestion`)
The engine stores its pre-clamp output in `reason_signals.clamps.raw_engine_suggestion`. That IS the ceiling-lifted curve. Full 12-month sandbox (`calculateRates`, read-only, no writes):

| | raw (ceiling-lifted) |
|---|---|
| Full year | min **210.1** → max **246.4**, 26 distinct, **17.3% spread** |
| Summer (Jun–Sep) mean | ~228–230 |
| Winter peak (Jan–Mar) mean | **~236–237** |

The curve **breathes seasonally** — a coherent Jan–Mar snowbird-season lift of ~$8 over summer. This is a real demand curve, not a flat line. Distinct raw values: 29 across the 91 stored summer recs; 26 across the full year.

### Evidence 2 — the binding constraint is an INFERRED ceiling sitting below market
`pricing_rules` for Villa Jamaica: `base_rate=218, min=181, **max=230**, source='**inferred**'` (NOT host-set). The comp floor = `compSetP25 × 0.85 = 237.575`, which **exceeds** the $230 max. So the engine correctly fires `comp_floor_exceeds_max_rate` and asks to raise. The clamped output is pinned 210–230, **truncated at $230 for the entire winter high season** (Oct–Apr the ceiling binds nearly every date). The engine is doing exactly the right thing; the host's auto-inferred ceiling is the problem.

## Two real SUB-BUGS — both in the SURFACE, not the engine

### Sub-bug 1 — the conflict message + `act_now` are stamped GLOBALLY, even on dates the ceiling doesn't bind
`comp_floor_exceeds_max_rate` is computed from a **property-global** `compSetP25` (one number for the whole property), so it trips on **all 91 dates** → every row gets `urgency=act_now` + the identical *"$238 floor / holding at $X"* reason_text. Hard evidence on a low-demand date:

```
date=2026-08-03 raw=210.08 suggested=210.00 urgency=act_now
  reason_text='Local comps suggest a floor of $238 — above your max_rate of $230.
               Koast is holding at $210. Consider raising max_rate…'
```

"Holding at $210" while claiming a $238 floor binds is **incoherent** — the ceiling isn't binding on this date (engine wants $210, below the max). And 91/91 dates screaming "act now" destroys urgency credibility (feeds P4.2's staleness/noise problem). The conflict insight should surface **only on dates where raw ≥ max_rate** (where the ceiling actually truncates); sub-ceiling dates should show their real reason.

### Sub-bug 2 — the genuine fix is surface + proposal, exactly as the brief predicted
Not an engine fix. Two parts:
1. **`update_pricing_rule` proposal action_type** — host approves raising their *own* inferred ceiling (propose→approve like everything else). The engine already detects the conflict and carries `comp_floor_value` + `max_rate` in the guardrail trip — enough to auto-populate the proposed new max.
2. **Clearer ceiling-binding presentation** — gate the conflict message/urgency on actual per-date binding (raw ≥ max_rate), not the global trip.

## Footnote (not the $230 issue)
Event signal score = 0 on the top-demand dates incl. Jan 1 (New Year) — Ticketmaster cache likely empty for far-future dates, so event-driven differentiation isn't visible in the sandbox. Out of P4 scope; noted for a future events-cache-horizon pass.

## Conclusion
The engine is sound. **Do not touch the engine.** P4.1's fix is (1) a new `update_pricing_rule` proposal action (host-approved ceiling raise), and (2) per-date-accurate conflict presentation + urgency. The curve-collapse hypothesis (b) is falsified by the 17.3%-spread seasonally-breathing raw curve.
