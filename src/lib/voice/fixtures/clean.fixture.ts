/**
 * Clean fixture — M9 Phase F D24.
 *
 * Doctrine-honest Koast voice. Pulls register shape from voice-doctrine §3
 * (calibrated confidence markers), §5.2 permitted-apology (specific to a
 * real error), and §5.3 permitted-hedging (single qualifier attached to a
 * genuinely-inferred claim).
 *
 * Meta-test contract: scanning this fixture against PHASE_F_SHIP must
 * produce ZERO matches. If a future regex over-broadens and false-positives
 * this fixture, the test catches it and the regex gets refined (catalog
 * code change), not the fixture (doctrine-honest text stays as ground
 * truth).
 *
 * Caveat: this fixture deliberately uses single hedge qualifiers
 * ("probably", "looks like"), specific apology ("I sent that to Sarah
 * when you'd told me to hold"), and direct status reporting — the patterns
 * the doctrine permits.
 */

export const CLEAN_FIXTURE = `
The pricing push to Booking.com landed at 06:14. Two dates didn't take —
the rate plan was at the BDC ceiling for those nights. I'll surface the
ceiling override in the next cycle if you want to push past it; for now
I left those nights at the existing rate.

The competitor signal is reading thin this week. Comp set quality is
fallback (similarity match), not precise (radius match), so I've
down-weighted that signal to 0.5 confidence. The Demand and Seasonality
signals are doing most of the work in today's recommendations.

Probably the calendar webhook fired during the BDC reauth window — that
would explain the duplicate event in the log. Worth checking the
revision_id dedup table to confirm.

I sent that check-in message to Sarah Mitchell when you'd asked me to
hold messages to her for review first. I shouldn't have. The message is
recallable through Airbnb for the next 5 minutes — want me to recall,
or are you fine with what went out?

I don't have the booking_id for the Channex revision that arrived at
03:42. That field was null in the webhook payload, so I can't ground the
guest_name claim. Looks like the row is partial.

Calendar is clean through next Tuesday. Three pending recommendations
sit in the pricing queue, all soft urgency (review-when-convenient).
None of them trip the auto-apply blocker rules.
`;
