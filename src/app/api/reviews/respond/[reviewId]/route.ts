import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateReviewResponse } from "@/lib/reviews/generator";
import { getAuthenticatedUser, verifyReviewOwnership } from "@/lib/auth/api-auth";
import { createChannexClient } from "@/lib/channex/client";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { buildVoicePrompt } from "@/lib/voice/build-voice-prompt";

export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyReviewOwnership(user.id, params.reviewId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const action = body.action ?? "generate"; // "generate" or "approve"
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewTable = supabase.from("guest_reviews") as any;
    const { data: reviews } = await reviewTable
      .select("id, booking_id, property_id, incoming_text, incoming_rating, response_draft, channex_review_id")
      .eq("id", params.reviewId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review = ((reviews ?? []) as any[])[0];
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    if (action === "save_draft") {
      // Session 6.1a: interim verb. Persist an edited/approved draft
      // to response_draft without pushing to Channex. The real publish
      // path (action='approve' below) is preserved but no UI button
      // triggers it until 6.1b restores the "Approve & Publish" verb.
      const finalText = body.response_text ?? review.response_draft;
      if (!finalText) {
        return NextResponse.json({ error: "No draft to save. Generate a draft first." }, { status: 400 });
      }
      await reviewTable.update({ response_draft: finalText }).eq("id", params.reviewId);
      return NextResponse.json({ response_text: finalText, saved: true });
    }

    if (action === "approve") {
      // Session 6 — "approve" is the actual SEND. Call Channex's
      // /reviews/:id/reply, and only mark the local row as sent when
      // Channex accepts. Hand-seeded rows without a channex_review_id
      // skip the network call and save locally as before (legacy
      // behavior for pre-sync test rows).
      const finalText = body.response_text ?? review.response_draft;
      if (!finalText) {
        return NextResponse.json({ error: "No draft to approve. Generate a draft first." }, { status: 400 });
      }

      if (review.channex_review_id) {
        try {
          const channex = createChannexClient();
          await channex.respondToReview(review.channex_review_id, finalText);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[reviews/respond] Channex reply failed for ${review.channex_review_id}: ${msg}`);
          return NextResponse.json({ error: `Channex reply failed: ${msg}` }, { status: 502 });
        }
      } else {
        console.warn(`[reviews/respond] ${params.reviewId} has no channex_review_id — saving locally only`);
      }

      const sentAt = new Date().toISOString();
      await reviewTable.update({
        response_draft: finalText,
        response_final: finalText,
        response_sent: true,
        status: "published",
        published_at: sentAt,
      }).eq("id", params.reviewId);

      return NextResponse.json({ response_text: finalText, sent: true, published_at: sentAt });
    }

    // Generate draft. M9 Phase C: D22 Option II parallel return —
    // generator returns { response_text, envelope }; route surfaces
    // both in response. envelope present only on the generate path
    // (save_draft / approve paths consume host-edited text and have
    // no LLM call site, hence no envelope). UI integration deferred
    // to M10 per α + γ blend (C1 uniform).
    let responseText = body.response_text;
    let responseEnvelope: import("@/lib/agent/schemas/agent-text-output").AgentTextOutput | null = null;

    if (!responseText) {
      // Booking lookup is best-effort: Channex-synced reviews often
      // have booking_id=null (ota_reservation_id ⇄ platform_booking_id
      // mismatch). When we can't resolve a booking we still generate
      // using property + incoming_text + rating, with null guest_name
      // and a zero-nights placeholder.
      const { data: bookings } = review.booking_id
        ? await supabase
            .from("bookings")
            .select("guest_name, check_in, check_out, platform")
            .eq("id", review.booking_id)
            .limit(1)
        : { data: [] };
      const { data: props } = await supabase
        .from("properties")
        .select("name, city, bedrooms, bathrooms")
        .eq("id", review.property_id)
        .limit(1);
      const { data: rules } = await supabase
        .from("review_rules")
        .select("tone, target_keywords")
        .eq("property_id", review.property_id)
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const property = ((props ?? []) as any[])[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rule = ((rules ?? []) as any[])[0] ?? { tone: "warm", target_keywords: [] };
      const today = new Date().toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const booking = ((bookings ?? []) as any[])[0] ?? {
        guest_name: null,
        check_in: today,
        check_out: today,
        platform: "airbnb",
      };

      if (!property) {
        return NextResponse.json({ error: "Property not found for this review" }, { status: 404 });
      }
      if (!review.incoming_text) {
        return NextResponse.json({ error: "Review has no text to respond to yet" }, { status: 400 });
      }

      try {
        // M9 Phase E B2 (a) lock: read host voice_mode + build voice prompt.
        const voiceMode = await readVoiceMode(supabase, user.id);
        const voicePrompt = buildVoicePrompt(voiceMode);
        const result = await generateReviewResponse(
          review.incoming_text, review.incoming_rating ?? 5, booking, property, rule, voicePrompt,
        );
        responseText = result.response_text;
        responseEnvelope = result.envelope;
      } catch (gErr) {
        const msg = gErr instanceof Error ? gErr.message : String(gErr);
        console.error(`[reviews/respond] generation failed for ${params.reviewId}: ${msg}`);
        return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 502 });
      }
    }

    if (!responseText) {
      return NextResponse.json({ error: "Could not generate response" }, { status: 500 });
    }

    // Save as draft only. M9 Phase E F6 (B3 (a) lock): also capture
    // original_draft_text at generation time. responseEnvelope is null
    // when path was save_draft/approve (no LLM call); when generate
    // ran, persist Koast-generated text.
    await reviewTable.update({
      response_draft: responseText,
      ...(responseEnvelope ? { original_draft_text: responseEnvelope.content } : {}),
    }).eq("id", params.reviewId);

    return NextResponse.json({
      response_text: responseText,
      sent: false,
      ...(responseEnvelope ? { envelope: responseEnvelope } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
