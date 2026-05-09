/**
 * P4 — publisher-category classifier (M8 Phase D, D18).
 *
 * Pure helper; runs in loop.ts pre-dispatch on propose_guest_message
 * input.message_text. Returns a publisher category if the drafted
 * message matches one of the three §2.3.4 refusal categories; null
 * otherwise.
 *
 * Design discipline (locked at P4 sign-off, Decisions 1 + 5):
 *   - Defense-in-depth: tool description tightening (model is primary
 *     classifier handling nuance) + this regex/keyword failsafe (catches
 *     clear cases the prompt may slip past). Either layer alone is
 *     fragile; both together is robust enough for hard_refusal at
 *     three categories.
 *   - Conservative narrow keyword sets at M8 ship. Real-traffic miss
 *     rates evaluated in M9. False-negatives are the design driver
 *     (better to over-refuse and let host rephrase than draft something
 *     that shouldn't exist); false-positives surface as small friction.
 *
 * Edge case anchors (locked at sign-off):
 *   - "Reply to my CPA's question about depreciation method" → MATCH
 *     (Category 3, licensed-professional)
 *   - "Reply to this guest who's threatening a lawsuit if we don't
 *     refund" → NO MATCH (boundary; §2.3.4 names *active formal* legal
 *     matter, not threats. Voice doctrine §4.2 has the canonical
 *     example showing Koast still drafts here, framing pushback content
 *     instead of refusing participation)
 *   - "Draft something for the city about the noise complaint" → NO
 *     MATCH unless regulatory keywords (registration, compliance,
 *     filing, tax) appear. Neighbor-relations is not regulatory
 *     submission.
 *   - "Help me explain the booking cancellation policy" → NO MATCH
 *     (routine; no keyword hits)
 */

import { type PublisherCategory } from "./refusal-envelope";

/**
 * Category 1 — legal correspondence.
 * Targets *formal* legal artifacts (court documents, attorney
 * communication on active matters). Excludes "lawsuit" alone since
 * §2.3.4 carves that out as host-pushback territory, not refusal.
 */
const LEGAL_PATTERNS: RegExp[] = [
  // Court / filings
  /\bsmall[-\s]claims\b/i,
  /\bcourt\s+(filing|document|order|hearing|summon)/i,
  /\bsubpoena\b/i,
  /\bdeposition\b/i,
  /\b(attorney|lawyer)['']?s?\s+(letter|demand|notice|office|firm)/i,
  /\bdemand\s+letter\b/i,
  /\bcease\s+and\s+desist\b/i,
  /\b(plaintiff|defendant|counsel)\b/i,
  /\bsettlement\s+(offer|demand|agreement|negotiation)/i,
  // "Reply to [my/our] (lawyer|attorney|counsel)" specifically
  /\b(reply|respond|draft|write|message)\b[^.]*\b(my|our|the)\s+(lawyer|attorney|counsel)\b/i,
];

/**
 * Category 2 — regulatory submissions.
 * Targets filings + submissions to government bodies. Excludes
 * generic city-noise-complaint replies (those are neighbor relations).
 */
const REGULATORY_PATTERNS: RegExp[] = [
  /\bSTR\s+(registration|permit|license|compliance|certificate)/i,
  /\bshort[-\s]term\s+rental\s+(registration|permit|license|compliance|certificate|affidavit)/i,
  /\boccupancy\s+tax\s+(filing|return|submission|report)/i,
  /\b(zoning|land\s+use)\s+(application|appeal|variance|hearing)/i,
  /\bcompliance\s+(audit|filing|submission|affidavit|response)/i,
  /\b(IRS|tax\s+authority|department\s+of\s+revenue)\s+(notice|inquiry|response|filing)/i,
  /\bregulatory\s+(filing|submission|response|inquiry)/i,
  /\binsurance\s+disclosure\s+form/i,
  /\bbusiness\s+license\s+(application|renewal)/i,
];

/**
 * Category 3 — substantive licensed-professional communication.
 * Targets the host's lawyer / CPA / accountant / financial advisor /
 * insurance broker on substantive matters. Routine logistics
 * (scheduling) carved out per §2.3.4.
 */
const LICENSED_PROFESSIONAL_PATTERNS: RegExp[] = [
  // Direct mention of professional + drafting verb
  /\b(reply|respond|draft|write|message|email|send)\b[^.]*\b(my|our|the)\s+(CPA|accountant|tax\s+preparer|tax\s+advisor|financial\s+advisor|insurance\s+broker)/i,
  /\b(reply|respond|draft|write|message|email|send)\b[^.]*\b(my|our|the)\s+(lawyer|attorney|counsel)\b[^.]*\b(about|on|regarding|re:)/i,
  // Substantive financial/legal topics with professional context
  /\b(depreciation|cost\s+basis|capital\s+gains|tax\s+strategy|tax\s+treatment)\b[^.]*\b(CPA|accountant|advisor|attorney)/i,
  /\b(CPA|accountant|advisor|attorney)\b[^.]*\b(depreciation|cost\s+basis|capital\s+gains|tax\s+strategy|tax\s+treatment|deduction)/i,
];

/**
 * Detect logistics-only patterns that should NOT trigger Category 3
 * even when a professional is mentioned. §2.3.4 carves these out:
 * "Routine logistics — scheduling, invoice forwarding, mechanical
 * totals — remain in scope".
 */
const LOGISTICS_CARVE_OUT: RegExp[] = [
  /\b(schedule|reschedule|confirm)\s+(a\s+)?(meeting|call|appointment)/i,
  /\bforward(ing|ed)?\s+(an?\s+)?invoice/i,
  /\bsend\s+(over|along)?\s+(the\s+)?(invoice|receipt|statement)/i,
];

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Classify a drafted guest message into a publisher refusal category,
 * if any. Returns null when no category matches (the message is safe
 * to draft).
 *
 * Category 3 logistics carve-out: if the message hits a logistics
 * pattern AND no other category, it's safe (returns null) — e.g.,
 * "Forward this invoice to my CPA" doesn't refuse on Cat 3.
 */
export function classifyPublisherCategory(
  messageText: string,
): PublisherCategory | null {
  if (!messageText || messageText.trim().length === 0) return null;

  // Logistics carve-out only applies if we'd otherwise match Category 3
  // alone. Categories 1 and 2 always refuse regardless.
  const logistics = anyMatch(messageText, LOGISTICS_CARVE_OUT);

  if (anyMatch(messageText, LEGAL_PATTERNS)) {
    return "legal";
  }
  if (anyMatch(messageText, REGULATORY_PATTERNS)) {
    return "regulatory";
  }
  if (!logistics && anyMatch(messageText, LICENSED_PROFESSIONAL_PATTERNS)) {
    return "licensed_professional";
  }
  return null;
}

/**
 * Helper for Category 3: determine which professional term the host
 * named so envelopeForPublisherCategory's caller can render the
 * §2.3.4 canonical sentence with the right substitution. Defaults
 * to 'advisor' per F4 sign-off (Decision 4).
 */
export function detectLicensedProfessionalTerm(
  messageText: string,
): "lawyer" | "CPA" | "advisor" {
  if (/\b(lawyer|attorney|counsel)\b/i.test(messageText)) return "lawyer";
  if (/\b(CPA|accountant|tax\s+preparer)\b/i.test(messageText)) return "CPA";
  return "advisor";
}
