/**
 * POST /api/reviews/sync
 *
 * Session 6 — pull Channex reviews into guest_reviews. Scope-by
 * property_id if provided, else every Channex-mapped property the
 * authed user owns. Polling-based MVP; webhook subscription for
 * review events is deferred (Channex doesn't document a review
 * event_mask — open question with their support).
 *
 * Body:
 *   { property_id?: string }
 *
 * Response:
 *   200 {
 *     synced: number,                // properties processed
 *     reviews_new: number,
 *     reviews_updated: number,
 *     per_property: Array<{
 *       property_id, name,
 *       new, updated,
 *       skipped_no_match: number,    // reviews without a local booking match
 *       error?: string,
 *     }>
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient, type ChannexReview } from "@/lib/channex/client";

// Derive a 0-5 rating from Channex's 0-10 overall score.
// Existing guest_reviews.incoming_rating is numeric(2,1) — values
// 0.0-9.9. Dividing by 2 keeps Airbnb's 10.0 inside the range (5.0).
function toFiveStar(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(((score / 2) + Number.EPSILON) * 10) / 10;
}

export async function POST(request: NextRequest) {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const scopedPropertyId: string | undefined = body.property_id;

    const supabase = createServiceClient();
    let query = supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);
    if (scopedPropertyId) query = query.eq("id", scopedPropertyId);

    const { data: propData } = await query;
    const properties = (propData ?? []) as Array<{ id: string; name: string; channex_property_id: string }>;

    if (properties.length === 0) {
      return NextResponse.json({
        synced: 0,
        reviews_new: 0,
        reviews_updated: 0,
        per_property: [],
        message: scopedPropertyId ? "property_not_found_or_not_connected" : "no_connected_properties",
      });
    }

    const channex = createChannexClient();
    let totalNew = 0;
    let totalUpdated = 0;
    const perProperty: Array<Record<string, unknown>> = [];

    for (const prop of properties) {
      const record: {
        property_id: string;
        name: string;
        new: number;
        updated: number;
        skipped_no_match: number;
        error?: string;
      } = { property_id: prop.id, name: prop.name, new: 0, updated: 0, skipped_no_match: 0 };

      try {
        // Paginate through all reviews. Channex's reviews endpoint
        // appears to ignore `page[number]` (returns the same page 1
        // every time) and caps page[limit] around 10 regardless of
        // what we ask for. Dedupe by review id and break as soon as
        // a page adds zero new entries.
        const seen = new Set<string>();
        const allReviews: ChannexReview[] = [];
        let page = 1;
        while (true) {
          const batch = await channex.getReviews(prop.channex_property_id, { limit: 100, page });
          if (batch.length === 0) break;
          const before = seen.size;
          for (const rv of batch) {
            if (rv.id && !seen.has(rv.id)) {
              seen.add(rv.id);
              allReviews.push(rv);
            }
          }
          if (seen.size === before) break; // page added nothing new
          page++;
          if (page > 50) break;
        }

        // Preload local bookings for best-effort booking_id resolution via
        // platform_booking_id (Channex stores it as ota_reservation_id).
        const { data: bookingRows } = await supabase
          .from("bookings")
          .select("id, platform_booking_id")
          .eq("property_id", prop.id)
          .not("platform_booking_id", "is", null);
        const bookingByOtaRes = new Map<string, string>();
        for (const b of (bookingRows ?? []) as Array<{ id: string; platform_booking_id: string | null }>) {
          if (b.platform_booking_id) bookingByOtaRes.set(b.platform_booking_id, b.id);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reviewTable = supabase.from("guest_reviews") as any;

        // Preload existing rows by channex_review_id so we can track
        // insert vs update counts without relying on UPSERT's returned
        // rowcount (Supabase doesn't expose "rows affected vs inserted"
        // cleanly).
        const channexIds = allReviews.map((r) => r.id);
        const { data: existingRows } = channexIds.length > 0
          ? await reviewTable.select("channex_review_id").in("channex_review_id", channexIds)
          : { data: [] };
        const existingSet = new Set<string>(
          ((existingRows ?? []) as Array<{ channex_review_id: string }>).map((r) => r.channex_review_id)
        );

        for (const rv of allReviews) {
          const localBookingId = rv.ota_reservation_id ? bookingByOtaRes.get(rv.ota_reservation_id) ?? null : null;
          if (!localBookingId) {
            record.skipped_no_match++;
            console.warn("[reviews/sync] booking_id unresolved", {
              channex_review_id: rv.id,
              ota_reservation_id: rv.ota_reservation_id,
              property_id: prop.id,
              ota: rv.ota,
            });
          }

          const publicText = rv.raw_content?.public_review ?? rv.content ?? null;
          const privateText = rv.raw_content?.private_feedback ?? null;
          const subratings = rv.scores ?? null;
          const rating5 = toFiveStar(rv.overall_score);
          const incomingAt = rv.received_at ?? rv.inserted_at ?? null;
          const isNew = !existingSet.has(rv.id);

          // Build the upsert row. On conflict we only overwrite
          // Channex-sourced fields — response_draft, response_final,
          // ai_context, is_bad_review, status, scheduled_publish_at,
          // published_at stay on the local row untouched.
          //
          // Koast-side channel_code isn't a guest_reviews column yet
          // (only direction='incoming' is used). If the UI gains per-
          // channel rendering later, add a column + backfill via this
          // sync. Out of scope for Session 6.
          const row: Record<string, unknown> = {
            channex_review_id: rv.id,
            booking_id: localBookingId,
            property_id: prop.id,
            direction: "incoming",
            guest_name: rv.guest_name ?? null,
            // Session 6.1c — stamp Channex's ota_reservation_id (HM-code
            // for Airbnb, numeric string for BDC) so read paths can
            // resolve a matching booking later without re-fetching from
            // Channex. Idempotent on update.
            ota_reservation_code: rv.ota_reservation_id ?? null,
            incoming_text: publicText,
            private_feedback: privateText,
            incoming_rating: rating5,
            incoming_date: incomingAt,
            subratings,
          };
          // Initial-insert-only defaults: set status and is_bad_review
          // based on Channex state. Don't stomp on local workflow state
          // when the row already exists.
          if (isNew) {
            row.status = rv.is_replied ? "published" : "pending";
            row.is_bad_review = rating5 != null && rating5 < 3;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from("guest_reviews") as any)
            .upsert(row, { onConflict: "channex_review_id" });
          if (error) {
            console.warn(`[reviews/sync] upsert failed for ${rv.id}:`, error.message);
            continue;
          }
          if (isNew) record.new++;
          else record.updated++;
        }

        totalNew += record.new;
        totalUpdated += record.updated;
      } catch (err) {
        record.error = err instanceof Error ? err.message : String(err);
        console.error(`[reviews/sync] ${prop.name}: ${record.error}`);
      }

      perProperty.push(record);
    }

    return NextResponse.json({
      synced: properties.length,
      reviews_new: totalNew,
      reviews_updated: totalUpdated,
      per_property: perProperty,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[reviews/sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
