/**
 * Confidence envelope — the shared honesty model (design pass Phase 2). Proves
 * the three signals collapse to one cue contract: confident → silent, thin
 * signal → an informative (not apologetic) 'early' envelope.
 */

import {
  CONFIDENT,
  rateConfidenceEnvelope,
  guestConfidenceEnvelope,
} from "../envelope";
import { LOW_CONFIDENCE_LABEL } from "@/lib/pricing/confidence";

describe("rateConfidenceEnvelope (thin_comps)", () => {
  it("is silent (confident) when not low-confidence", () => {
    expect(rateConfidenceEnvelope(false)).toEqual(CONFIDENT);
    expect(rateConfidenceEnvelope(undefined)).toEqual(CONFIDENT);
    expect(rateConfidenceEnvelope(null)).toEqual(CONFIDENT);
    expect(CONFIDENT.tier).toBe("confident");
  });

  it("surfaces an 'early' envelope reusing the rate label when low-confidence", () => {
    const env = rateConfidenceEnvelope(true);
    expect(env.tier).toBe("early");
    expect(env.reason).toBe("thin_comps");
    expect(env.label).toBe(LOW_CONFIDENCE_LABEL);
    expect(env.note).toBeTruthy();
  });
});

describe("guestConfidenceEnvelope (new_guest)", () => {
  it("is silent when not first contact", () => {
    expect(guestConfidenceEnvelope(false)).toEqual(CONFIDENT);
    expect(guestConfidenceEnvelope(undefined)).toEqual(CONFIDENT);
  });

  it("surfaces a 'first message to this guest' cue on first contact", () => {
    const env = guestConfidenceEnvelope(true);
    expect(env.tier).toBe("early");
    expect(env.reason).toBe("new_guest");
    expect(env.label).toMatch(/first message/i);
    // Informative, not apologetic — it states what the draft rests on (voice).
    expect(env.note).toMatch(/voice/i);
  });
});
