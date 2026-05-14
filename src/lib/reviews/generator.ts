import Anthropic from "@anthropic-ai/sdk";
import { callLLMWithEnvelope } from "@/lib/agent/llm-call";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";
import {
  generateGuestReviewThreshold,
  generatePrivateNoteThreshold,
  generateReviewResponseThreshold,
  generateGuestReviewFromIncomingThreshold,
} from "@/lib/agent/sufficiency-catalog";

interface PropertyContext {
  name: string;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
}

interface BookingContext {
  guest_name: string | null;
  check_in: string;
  check_out: string;
  platform: string;
}

interface ReviewRule {
  tone: string;
  target_keywords: string[];
}

interface ReviewResult {
  review_text: string;
  private_note: string;
  recommended: boolean;
  /** M9 Phase C: D22 Option II parallel return. Two envelopes per
   *  Q-B3 — one per SDK call (review_text + private_note). UI
   *  integration deferred to M10 per α + γ blend. */
  envelope_review: AgentTextOutput;
  envelope_note: AgentTextOutput;
}

interface ResponseResult {
  response_text: string;
  /** M9 Phase C: D22 Option II parallel return. UI integration
   *  deferred to M10 per α + γ blend. */
  envelope: AgentTextOutput;
}

function nights(checkIn: string, checkOut: string): number {
  const ci = Date.UTC(+checkIn.slice(0,4), +checkIn.slice(5,7)-1, +checkIn.slice(8,10));
  const co = Date.UTC(+checkOut.slice(0,4), +checkOut.slice(5,7)-1, +checkOut.slice(8,10));
  return Math.round((co - ci) / 86400000);
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

const MODEL = "claude-sonnet-4-20250514";

/**
 * Site 2 — generateGuestReview (M9 Phase B F3).
 *
 * Makes TWO Anthropic SDK calls (review_text + private_note). Per
 * Q-B3 resolution: two envelopes, one per SDK call. Each call gets
 * its own buildEnvelope reflecting that call's context + purpose.
 *
 * Backward-compat (Option B migration): signature still returns
 * `Promise<ReviewResult>`. F3 envelopes flow through internally; the
 * function extracts `.content` and assembles the legacy shape.
 */
export async function generateGuestReview(
  booking: BookingContext,
  property: PropertyContext,
  rule: ReviewRule
): Promise<ReviewResult> {
  const client = getClient();
  const n = nights(booking.check_in, booking.check_out);
  const firstName = booking.guest_name?.split(" ")[0] ?? "our guest";
  const keywords = rule.target_keywords.length > 0
    ? rule.target_keywords.join(", ")
    : "clean, location, comfortable";

  const reviewSystem = `You are writing a host review for an Airbnb/VRBO guest. The review should be:
- Unique and specific to this guest's stay (never generic)
- ${rule.tone} in tone
- 2-4 sentences long
- Naturally incorporate 1-2 of these property keywords: ${keywords}
  (don't force them — weave them in naturally so future guests see them in review responses and they feed Airbnb's search algorithm)
- Mention the guest by first name
- Reference something specific: length of stay, time of year, or property features

Property: ${property.name} in ${property.city ?? "the area"}, ${property.bedrooms ?? "?"}BR/${property.bathrooms ?? "?"}BA
Guest: ${firstName}, stayed ${booking.check_in} to ${booking.check_out} (${n} nights)
Booking source: ${booking.platform}

IMPORTANT: Every review must be different. Vary sentence structure, opening phrases, and specific details. Never start two reviews the same way. Never use these overused phrases: 'wonderful guest', 'highly recommend', 'welcome back anytime' — find fresh ways to express the same sentiment.

Return ONLY the review text, nothing else.`;

  const reviewEnvelope = await callLLMWithEnvelope(
    {
      client,
      model: MODEL,
      max_tokens: 400,
      system: reviewSystem,
      messages: [{ role: "user", content: "Write the guest review." }],
    },
    {
      buildEnvelope: (text): AgentTextOutput =>
        buildGuestReviewEnvelope(text, rule, booking),
      repairPrompt:
        "Your previous review was empty or off-shape. Provide a 2-4 sentence host review of the guest, specific to their stay.",
    },
  );

  // Site 2's second call — private note thanking the guest. No system
  // prompt; the entire prompt lives in the user message. Q-B3: each
  // call gets its own envelope — private notes have different context
  // (shorter, less rule-driven) and different sufficiency profile.
  const noteEnvelope = await callLLMWithEnvelope(
    {
      client,
      model: MODEL,
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Write a brief, friendly private note (1 sentence) thanking ${firstName} for staying ${n} nights at ${property.name}. Example: "Thanks for keeping the place in great shape during your stay!" Return ONLY the note.`,
      }],
    },
    {
      buildEnvelope: (text): AgentTextOutput =>
        buildPrivateNoteEnvelope(text),
      repairPrompt:
        "Your previous note was empty. Provide a one-sentence thank-you note.",
    },
  );

  return {
    review_text: reviewEnvelope.content,
    private_note: noteEnvelope.content,
    recommended: true,
    envelope_review: reviewEnvelope,
    envelope_note: noteEnvelope,
  };
}

/**
 * Site 3 — generateReviewResponse (M9 Phase B F3).
 *
 * Single SDK call. Confidence and sufficiency derive from the
 * presence of the incoming review's text and rating — those anchor
 * the response.
 */
export async function generateReviewResponse(
  incomingText: string,
  incomingRating: number,
  booking: BookingContext,
  property: PropertyContext,
  rule: ReviewRule
): Promise<ResponseResult> {
  const client = getClient();
  const n = nights(booking.check_in, booking.check_out);
  const firstName = booking.guest_name?.split(" ")[0] ?? "our guest";
  const keywords = rule.target_keywords.join(", ") || "clean, location, comfortable";

  const ratingCategory = incomingRating >= 4 ? "positive" : incomingRating >= 3 ? "mixed" : "negative";

  const responseSystem = `Write a host response to a guest review on Airbnb/VRBO.

If positive (4-5 stars): Thank the guest warmly, reference something specific they mentioned, naturally include a property keyword from [${keywords}], invite them back. Keep it 2-3 sentences.

If negative (1-3 stars): Acknowledge their concern professionally, explain what you've done to address it (if applicable), don't be defensive, show future guests you take feedback seriously. Keep it 3-4 sentences.

If mixed (3-4 stars): Thank them for the positive aspects, address the criticism constructively. 3-4 sentences.

Guest review: "${incomingText}"
Rating: ${incomingRating} stars (${ratingCategory})
Guest: ${firstName}, stayed ${n} nights
Property: ${property.name} in ${property.city ?? "the area"}

Return ONLY the response text.`;

  const envelope = await callLLMWithEnvelope(
    {
      client,
      model: MODEL,
      max_tokens: 300,
      system: responseSystem,
      messages: [{ role: "user", content: "Write the host response." }],
    },
    {
      buildEnvelope: (text): AgentTextOutput =>
        buildReviewResponseEnvelope(text, incomingText, incomingRating),
      repairPrompt:
        "Your previous response was empty or off-shape. Provide a 2-4 sentence host response to the incoming review.",
    },
  );

  return { response_text: envelope.content, envelope };
}

/**
 * Site 4 — generateGuestReviewFromIncoming (M9 Phase B F3).
 *
 * Strongest anti-fabrication prompt-level discipline in the codebase.
 * Per Q-B4 sign-off: bias rules STAY at prompt-level; F3 does NOT
 * add structural .refine() for them. The envelope's `hedge` field
 * surfaces a contextual qualifier when private feedback flags issues,
 * giving the rendering layer a cue to handle with measured framing.
 */
export async function generateGuestReviewFromIncoming(input: {
  incoming_text: string | null;
  incoming_rating: number | null;
  private_feedback: string | null;
  guest_name: string | null;
  property_name: string;
  nights: number | null;
}): Promise<{ public_review_draft: string; envelope: AgentTextOutput }> {
  const client = getClient();
  const guest = input.guest_name?.split(" ")[0] ?? "the guest";
  const stayDesc = input.nights ? `${input.nights}-night stay` : "stay";
  const ratingTone = (input.incoming_rating ?? 5) >= 4 ? "positive" : "neutral-to-critical";
  const flagged = !!(input.private_feedback && input.private_feedback.trim().length > 0);

  const system = `Write a host's review of a guest for Airbnb. Tone: ${ratingTone}. Length: 100-300 characters. Honest, not performatively warm. Never fabricate specifics.

Context:
- Guest: ${guest}
- Property: ${input.property_name}
- Stay: ${stayDesc}
- Guest left ${input.incoming_rating ?? "?"}/5 of the property
${input.incoming_text ? `- Guest's public review: "${input.incoming_text}"` : ""}
${flagged ? `- Private feedback flagged issues — keep tone measured.` : ""}

Bias rules:
- 5-star incoming with no flagged issues: warm, brief, mentions communication or rule-following.
- 4-star: positive but light, no over-claim.
- 3 or below: neutral, factual ("good communication" / "respectful of the space"); do not invent positive details.
- If private feedback flagged issues: acknowledge guest demeanor without praising — e.g. "communicated clearly" not "delightful guest".

Return ONLY the review text. No preamble, no quotes around it.`;

  const envelope = await callLLMWithEnvelope(
    {
      client,
      model: MODEL,
      max_tokens: 200,
      system,
      messages: [{ role: "user", content: "Write the guest review." }],
    },
    {
      buildEnvelope: (text): AgentTextOutput =>
        buildIncomingReviewEnvelope(text, input, flagged),
      repairPrompt:
        "Your previous review was empty or off-shape. Provide a 100-300 character host review of the guest, on tone with the inputs.",
    },
  );

  // Site 4 trimmed text per the original implementation. Envelope
  // surfaces the un-trimmed content + Phase C metadata; route exposes
  // both per D22 Option II.
  return { public_review_draft: envelope.content.trim(), envelope };
}

export function calculatePublishTime(
  checkOutDate: string,
  delayDays: number,
  isBadReview: boolean,
  badReviewDelay: boolean
): Date {
  const checkout = new Date(checkOutDate);

  if (isBadReview && badReviewDelay) {
    // Publish in the last 2 hours of the 14-day (336-hour) window
    const windowEnd = new Date(checkout.getTime() + 14 * 24 * 60 * 60 * 1000);
    return new Date(windowEnd.getTime() - 2 * 60 * 60 * 1000); // 2 hours before deadline
  }

  // Normal delay
  return new Date(checkout.getTime() + delayDays * 24 * 60 * 60 * 1000);
}

// ---- F3 envelope builders (Phase B deterministic-from-context heuristics) ----

/**
 * Site 2 first call. Phase C: grounding evaluation moved to D23
 * catalog (`generateGuestReviewThreshold`). Builder stays thin —
 * shape the catalog input + assemble the envelope.
 */
function buildGuestReviewEnvelope(
  text: string,
  rule: ReviewRule,
  booking: BookingContext,
): AgentTextOutput {
  const { confidence, output_grounding } = generateGuestReviewThreshold.evaluate({
    rule: { tone: rule.tone, target_keywords: rule.target_keywords },
    booking: { guest_name: booking.guest_name },
  });
  return {
    content: text,
    confidence,
    source_attribution: [],
    output_grounding,
  };
}

/**
 * Site 2 second call. Catalog handles the constant
 * "active_guess / sparse" assignment for private notes — generic
 * thank-you content with no learned host preference feed.
 */
function buildPrivateNoteEnvelope(text: string): AgentTextOutput {
  const { confidence, output_grounding } = generatePrivateNoteThreshold.evaluate({});
  return {
    content: text,
    confidence,
    source_attribution: [],
    output_grounding,
  };
}

/**
 * Site 3. Phase C: grounding evaluation moved to D23 catalog
 * (`generateReviewResponseThreshold`). Anchors on text + rating
 * presence per the 2-axis gradient.
 */
function buildReviewResponseEnvelope(
  text: string,
  incomingText: string,
  incomingRating: number,
): AgentTextOutput {
  const { confidence, output_grounding } = generateReviewResponseThreshold.evaluate({
    incomingText,
    incomingRating,
  });
  return {
    content: text,
    confidence,
    source_attribution: [],
    output_grounding,
  };
}

/**
 * Site 4. Phase C: grounding evaluation moved to D23 catalog
 * (`generateGuestReviewFromIncomingThreshold`). `hedge` stays at
 * builder layer because it's site-specific contextual metadata
 * (private_feedback flagged), not a sufficiency gradient — Phase F
 * D24 tonal regression covers the rendering-side enforcement.
 */
function buildIncomingReviewEnvelope(
  text: string,
  input: {
    incoming_text: string | null;
    incoming_rating: number | null;
    private_feedback: string | null;
  },
  flagged: boolean,
): AgentTextOutput {
  const { confidence, output_grounding } =
    generateGuestReviewFromIncomingThreshold.evaluate({
      incoming_text: input.incoming_text,
      incoming_rating: input.incoming_rating,
    });
  const envelope: AgentTextOutput = {
    content: text,
    confidence,
    source_attribution: [],
    output_grounding,
  };

  if (flagged) {
    envelope.hedge = "private feedback flagged issues during stay; drafted with measured tone";
  }

  return envelope;
}
