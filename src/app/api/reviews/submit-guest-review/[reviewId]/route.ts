import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyReviewOwnership } from "@/lib/auth/api-auth";
import { createChannexClient, ChannexValidationError, ChannexNotFoundError, ChannexServerError } from "@/lib/channex/client";
import { validateGuestReviewPayload } from "@/lib/reviews/guest-review-validation";

// POST /api/reviews/submit-guest-review/[reviewId]
//
// Submit a host's review of a guest to Airbnb via Channex. Multi-layer
// guards because Channex's endpoint will accept malformed payloads with
// a 200, while Airbnb silently drops them — see channex-expert
// known-quirks.md and the 6.2 commit body.
export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyReviewOwnership(user.id, params.reviewId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => null);
    const validation = validateGuestReviewPayload(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }
    const payload = validation.payload;

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewTable = supabase.from("guest_reviews") as any;
    const { data: rows } = await reviewTable
      .select(
        "id, channex_review_id, ota_reservation_code, guest_review_submitted_at, guest_review_channex_acked_at, booking_id, property_id",
      )
      .eq("id", params.reviewId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review = ((rows ?? []) as any[])[0];
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    if (review.guest_review_submitted_at) {
      return NextResponse.json(
        { error: "Guest review already submitted for this guest" },
        { status: 409 },
      );
    }

    if (!review.channex_review_id) {
      return NextResponse.json(
        { error: "Cannot submit — review predates Channex sync" },
        { status: 400 },
      );
    }

    // Channel guard: derive platform from the linked booking. If the row
    // has no booking, fall back to a Channex re-fetch only when needed —
    // for now block the path. Today every Airbnb review on file routes
    // through the booking_id linkage (when present); the linkage is
    // null for iCal-orphans which we already block via guest_review_*
    // stamps once the row is in submitted state.
    let platform: string | null = null;
    if (review.booking_id) {
      const { data: bks } = await supabase
        .from("bookings")
        .select("platform")
        .eq("id", review.booking_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      platform = ((bks ?? []) as any[])[0]?.platform ?? null;
    }
    // Today the only real path producing guest_reviews rows is the Airbnb
    // /reviews probe + sync. When BDC reviews start arriving via Channex,
    // they must NOT take this code path — ABB guard below.
    const resolvedPlatform = platform ?? "airbnb";
    if (resolvedPlatform !== "airbnb") {
      return NextResponse.json(
        { error: "Guest reviews only supported for Airbnb" },
        { status: 400 },
      );
    }

    // Stamp submitted_at FIRST. Defends against double-click. Roll back
    // if Channex throws.
    const submittedAt = new Date().toISOString();
    const { error: stampErr } = await reviewTable
      .update({ guest_review_submitted_at: submittedAt })
      .eq("id", params.reviewId)
      .is("guest_review_submitted_at", null);
    if (stampErr) {
      return NextResponse.json({ error: `Failed to lock submission: ${stampErr.message}` }, { status: 500 });
    }

    // Re-read to check the lock actually succeeded — concurrent calls
    // would have one losing the conditional update above.
    const { data: lockedRows } = await reviewTable
      .select("guest_review_submitted_at")
      .eq("id", params.reviewId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locked = ((lockedRows ?? []) as any[])[0];
    if (!locked || locked.guest_review_submitted_at !== submittedAt) {
      return NextResponse.json(
        { error: "Guest review already submitted for this guest" },
        { status: 409 },
      );
    }

    let channexResponse: unknown = null;
    try {
      const channex = createChannexClient();
      const result = await channex.submitGuestReview(review.channex_review_id, payload);
      channexResponse = result.channex_response;
    } catch (err) {
      // Roll back the submission stamp so the host can retry.
      await reviewTable
        .update({ guest_review_submitted_at: null })
        .eq("id", params.reviewId);

      if (err instanceof ChannexValidationError) {
        return NextResponse.json(
          { error: "Channex rejected payload", details: err.details },
          { status: 502 },
        );
      }
      if (err instanceof ChannexNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      if (err instanceof ChannexServerError) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[reviews/submit-guest-review] ${params.reviewId}: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Channex 200 — stamp the second timestamp + payload. airbnb_confirmed
    // remains NULL until a follow-up sync verifies it.
    const channexAckedAt = new Date().toISOString();
    await reviewTable
      .update({
        guest_review_channex_acked_at: channexAckedAt,
        guest_review_payload: payload,
      })
      .eq("id", params.reviewId);

    return NextResponse.json({
      ok: true,
      submitted_at: submittedAt,
      channex_acked_at: channexAckedAt,
      airbnb_confirmed_at: null,
      message: "Submitted to Channex. Airbnb confirmation typically within 5-15 minutes.",
      channex_response: channexResponse,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
