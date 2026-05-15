import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyReviewOwnership } from "@/lib/auth/api-auth";
import { generateGuestReviewFromIncoming } from "@/lib/reviews/generator";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { buildVoicePrompt } from "@/lib/voice/build-voice-prompt";

// POST /api/reviews/generate-guest-review/[reviewId]
//
// Returns an AI-drafted public review of the guest, conditioned on the
// guest's incoming review of the property + optional private feedback.
// Populates only the public_review textarea — scores + recommendation
// are host judgment and never auto-filled.
export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyReviewOwnership(user.id, params.reviewId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewTable = supabase.from("guest_reviews") as any;
    const { data: rows } = await reviewTable
      .select("id, property_id, booking_id, incoming_text, incoming_rating, private_feedback, guest_name")
      .eq("id", params.reviewId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review = ((rows ?? []) as any[])[0];
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    const { data: props } = await supabase
      .from("properties")
      .select("name")
      .eq("id", review.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((props ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    let bookingGuestName: string | null = null;
    let nights: number | null = null;
    if (review.booking_id) {
      const { data: bks } = await supabase
        .from("bookings")
        .select("guest_name, check_in, check_out")
        .eq("id", review.booking_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bk = ((bks ?? []) as any[])[0];
      bookingGuestName = bk?.guest_name ?? null;
      if (bk?.check_in && bk?.check_out) {
        const a = new Date(bk.check_in).getTime();
        const b = new Date(bk.check_out).getTime();
        nights = Math.max(0, Math.round((b - a) / 86400000));
      }
    }

    // Don't surface the iCal-sentinel "Airbnb Guest" to the prompt — it
    // makes the model write a stilted "Airbnb Guest was a great stayer"
    // line. Pass null so the prompt falls back to "the guest".
    const guestForPrompt =
      bookingGuestName && bookingGuestName !== "Airbnb Guest"
        ? bookingGuestName
        : review.guest_name;

    try {
      // M9 Phase E B2 (a) lock: read host voice_mode + build voice prompt.
      const voiceMode = await readVoiceMode(supabase, user.id);
      const voicePrompt = buildVoicePrompt(voiceMode);
      const result = await generateGuestReviewFromIncoming({
        incoming_text: review.incoming_text,
        incoming_rating: review.incoming_rating == null ? null : Number(review.incoming_rating),
        private_feedback: review.private_feedback,
        guest_name: guestForPrompt && guestForPrompt !== "Airbnb Guest" ? guestForPrompt : null,
        property_name: property.name,
        nights,
      }, voicePrompt);

      // M9 Phase E F6 (B3 (a) lock): persist Koast-generated public
      // review draft to guest_reviews.original_draft_text for voice
      // extraction supersession delta + trust-inspection. UI continues
      // to consume payload.public_review_draft from the route response.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (reviewTable as any)
        .update({ original_draft_text: result.public_review_draft })
        .eq("id", params.reviewId);

      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[reviews/generate-guest-review] ${params.reviewId}: ${msg}`);
      return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
