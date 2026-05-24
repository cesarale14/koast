import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, properties, guestReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateGuestReview, calculatePublishTime } from "@/lib/reviews/generator";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { readReviewPreferences } from "@/lib/memory/review-preferences";
import { buildVoicePrompt } from "@/lib/voice/build-voice-prompt";
import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";

export async function POST(
  _request: Request,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Debug: log ownership check details
    const { owned } = await verifyBookingOwnership(user.id, params.bookingId);
    if (!owned) {
      // Fetch booking and property for debug info
      const [debugBooking] = await db
        .select({ propertyId: bookings.propertyId })
        .from(bookings)
        .where(eq(bookings.id, params.bookingId))
        .limit(1);
      let debugPropertyUserId: string | null = null;
      if (debugBooking) {
        const [debugProp] = await db
          .select({ userId: properties.userId })
          .from(properties)
          .where(eq(properties.id, debugBooking.propertyId))
          .limit(1);
        debugPropertyUserId = debugProp?.userId ?? null;
      }
      console.error("[reviews/generate] Ownership check FAILED", {
        authenticatedUserId: user.id,
        bookingId: params.bookingId,
        bookingPropertyId: debugBooking?.propertyId ?? "booking not found",
        propertyUserId: debugPropertyUserId,
        match: user.id === debugPropertyUserId,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch booking
    const [booking] = await db
      .select({
        id: bookings.id,
        propertyId: bookings.propertyId,
        guestName: bookings.guestName,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        platform: bookings.platform,
      })
      .from(bookings)
      .where(eq(bookings.id, params.bookingId))
      .limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // Fetch property
    const [property] = await db
      .select({
        name: properties.name,
        city: properties.city,
        bedrooms: properties.bedrooms,
        bathrooms: properties.bathrooms,
      })
      .from(properties)
      .where(eq(properties.id, booking.propertyId))
      .limit(1);
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // M9 Phase G E3: review preferences source switched from
    // `review_rules` table to `memory_facts` (entity_type='host' +
    // sub_entity_type='reviews') via readReviewPreferences. Per-property
    // scoping eliminated per Q-G2 locus shift. Helper returns
    // DEFAULT_REVIEW_PREFERENCES_PAYLOAD when no fact exists — matches
    // historical route fallback shape exactly.
    const prefsSupabase = createServiceClient();
    const prefs = await readReviewPreferences(prefsSupabase, user.id);
    const rule = {
      tone: prefs.tone,
      targetKeywords: prefs.target_keywords,
      autoPublish: prefs.auto_publish,
      publishDelayDays: prefs.publish_delay_days,
      badReviewDelay: prefs.bad_review_delay,
    };

    // Generate review
    const bookingCtx = {
      guest_name: booking.guestName,
      check_in: booking.checkIn,
      check_out: booking.checkOut,
      platform: booking.platform,
    };
    const ruleCtx = {
      tone: rule.tone ?? "warm",
      target_keywords: rule.targetKeywords as string[],
    };
    const propCtx = {
      name: property.name,
      city: property.city,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms ? Number(property.bathrooms) : null,
    };
    // M9 Phase E B2 (a) lock: read host voice_mode + build voice prompt
    // before generator call.
    const voiceSupabase = createServiceClient();
    const voiceMode = await readVoiceMode(voiceSupabase, user.id);
    const voicePrompt = buildVoicePrompt(voiceMode);

    const result = await generateGuestReview(bookingCtx, propCtx, ruleCtx, voicePrompt);

    // M10 Phase B STEP 6: J1 emoji output-filter applied to review_text
    // (guest-facing). private_note untouched (host-facing internal; would
    // require koast-to-host audience integration deferred per G8-B1).
    // draftText persists the filtered version (post-J1).
    const { finalText: filteredReviewText, envelope: filteredReviewEnvelope } =
      await applyOutputJudges(
        result.review_text,
        "host-to-guest",
        voiceMode?.mode ?? "neutral",
        result.envelope_review,
      );

    const isBadReview = !result.recommended;
    const publishAt = calculatePublishTime(booking.checkOut, rule.publishDelayDays ?? 3, isBadReview, rule.badReviewDelay ?? true);

    // Upsert guest_review
    const [existing] = await db
      .select({ id: guestReviews.id })
      .from(guestReviews)
      .where(eq(guestReviews.bookingId, params.bookingId))
      .limit(1);

    const reviewData = {
      bookingId: params.bookingId,
      propertyId: booking.propertyId,
      direction: "outgoing",
      draftText: filteredReviewText,
      privateNote: result.private_note,
      recommendGuest: result.recommended,
      starRating: 5,
      status: rule.autoPublish ? "scheduled" : "draft_generated",
      scheduledPublishAt: rule.autoPublish ? publishAt : null,
      aiContext: {
        tone: rule.tone,
        keywords: rule.targetKeywords,
        guest: booking.guestName,
        nights: Math.round((new Date(booking.checkOut + "T00:00:00Z").getTime() - new Date(booking.checkIn + "T00:00:00Z").getTime()) / 86400000),
      },
    };

    let reviewId: string;
    if (existing) {
      reviewId = existing.id;
      await db
        .update(guestReviews)
        .set(reviewData)
        .where(eq(guestReviews.id, reviewId));
    } else {
      const [inserted] = await db
        .insert(guestReviews)
        .values(reviewData)
        .returning({ id: guestReviews.id });
      reviewId = inserted.id;
    }

    // M9 Phase C: D22 Option II parallel return. Site 2 has two SDK
    // calls per Q-B3 lock; both envelopes surfaced. UI integration
    // deferred to M10 per α + γ blend (C1 uniform).
    return NextResponse.json({
      review_id: reviewId,
      review_text: filteredReviewText,
      private_note: result.private_note,
      status: reviewData.status,
      scheduled_publish_at: reviewData.scheduledPublishAt,
      envelope_review: filteredReviewEnvelope,
      envelope_note: result.envelope_note,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
