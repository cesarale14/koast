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
      .select({
        id: properties.id,
        name: properties.name,
        channex_property_id: properties.channexPropertyId,
        reviews_last_synced_at: properties.reviewsLastSyncedAt,
        cover_photo_url: properties.coverPhotoUrl,
      })
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
        ota_reservation_code: guestReviews.otaReservationCode,
        guest_name: guestReviews.guestName,
        guest_name_override: guestReviews.guestNameOverride,
        incoming_text: guestReviews.incomingText,
        incoming_rating: guestReviews.incomingRating,
        incoming_date: guestReviews.incomingDate,
        private_feedback: guestReviews.privateFeedback,
        subratings: guestReviews.subratings,
        response_draft: guestReviews.responseDraft,
        response_sent: guestReviews.responseSent,
        status: guestReviews.status,
        is_bad_review: guestReviews.isBadReview,
        is_low_rating: guestReviews.isLowRating,
        is_flagged_by_host: guestReviews.isFlaggedByHost,
        is_hidden: guestReviews.isHidden,
        guest_review_submitted_at: guestReviews.guestReviewSubmittedAt,
        guest_review_channex_acked_at: guestReviews.guestReviewChannexAckedAt,
        guest_review_airbnb_confirmed_at: guestReviews.guestReviewAirbnbConfirmedAt,
        expired_at: guestReviews.expiredAt,
      })
      .from(guestReviews)
      .where(
        and(
          inArray(guestReviews.propertyId, userPropertyIds),
          eq(guestReviews.direction, "incoming"),
        ),
      )
      .orderBy(desc(guestReviews.incomingDate));

    // Session 6.3 — primary join is ota_reservation_code (set by sync
    // path 6.1c). Falls back to booking_id FK lookup for any rows that
    // had a direct linkage at sync time. Net: review.guest_name surfaces
    // whenever we can resolve the booking via either path.
    const bookingIds = rows.map((r) => r.booking_id).filter(Boolean) as string[];
    const otaCodes = rows
      .map((r) => r.ota_reservation_code)
      .filter((c): c is string => !!c);
    type BookingLite = {
      id: string;
      check_in: string | null;
      check_out: string | null;
      platform: string | null;
      platform_booking_id: string | null;
      ota_reservation_code: string | null;
      guest_name: string | null;
    };
    const bookingsByOtaCode = new Map<string, BookingLite>();
    const bookingsById = new Map<string, BookingLite>();

    if (otaCodes.length > 0) {
      const byCode = await db
        .select({
          id: bookings.id,
          check_in: bookings.checkIn,
          check_out: bookings.checkOut,
          platform: bookings.platform,
          platform_booking_id: bookings.platformBookingId,
          ota_reservation_code: bookings.otaReservationCode,
          guest_name: bookings.guestName,
        })
        .from(bookings)
        .where(inArray(bookings.otaReservationCode, otaCodes));
      for (const b of byCode) {
        if (b.ota_reservation_code) bookingsByOtaCode.set(b.ota_reservation_code, b);
        bookingsById.set(b.id, b);
      }
    }
    if (bookingIds.length > 0) {
      const byId = await db
        .select({
          id: bookings.id,
          check_in: bookings.checkIn,
          check_out: bookings.checkOut,
          platform: bookings.platform,
          platform_booking_id: bookings.platformBookingId,
          ota_reservation_code: bookings.otaReservationCode,
          guest_name: bookings.guestName,
        })
        .from(bookings)
        .where(inArray(bookings.id, bookingIds));
      for (const b of byId) bookingsById.set(b.id, b);
    }
    const propertyLookup = new Map(userProperties.map((p) => [p.id, p]));

    const nowMs = Date.now();
    const reviews = rows.map((r) => {
      const bk =
        (r.ota_reservation_code ? bookingsByOtaCode.get(r.ota_reservation_code) : null) ??
        (r.booking_id ? bookingsById.get(r.booking_id) : null) ??
        null;
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
        overrideName: r.guest_name_override,
        bookingGuestName: bk?.guest_name,
        channexGuestName: r.guest_name,
        platform,
      });
      return {
        id: r.id,
        property_id: r.property_id,
        property_name: prop?.name ?? "Property",
        property_cover_photo_url: prop?.cover_photo_url ?? null,
        channex_review_id: r.channex_review_id,
        guest_name: r.guest_name ?? bk?.guest_name ?? null,
        guest_name_override: r.guest_name_override,
        display_guest_name,
        guest_review_submitted_at: r.guest_review_submitted_at ? r.guest_review_submitted_at.toISOString() : null,
        guest_review_channex_acked_at: r.guest_review_channex_acked_at ? r.guest_review_channex_acked_at.toISOString() : null,
        guest_review_airbnb_confirmed_at: r.guest_review_airbnb_confirmed_at ? r.guest_review_airbnb_confirmed_at.toISOString() : null,
        expired_at: r.expired_at ? r.expired_at.toISOString() : null,
        // Session 6.5 follow-up — when Channex's /reviews listing
        // purges old reviews their expired_at column stays NULL on
        // our side forever (probe-validated 2026-04-25: review
        // 91c80897 ~67d old not returned by /reviews?filter or
        // direct GET). Fall back to incoming_date + 14d so those
        // rows still gate to "Review time expired" instead of
        // showing an active button. Channex remains authoritative
        // when present; the fallback only fires when expired_at
        // is missing.
        is_expired: r.expired_at
          ? r.expired_at.getTime() <= nowMs
          : (r.incoming_date ? r.incoming_date.getTime() + 14 * 86400000 <= nowMs : false),
        incoming_text: r.incoming_text,
        incoming_rating: r.incoming_rating == null ? null : Number(r.incoming_rating),
        incoming_date: r.incoming_date ? r.incoming_date.toISOString() : null,
        private_feedback: r.private_feedback,
        subratings: r.subratings,
        response_draft: r.response_draft,
        response_sent: r.response_sent ?? false,
        status: r.status,
        is_bad_review: r.is_bad_review ?? false,
        is_low_rating: r.is_low_rating ?? false,
        is_flagged_by_host: r.is_flagged_by_host ?? false,
        is_hidden: r.is_hidden ?? false,
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
      properties: userProperties.map((p) => ({
        id: p.id,
        name: p.name,
        channex_property_id: p.channex_property_id,
        reviews_last_synced_at: p.reviews_last_synced_at
          ? p.reviews_last_synced_at.toISOString()
          : null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
