import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, guestReviews, properties } from "@/lib/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { resolveDisplayGuestName } from "@/lib/guest-name";

// Session 6.1b reshape: unified /reviews feed. Returns one list of
// review "cards" across all the user's properties, plus a light
// property roster for the in-page selector. The frontend filters/
// sorts client-side; we do not expose the old outgoing/incoming split
// because the Outgoing concept is dead (see the 6.1b brief + the
// channex-expert skill's note on Airbnb's two-sided review model).
//
// Shape of one card:
//   {
//     id: <guest_reviews.id>,
//     property_id, property_name,
//     channex_review_id,                    // null for legacy/local rows
//     guest_name,                           // nullable — Channex often null on Airbnb
//     incoming_text, incoming_rating, incoming_date,
//     private_feedback,                     // nullable — render in detail only
//     subratings,                           // nullable jsonb
//     response_draft, response_sent, status,
//     is_bad_review,
//     platform: "airbnb" | "booking_com" | …,
//     booking_check_in, booking_check_out,  // nullable
//     booking_nights, booking_platform_booking_id,
//   }

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userProperties = await db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(eq(properties.userId, user.id));

    if (userProperties.length === 0) {
      return NextResponse.json({ reviews: [], properties: [] });
    }
    const userPropertyIds = userProperties.map((p) => p.id);

    const rows = await db
      .select({
        id: guestReviews.id,
        property_id: guestReviews.propertyId,
        booking_id: guestReviews.bookingId,
        channex_review_id: guestReviews.channexReviewId,
        guest_name: guestReviews.guestName,
        incoming_text: guestReviews.incomingText,
        incoming_rating: guestReviews.incomingRating,
        incoming_date: guestReviews.incomingDate,
        private_feedback: guestReviews.privateFeedback,
        subratings: guestReviews.subratings,
        response_draft: guestReviews.responseDraft,
        response_sent: guestReviews.responseSent,
        status: guestReviews.status,
        is_bad_review: guestReviews.isBadReview,
        guest_review_submitted_at: guestReviews.guestReviewSubmittedAt,
        guest_review_channex_acked_at: guestReviews.guestReviewChannexAckedAt,
        guest_review_airbnb_confirmed_at: guestReviews.guestReviewAirbnbConfirmedAt,
      })
      .from(guestReviews)
      .where(
        and(
          inArray(guestReviews.propertyId, userPropertyIds),
          eq(guestReviews.direction, "incoming"),
        ),
      )
      .orderBy(desc(guestReviews.incomingDate));

    // Enrich with linked booking context (when resolvable)
    const bookingIds = rows.map((r) => r.booking_id).filter(Boolean) as string[];
    const bookingRows = bookingIds.length > 0
      ? await db
          .select({
            id: bookings.id,
            check_in: bookings.checkIn,
            check_out: bookings.checkOut,
            platform: bookings.platform,
            platform_booking_id: bookings.platformBookingId,
            guest_name: bookings.guestName,
          })
          .from(bookings)
          .where(inArray(bookings.id, bookingIds))
      : [];
    const bookingLookup = new Map(bookingRows.map((b) => [b.id, b]));
    const propertyLookup = new Map(userProperties.map((p) => [p.id, p]));

    const reviews = rows.map((r) => {
      const bk = r.booking_id ? bookingLookup.get(r.booking_id) : null;
      const prop = propertyLookup.get(r.property_id);
      const ci = bk?.check_in ?? null;
      const co = bk?.check_out ?? null;
      let nights: number | null = null;
      if (ci && co) {
        const a = Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10));
        const b = Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10));
        nights = Math.max(0, Math.round((b - a) / 86400000));
      }
      const platform = bk?.platform ?? "airbnb";
      const display_guest_name = resolveDisplayGuestName({
        bookingGuestName: bk?.guest_name,
        channexGuestName: r.guest_name,
        platform,
      });
      return {
        id: r.id,
        property_id: r.property_id,
        property_name: prop?.name ?? "Property",
        channex_review_id: r.channex_review_id,
        guest_name: r.guest_name ?? bk?.guest_name ?? null,
        display_guest_name,
        guest_review_submitted_at: r.guest_review_submitted_at ? r.guest_review_submitted_at.toISOString() : null,
        guest_review_channex_acked_at: r.guest_review_channex_acked_at ? r.guest_review_channex_acked_at.toISOString() : null,
        guest_review_airbnb_confirmed_at: r.guest_review_airbnb_confirmed_at ? r.guest_review_airbnb_confirmed_at.toISOString() : null,
        incoming_text: r.incoming_text,
        incoming_rating: r.incoming_rating == null ? null : Number(r.incoming_rating),
        incoming_date: r.incoming_date ? r.incoming_date.toISOString() : null,
        private_feedback: r.private_feedback,
        subratings: r.subratings,
        response_draft: r.response_draft,
        response_sent: r.response_sent ?? false,
        status: r.status,
        is_bad_review: r.is_bad_review ?? false,
        // Per-review channel: linked booking wins; else default airbnb
        // (Villa Jamaica is Airbnb-only today; BDC reviews will need an
        // explicit `ota` column on guest_reviews before they arrive — see
        // channex-expert known-quirks #5 on ID mismatches).
        platform,
        booking_check_in: ci,
        booking_check_out: co,
        booking_nights: nights,
        booking_platform_booking_id: bk?.platform_booking_id ?? null,
      };
    });

    return NextResponse.json({
      reviews,
      properties: userProperties.map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
