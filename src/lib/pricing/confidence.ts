/**
 * isLowConfidenceRec — a pricing recommendation is LOW CONFIDENCE when the comp
 * set is insufficient/unknown: the competitor signal (the anchor for STR
 * pricing) has no data, so its confidence is 0 (the engine maps comp_set_quality
 * precise=1.0, fallback=0.5, insufficient/unknown=0.0). A brand-new property
 * with no/thin comps lands here.
 *
 * Surfaces (the WhyThisRate panel + the auto-proposal CalendarChangeBlock) use
 * this to LABEL such recs as early estimates — guardrail: a new host's first
 * recs (and first auto-proposals) must read as low-confidence, never as
 * confident calls, even though the values themselves are coherent.
 */

export const LOW_CONFIDENCE_LABEL = "Early estimate";
export const LOW_CONFIDENCE_NOTE =
  "Limited market data so far — treat this as an early estimate.";

export function isLowConfidenceRec(
  reasonSignals: Record<string, unknown> | null | undefined,
): boolean {
  if (!reasonSignals || typeof reasonSignals !== "object") return false;
  const rs = reasonSignals as Record<string, unknown>;

  // competitor confidence 0 ⇔ comp_set_quality insufficient/unknown.
  const competitor = rs.competitor;
  if (competitor && typeof competitor === "object") {
    const conf = (competitor as Record<string, unknown>).confidence;
    if (typeof conf === "number" && conf === 0) return true;
  }

  // Belt: the comp_floor guardrail skipped because the comp set was insufficient.
  const clamps = rs.clamps;
  if (clamps && typeof clamps === "object") {
    const trips = (clamps as Record<string, unknown>).guardrail_trips;
    if (Array.isArray(trips)) {
      for (const t of trips) {
        if (
          t &&
          typeof t === "object" &&
          (t as Record<string, unknown>).skipped_reason === "comp_set_insufficient"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
