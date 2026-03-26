import Anthropic from "@anthropic-ai/sdk";

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
}

interface ResponseResult {
  response_text: string;
}

function nights(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: `You are writing a host review for an Airbnb/VRBO guest. The review should be:
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

Return ONLY the review text, nothing else.`,
    messages: [{ role: "user", content: "Write the guest review." }],
  });

  const reviewText = response.content.find((b) => b.type === "text")?.text ?? "";

  // Generate private note
  const noteResp = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [{
      role: "user",
      content: `Write a brief, friendly private note (1 sentence) thanking ${firstName} for staying ${n} nights at ${property.name}. Example: "Thanks for keeping the place in great shape during your stay!" Return ONLY the note.`,
    }],
  });
  const privateNote = noteResp.content.find((b) => b.type === "text")?.text ?? "";

  return { review_text: reviewText, private_note: privateNote, recommended: true };
}

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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: `Write a host response to a guest review on Airbnb/VRBO.

If positive (4-5 stars): Thank the guest warmly, reference something specific they mentioned, naturally include a property keyword from [${keywords}], invite them back. Keep it 2-3 sentences.

If negative (1-3 stars): Acknowledge their concern professionally, explain what you've done to address it (if applicable), don't be defensive, show future guests you take feedback seriously. Keep it 3-4 sentences.

If mixed (3-4 stars): Thank them for the positive aspects, address the criticism constructively. 3-4 sentences.

Guest review: "${incomingText}"
Rating: ${incomingRating} stars (${ratingCategory})
Guest: ${firstName}, stayed ${n} nights
Property: ${property.name} in ${property.city ?? "the area"}

Return ONLY the response text.`,
    messages: [{ role: "user", content: "Write the host response." }],
  });

  const responseText = response.content.find((b) => b.type === "text")?.text ?? "";
  return { response_text: responseText };
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
