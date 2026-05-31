/**
 * deflection.test — DETERMINISTIC canary on the anti-deflection detector (no
 * model calls). The detector was narrowed once to stop false-flagging a
 * legitimate "I don't have parking on file yet"; a 0/N model sweep can't tell
 * "agent grounds" from "detector went blind". These cases lock both directions —
 * over-loosen the detector and the must-flag cases go red.
 */
import { deflectsVisibility } from "./deflection";

describe("deflectsVisibility — anti-deflection detector canary", () => {
  // MUST FLAG: real doctrine-point-1 deflections (disclaiming OPERATIONAL data).
  const mustFlag = [
    "I don't have visibility into your calendar.",
    "I can't see your bookings.",
    "I don't have access to your reservations.",
    "I don't have your bookings on file yet.",
    "I can't pull up your messages.",
    "I'm not connected to your booking calendar.",
    "I don't have insight into your reservations right now.",
  ];
  it.each(mustFlag)("FLAGS real deflection: %s", (s) => {
    expect(deflectsVisibility(s)).toBe(true);
  });

  // MUST NOT FLAG: legitimate un-taught property facts (memory-tools sanctioned)
  // + ordinary grounded answers.
  const mustNotFlag = [
    "I don't have parking on file yet.",
    "The wifi password isn't on file yet.",
    "You haven't saved the door code for that property yet.",
    "Erwin's asking about parking and you haven't set it for Villa Erwin.",
    "Two checkouts at Villa Jamaica today including Jeremy, plus one at Cozy Loft.",
    "The Cozy Loft turnover has no cleaner assigned yet.",
  ];
  it.each(mustNotFlag)("does NOT flag legit/grounded: %s", (s) => {
    expect(deflectsVisibility(s)).toBe(false);
  });
});
