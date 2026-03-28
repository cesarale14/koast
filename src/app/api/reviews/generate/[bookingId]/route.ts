import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, properties, reviewRules, guestReviews } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { generateGuestReview, calculatePublishTime } from "@/lib/reviews/generator";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";

export async function POST(
  _request: Request,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Debug: log ownership check details
    const { owned, propertyId: _ownershipPropertyId } = await verifyBookingOwnership(user.id, params.bookingId);
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

    // Fetch review rules (or use defaults)
    const [ruleRow] = await db
      .select({
        tone: reviewRules.tone,
        targetKeywords: reviewRules.targetKeywords,
        autoPublish: reviewRules.autoPublish,
        publishDelayDays: reviewRules.publishDelayDays,
        badReviewDelay: reviewRules.badReviewDelay,
      })
      .from(reviewRules)
      .where(
        and(
          eq(reviewRules.propertyId, booking.propertyId),
          eq(reviewRules.isActive, true)
        )
      )
      .limit(1);

    const rule = ruleRow ?? {
      tone: "warm",
      targetKeywords: ["clean", "location", "comfortable"],
      autoPublish: false,
      publishDelayDays: 3,
      badReviewDelay: true,
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
    const result = await generateGuestReview(bookingCtx, propCtx, ruleCtx);
    const publishAt = calculatePublishTime(booking.checkOut, rule.publishDelayDays ?? 3, false, rule.badReviewDelay ?? true);

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
      draftText: result.review_text,
      privateNote: result.private_note,
      recommendGuest: result.recommended,
      starRating: 5,
      status: rule.autoPublish ? "scheduled" : "draft_generated",
      scheduledPublishAt: rule.autoPublish ? publishAt : null,
      aiContext: {
        tone: rule.tone,
        keywords: rule.targetKeywords,
        guest: booking.guestName,
        nights: Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000),
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

    return NextResponse.json({
      review_id: reviewId,
      review_text: result.review_text,
      private_note: result.private_note,
      status: reviewData.status,
      scheduled_publish_at: reviewData.scheduledPublishAt,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
