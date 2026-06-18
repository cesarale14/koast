/**
 * Confidence envelope — the shared "how sure is Koast?" model, rendered as ONE
 * ConfidenceCue across proposals, drafts, and recs (design pass Phase 2, the
 * confidence/honesty SIGNATURE). Before this, confidence was two disconnected
 * signals (rate "Early estimate" + a draft badge); this is the single vocabulary.
 *
 * Tone law (operator msg 3749): calibrated honesty reads as COMPETENCE, not
 * apology — a good operator states plainly what they do and don't know,
 * informative and never hedging/self-covering. So `tier: 'confident'` shows NO
 * chrome (certainty needs none) and `tier: 'early'` surfaces a quiet, neutral,
 * informative cue (NOT a warning/amber treatment).
 *
 * Three signals, one cue:
 *   - thin_comps      — a rate rec on an insufficient/thin comp set
 *                       (the existing isLowConfidenceRec).
 *   - new_guest       — first message to this guest (no prior thread history).
 *   - limited_history — reserved for other thin-data cases.
 */

import { LOW_CONFIDENCE_LABEL, LOW_CONFIDENCE_NOTE } from "@/lib/pricing/confidence";

export type ConfidenceReason = "thin_comps" | "new_guest" | "limited_history";

export interface ConfidenceEnvelope {
  /** 'confident' renders nothing; 'early' surfaces the cue. */
  tier: "confident" | "early";
  reason?: ConfidenceReason;
  /** Short chip label, e.g. "Early estimate". */
  label: string;
  /** One informative line — what's thin, stated plainly. */
  note?: string;
}

/** The silent, certain default. */
export const CONFIDENT: ConfidenceEnvelope = { tier: "confident", label: "" };

/**
 * Rate / price confidence from a block's `lowConfidence` flag (thin comps).
 * Reuses the existing rate copy so the rate "Early estimate" register is
 * preserved while it joins the shared cue.
 */
export function rateConfidenceEnvelope(lowConfidence: boolean | undefined | null): ConfidenceEnvelope {
  if (!lowConfidence) return CONFIDENT;
  return {
    tier: "early",
    reason: "thin_comps",
    label: LOW_CONFIDENCE_LABEL,
    note: LOW_CONFIDENCE_NOTE,
  };
}

/**
 * Guest-reply confidence — first contact with this guest. Informative, not
 * apologetic: it states what's thin (no prior messages) and what the draft
 * rests on (the host's own voice).
 */
export function guestConfidenceEnvelope(firstContact: boolean | undefined | null): ConfidenceEnvelope {
  if (!firstContact) return CONFIDENT;
  return {
    tier: "early",
    reason: "new_guest",
    label: "First message to this guest",
    note: "No past messages from them yet — drafted in your voice.",
  };
}
