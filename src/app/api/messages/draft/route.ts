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
      .select("id, thread_id, property_id, booking_id, content, platform, sender_name")
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

    // Persist draft. M10 Phase E STEP 8c (G8-E2 fix): INSERT a new outbound
    // draft row matching messaging_executor.py:319-332 (the working reference
    // producer). The prior code UPDATEd the inbound message in place — wrong
    // shape (the draft_status-first render gate at UnifiedInbox.tsx:831 would
    // replace the guest's bubble with the draft) and silently no-opped in
    // production (browser-confirmed: target row pristine after multiple 200
    // POSTs; SELECT-works + UPDATE-zero-rows signature).
    //
    // M9 Phase E F6 (B3 (a) lock): original_draft_text alongside ai_draft for
    // voice extraction supersession delta + trust-inspection.
    // M10 Phase D STEP 7 (S3): envelope persists the D22 AgentTextOutput
    // (post-J1+J2 filteredEnvelope: confidence + judge_results + deferred S3
    // fields). UnifiedInbox PendingDraftBubble reads draft_status +
    // envelope; both flow through this INSERT.
    // M10 Phase E STEP 8a (G8-E1): draft_status="draft_pending_approval" is
    // the value all UI consumers gate on (messaging_executor + this route now
    // unified on producer-shape + producer-value).
    //
    // .select().single() + error check: never ship another silent-200 write.
    // If the INSERT errors or returns no row, throw → outer try/catch returns
    // 500. Surfaces RLS / service-role / trigger denials loudly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertError } = await (supabase.from("messages") as any)
      .insert({
        thread_id: message.thread_id,
        property_id: message.property_id,
        booking_id: message.booking_id,
        platform: message.platform ?? "unknown",
        direction: "outbound",
        sender: "property",
        sender_name: "Host",
        content: filteredDraft,
        ai_draft: filteredDraft,
        original_draft_text: draft,
        draft_status: "draft_pending_approval",
        envelope: filteredEnvelope,
      })
      .select()
      .single();
    if (insertError || !inserted) {
      throw new Error(
        `draft persist failed: ${insertError?.message ?? "no row returned from INSERT"}`,
      );
    }

    return NextResponse.json({
      draft: filteredDraft,
      messageId: inserted.id,
      envelope: filteredEnvelope,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[messages/draft] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
