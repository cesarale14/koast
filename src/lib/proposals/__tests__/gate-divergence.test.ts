/**
 * R-5 (HARD-FLOOR) — the proposal-side OTA gate and the route-side calendar-push
 * gate MUST NEVER DIVERGE. A divergence is the dangerous state the OTA trio's
 * two-layer execution-impossibility depends on NOT existing:
 *
 *   - proposal-side says enabled (Approve rendered executable) while the route
 *     refuses → host approves, the Channex write 503s, audit/proposal drift; or
 *   - proposal-side says disabled (Approve hidden) while the route would write →
 *     a side-door that bypasses the visible gate.
 *
 * Before this was wired, isOtaWriteEnabled accepted "1"||"true" while the 8
 * route guards (isCalendarPushEnabled) accepted "true" only — so env="1" made
 * the proposal executable but every route 503. This pins that they now return
 * the IDENTICAL boolean for every env value (isOtaWriteEnabled delegates to the
 * one canonical gate), and that the canonical fails closed on anything but the
 * documented "true".
 */

import { isOtaWriteEnabled } from "../server";
import { isCalendarPushEnabled } from "@/lib/channex/calendar-push-gate";

describe("OTA gate ⇔ calendar-push gate — can never diverge (R-5)", () => {
  const prev = process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
  afterEach(() => {
    if (prev === undefined) delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
    else process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = prev;
  });

  // Every value a Vercel env / shell / typo could hold. The two gates must agree
  // on each; the second column is the canonical (fail-closed) expectation.
  const matrix: Array<[string | undefined, boolean]> = [
    [undefined, false],
    ["", false],
    ["false", false],
    ["0", false],
    ["1", false], // the old divergence point — "1" no longer enables either gate
    ["TRUE", false], // case-sensitive: only exact "true" enables
    ["True", false],
    ["yes", false],
    ["true", true],
  ];

  test.each(matrix)("env=%p → both gates agree (=%p)", (value, expected) => {
    if (value === undefined) delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
    else process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = value;

    const ota = isOtaWriteEnabled();
    const route = isCalendarPushEnabled();
    // The load-bearing invariant: they are EQUAL for every value.
    expect(ota).toBe(route);
    // And the canonical value is correct (fail-closed unless exactly "true").
    expect(ota).toBe(expected);
  });
});
