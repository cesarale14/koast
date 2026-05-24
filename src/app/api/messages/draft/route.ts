import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateDraft } from "@/lib/claude/messaging";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { buildVoicePrompt } from "@/lib/voice/build-voice-prompt";
import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { messageId } = await request.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch message
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, property_id, booking_id, content, platform, sender_name")
      .eq("id", messageId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = ((msgs ?? []) as any[])[0];
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const isOwner = await verifyPropertyOwnership(user.id, message.property_id);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch property
    const { data: props } = await supabase
      .from("properties")
      .select("name, city, bedrooms, bathrooms, max_guests")
      .eq("id", message.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((props ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Fetch booking if linked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let booking: any = null;
    if (message.booking_id) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("guest_name, check_in, check_out, num_guests, total_price")
        .eq("id", message.booking_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      booking = ((bookings ?? []) as any[])[0] ?? null;
    }

    // Fetch conversation history for this property + guest
    const { data: history } = await supabase
      .from("messages")
      .select("direction, content")
      .eq("property_id", message.property_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conversationHistory = ((history ?? []) as any[])
      .filter((m) => m.id !== messageId)
      .map((m) => ({
        role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        content: m.content as string,
      }));

    // Fetch property details (WiFi, door code, etc.)
    const { data: detailsData } = await supabase
      .from("property_details")
      .select("wifi_network, wifi_password, door_code, checkin_time, checkout_time, parking_instructions, house_rules, special_instructions")
      .eq("property_id", message.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = ((detailsData ?? []) as any[])[0] ?? null;

    // M9 Phase E B2 (a) lock: read host voice_mode + build voice
    // prompt before generator call. Generator stays pure; route owns
    // the voice_mode read.
    const voiceMode = await readVoiceMode(supabase, user.id);
    const voicePrompt = buildVoicePrompt(voiceMode);

    // Generate draft. M9 Phase C: D22 Option II parallel return —
    // generator returns { content, envelope }; route surfaces both.
    // UI integration deferred to M10 per α + γ blend (C1 uniform).
    const { content: draft, envelope } = await generateDraft(
      property,
      booking,
      conversationHistory,
      message.content,
      details,
      voicePrompt,
    );

    // M10 Phase B STEP 6: J1 emoji output-filter applied at route
    // boundary. original_draft_text below preserves the raw LLM output
    // (trust-inspection); ai_draft persists the filtered version (what
    // host will edit + send).
    const { finalText: filteredDraft, envelope: filteredEnvelope } =
      await applyOutputJudges(draft, "host-to-guest", voiceMode?.mode ?? "neutral", envelope);

    // Save draft to message. M9 Phase E F6 (B3 (a) lock): also capture
    // original_draft_text alongside ai_draft for voice extraction
    // supersession delta + trust-inspection.
    // M10 Phase D STEP 7 (S3): also persist the D22 AgentTextOutput envelope
    // (post-J1+J2 filteredEnvelope; contains confidence + judge_results +
    // deferred S3 fields for future Slice). STEP 8 wires UI display to read
    // this column. Historical drafts have NULL envelope per STEP 6
    // nullable-permanent (M3-outcome-3-family 2nd instance).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // M10 Phase E STEP 8a (G8-E1 fix): draft_status was previously written as
    // "generated" — all UI consumers (UnifiedInbox PendingDraftBubble render-gate
    // line 786; approveDraft; discard route) gate on "draft_pending_approval".
    // Two ai-draft producers disagreed on status for one concept
    // (messaging_executor.py writes "draft_pending_approval" for the same
    // lifecycle state). Consequence: envelope-bearing drafts (only this route
    // writes envelopes) never rendered; Phase D S8 confidence+judge display was
    // unreachable in production. Unifying on "draft_pending_approval" reaches
    // the existing consumers without UI changes. Safety-gate (Phase E STEP 8a)
    // confirmed zero readers of "generated" + zero production rows.
    await (supabase.from("messages") as any)
      .update({
        ai_draft: filteredDraft,
        draft_status: "draft_pending_approval",
        original_draft_text: draft,
        envelope: filteredEnvelope,
      })
      .eq("id", messageId);

    return NextResponse.json({ draft: filteredDraft, messageId, envelope: filteredEnvelope });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[messages/draft] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
