import Anthropic from "@anthropic-ai/sdk";

interface PropertyContext {
  name: string;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
}

interface BookingContext {
  guest_name: string | null;
  check_in: string;
  check_out: string;
  num_guests: number | null;
  total_price: number | null;
}

interface PropertyDetailsContext {
  wifi_network: string | null;
  wifi_password: string | null;
  door_code: string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  parking_instructions: string | null;
  house_rules: string | null;
  special_instructions: string | null;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function generateDraft(
  property: PropertyContext,
  booking: BookingContext | null,
  conversationHistory: ConversationMessage[],
  latestMessage: string,
  details?: PropertyDetailsContext | null
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const numNights = booking
    ? Math.round(
        (new Date(booking.check_out + "T00:00:00Z").getTime() - new Date(booking.check_in + "T00:00:00Z").getTime()) / 86400000
      )
    : null;

  const detailLines: string[] = [];
  if (details) {
    if (details.wifi_network) detailLines.push(`WiFi: ${details.wifi_network}${details.wifi_password ? ` / Password: ${details.wifi_password}` : ""}`);
    if (details.door_code) detailLines.push(`Door code: ${details.door_code}`);
    if (details.checkin_time) detailLines.push(`Check-in time: ${details.checkin_time}`);
    if (details.checkout_time) detailLines.push(`Checkout time: ${details.checkout_time}`);
    if (details.parking_instructions) detailLines.push(`Parking: ${details.parking_instructions}`);
    if (details.house_rules) detailLines.push(`House rules: ${details.house_rules}`);
    if (details.special_instructions) detailLines.push(`Special instructions: ${details.special_instructions}`);
  }
  const detailsBlock = detailLines.length > 0
    ? `\n\nProperty information you KNOW and should share when asked:\n${detailLines.join("\n")}`
    : "";

  const systemPrompt = `You are a friendly, professional short-term rental host assistant for ${property.name}${property.city ? ` in ${property.city}` : ""}. Property details: ${property.bedrooms ?? "?"} bed, ${property.bathrooms ?? "?"} bath, max ${property.max_guests ?? "?"} guests.

${booking ? `Booking context: Guest ${booking.guest_name ?? "Guest"} is staying ${booking.check_in} to ${booking.check_out} (${numNights} nights)${booking.total_price ? ` for $${booking.total_price}` : ""}.` : "No active booking context."}${detailsBlock}

Respond warmly and helpfully. Keep responses concise (2-4 sentences). Include specific property details when relevant (check-in time, WiFi, parking, etc.). If you don't know something, say you'll check and get back to them. Never mention you are an AI.`;

  // Build messages from conversation history + latest
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: latestMessage },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

// Auto-pilot message classification
export type MessageType =
  | "check_in"
  | "wifi"
  | "checkout"
  | "early_checkin"
  | "late_checkout"
  | "general";

export function classifyMessage(content: string): MessageType {
  const lower = content.toLowerCase();
  if (lower.includes("wifi") || lower.includes("wi-fi") || lower.includes("password") || lower.includes("internet")) {
    return "wifi";
  }
  if (lower.includes("check in") || lower.includes("check-in") || lower.includes("checkin") || lower.includes("arrival") || lower.includes("key") || lower.includes("lockbox")) {
    return "check_in";
  }
  if (lower.includes("check out") || lower.includes("check-out") || lower.includes("checkout") || lower.includes("leaving")) {
    return "checkout";
  }
  if (lower.includes("early check") || lower.includes("arrive early") || lower.includes("earlier")) {
    return "early_checkin";
  }
  if (lower.includes("late check") || lower.includes("stay later") || lower.includes("late departure")) {
    return "late_checkout";
  }
  return "general";
}
