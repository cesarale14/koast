import Anthropic from "@anthropic-ai/sdk";
import { callLLMWithEnvelope } from "@/lib/agent/llm-call";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";
import { generateDraftThreshold } from "@/lib/agent/sufficiency-catalog";

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
  details?: PropertyDetailsContext | null,
  /** M9 Phase E B2 (a) lock: optional voice context injected into the
   *  system prompt. Built by route handler via readVoiceMode +
   *  buildVoicePrompt before this call. Generator stays pure (no IO);
   *  route owns the voice_mode read. */
  voicePrompt?: string,
): Promise<{ content: string; envelope: AgentTextOutput }> {
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

  const voiceBlock = voicePrompt ? `\n\n${voicePrompt}` : "";

  const systemPrompt = `You are a friendly, professional short-term rental host assistant for ${property.name}${property.city ? ` in ${property.city}` : ""}. Property details: ${property.bedrooms ?? "?"} bed, ${property.bathrooms ?? "?"} bath, max ${property.max_guests ?? "?"} guests.

${booking ? `Booking context: Guest ${booking.guest_name ?? "Guest"} is staying ${booking.check_in} to ${booking.check_out} (${numNights} nights)${booking.total_price ? ` for $${booking.total_price}` : ""}.` : "No active booking context."}${detailsBlock}

Respond warmly and helpfully. Keep responses concise (2-4 sentences). Include specific property details when relevant (check-in time, WiFi, parking, etc.). If you don't know something, say you'll check and get back to them. Never mention you are an AI.${voiceBlock}`;

  // Build messages from conversation history + latest
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: latestMessage },
  ];

  // M9 Phase B F3: wrap the LLM call in the AgentTextOutput envelope
  // (D22 parallel structured channel). Envelope is constructed
  // post-extraction from caller context; confidence + sufficiency
  // are deterministic-from-context per Phase B's interpretation B
  // (LLM continues to return plain text; generator wraps).
  //
  // Backward compatibility (Option B migration): signature stays
  // Promise<string>; callers see legacy shape. Phase C wires the
  // envelope through to rendering surfaces.
  const envelope = await callLLMWithEnvelope(
    {
      client,
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages,
    },
    {
      buildEnvelope: (text): AgentTextOutput =>
        buildDraftEnvelope(text, details ?? null),
      repairPrompt:
        "Your previous draft was empty. Please provide a complete, on-topic reply to the guest in 2-4 sentences.",
    },
  );

  // M9 Phase C: D22 Option II parallel return shape. Envelope exposed
  // alongside legacy content; route layer surfaces both. UI integration
  // (envelope reaches PendingDraftBubble for confidence rendering)
  // deferred to M10 per α+γ blend, C1 uniform across all 4 routes.
  return { content: envelope.content, envelope };
}

/**
 * Build the AgentTextOutput envelope for a generateDraft response.
 *
 * Phase C: confidence + output_grounding now come from the D23
 * per-generator-call catalog (`generateDraftThreshold`). Phase B's
 * inline gradient heuristic moved into the catalog; this builder
 * stays thin (extract context for the catalog input + assemble the
 * final envelope shape).
 *
 *   - source_attribution: still empty for Phase B/C; future memory-
 *     retrieval wire-through populates this when the generator's
 *     prompt is derived from `read_memory` output.
 */
function buildDraftEnvelope(
  text: string,
  details: PropertyDetailsContext | null,
): AgentTextOutput {
  const { confidence, output_grounding } = generateDraftThreshold.evaluate({
    details: details
      ? {
          wifi_network: details.wifi_network,
          door_code: details.door_code,
          parking_instructions: details.parking_instructions,
          checkin_time: details.checkin_time,
        }
      : null,
  });
  return {
    content: text,
    confidence,
    source_attribution: [],
    output_grounding,
  };
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
