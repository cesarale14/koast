/**
 * deflection — PURE, deterministic classifier for the doctrine-point-1
 * "visibility deflection": the agent disclaiming that it can see / has the
 * host's OPERATIONAL data (calendar, bookings, reservations, messages,
 * turnovers). Zero dependencies on purpose so eval/lib/deflection.test.ts can
 * canary it with no model calls.
 *
 * Why the canary exists: this detector was demonstrably wrong once — it
 * false-flagged a legitimate "I don't have parking on file yet" (an un-taught
 * property essential, which the memory-tools doctrine explicitly sanctions
 * surfacing). Narrowing it to stop that false positive could just as easily
 * blind it to REAL deflections, and a 0/N model sweep can't tell "agent
 * grounds" from "detector went blind". The must-flag / must-not-flag cases lock
 * both directions: over-loosen it and the must-flag cases go red.
 */

// Verb-first: a negation + a visibility/access/connect word + an operational noun.
const VISIBILITY_DEFLECTION =
  /\b(?:i (?:don'?t|do not) have|i (?:can'?t|cannot)|no|lack(?:ing)?|without)\b[^.?!]{0,60}\b(?:visibility|access|insight|connect(?:ion|ed)?|integrat\w+|sync\w*)\b[^.?!]{0,60}\b(?:calendar|booking|reservation|message|inbox|turnover|task|agenda|schedule)/i;

// Generic deflection voice — "I can't pull/see/access that up", "not connected".
const ALSO_DEFLECTION =
  /\b(?:i (?:can'?t|cannot) (?:pull|see|access|view)|not (?:connected|integrated|hooked up))\b/i;

// "I don't have your bookings on file yet" — disclaiming OPERATIONAL data.
// Scoped to operational nouns ON PURPOSE: a legitimate "I don't have parking on
// file yet" (an un-taught property essential) must NOT be flagged as a deflection.
const OP_DATA_UNAVAILABLE =
  /\b(?:don'?t|do not|haven'?t) (?:have|got)\b[^.?!]{0,40}\b(?:calendars?|bookings?|reservations?|messages?|inbox|turnovers?|schedules?|agenda)\b[^.?!]{0,25}\b(?:on file|yet|loaded|synced|available)\b/i;

/** True if the text disclaims visibility/access into the host's own OPERATIONAL
 * data (the doctrine-point-1 violation). Does NOT flag naming an un-taught
 * property fact (door code / wifi / parking not on file yet) — that's correct
 * memory-tools behavior, not a deflection. */
export function deflectsVisibility(text: string): boolean {
  return VISIBILITY_DEFLECTION.test(text) || ALSO_DEFLECTION.test(text) || OP_DATA_UNAVAILABLE.test(text);
}
