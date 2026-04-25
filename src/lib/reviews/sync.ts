/**
 * Reviews sync helper. Single canonical TS implementation called by:
 *   - POST /api/reviews/sync (manual Refresh button)
 *   - POST /api/properties/import (on Airbnb connect)
 *   - POST /api/channels/connect-booking-com/activate (on BDC connect)
 *
 * The Python worker at ~/staycommand-workers/reviews_sync.py mirrors
 * the same upsert + booking-resolution shape but runs out-of-process
 * with service-role auth — it does NOT import this module.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient, type ChannexReview } from "@/lib/channex/client";

export interface ReviewSyncPropertyInput {
  id: string;
  name: string;
  channex_property_id: string;
}

export interface ReviewSyncPerProperty {
  property_id: string;
  name: string;
  new: number;
  updated: number;
  skipped_no_match: number;
  error?: string;
}

export interface ReviewSyncResult {
  synced: number;
  reviews_new: number;
  reviews_updated: number;
  per_property: ReviewSyncPerProperty[];
  message?: string;
}

// Channex 0-10 → guest_reviews.incoming_rating numeric(2,1) 0-5.
function toFiveStar(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(((score / 2) + Number.EPSILON) * 10) / 10;
}

interface ExistingRow {
  id: string;
  channex_review_id: string;
  guest_review_submitted_at: string | null;
  guest_review_channex_acked_at: string | null;
  guest_review_airbnb_confirmed_at: string | null;
  guest_review_payload: { public_review?: string } | null;
  // RDX-DIAG-FIX — needed to gate the no-downgrade rule on response state.
  response_sent: boolean | null;
  response_final: string | null;
  published_at: string | null;
}

async function syncOneProperty(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  channex: ReturnType<typeof createChannexClient>,
  prop: ReviewSyncPropertyInput,
): Promise<ReviewSyncPerProperty> {
  const record: ReviewSyncPerProperty = {
    property_id: prop.id,
    name: prop.name,
    new: 0,
    updated: 0,
    skipped_no_match: 0,
  };

  try {
    // Channex /reviews caps pages at ~10 regardless of page[limit] and
    // ignores page[number] beyond the first batch. Dedup-by-id loop
    // terminates on zero-new (channex-expert known-quirks #6).
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
      if (seen.size === before) break;
      page++;
      if (page > 50) break;
    }

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
    const channexIds = allReviews.map((r) => r.id);
    const { data: existingRows } = channexIds.length > 0
      ? await reviewTable
          .select("id, channex_review_id, guest_review_submitted_at, guest_review_channex_acked_at, guest_review_airbnb_confirmed_at, guest_review_payload, response_sent, response_final, published_at")
          .in("channex_review_id", channexIds)
      : { data: [] };
    const existingArr = (existingRows ?? []) as ExistingRow[];
    const existingSet = new Set<string>(existingArr.map((r) => r.channex_review_id));
    const existingByChannexId = new Map<string, ExistingRow>(
      existingArr.map((r) => [r.channex_review_id, r])
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

      // Initial-insert-only defaults for status + is_bad_review so
      // local workflow state isn't stomped on later runs.
      const row: Record<string, unknown> = {
        channex_review_id: rv.id,
        booking_id: localBookingId,
        property_id: prop.id,
        direction: "incoming",
        guest_name: rv.guest_name ?? null,
        ota_reservation_code: rv.ota_reservation_id ?? null,
        incoming_text: publicText,
        private_feedback: privateText,
        incoming_rating: rating5,
        incoming_date: incomingAt,
        subratings,
        expired_at: rv.expired_at ?? null,
      };
      if (isNew) {
        // Insert-only defaults. is_bad_review stays gated on isNew so
        // host marks via /api/reviews/approve aren't clobbered (RDX-2
        // Phase A: threshold <4 matches the UI's "below excellent"
        // predicate). Initial status mirrors Channex's is_replied —
        // RDX-DIAG-FIX adds the post-insert re-evaluation below.
        row.status = rv.is_replied ? "published" : "pending";
        row.is_bad_review = rating5 != null && rating5 < 4;
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

      // RDX-DIAG-FIX — re-evaluate response state on every iteration,
      // not just isNew. Without this, a review whose is_replied flips
      // to true after first sync (Airbnb-direct propagation, or any
      // race) stays "Needs response" in Koast forever. No-downgrade
      // rule: we only flip false→true. Koast-originated state
      // (response_sent=true written by /api/reviews/respond/approve)
      // is never touched, even if Channex hasn't propagated yet.
      if (rv.is_replied === true) {
        const existing = existingByChannexId.get(rv.id);
        const channexReplyText = typeof rv.reply === "object" && rv.reply !== null
          ? (rv.reply as Record<string, unknown>).reply
          : null;
        const replyText = typeof channexReplyText === "string" && channexReplyText.length > 0
          ? channexReplyText
          : null;

        // For an existing row, only patch the fields that are stale.
        // For a new row that just inserted as published-but-textless,
        // backfill the text from Channex if available.
        const patch: Record<string, unknown> = {};
        if (!existing || existing.response_sent !== true) {
          patch.response_sent = true;
          patch.status = "published";
          // published_at: Channex doesn't expose a dedicated reply
          // timestamp; updated_at is the closest approximation
          // available (Channex bumps it whenever the review entity
          // changes, including on reply attachment). Acceptable
          // imprecision — this stamp is informational, not load-bearing.
          if (!existing?.published_at) {
            patch.published_at = rv.updated_at ?? new Date().toISOString();
          }
        }
        if (!existing?.response_final && replyText) {
          patch.response_final = replyText;
        }

        if (Object.keys(patch).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updErr } = await (supabase.from("guest_reviews") as any)
            .update(patch)
            .eq("channex_review_id", rv.id);
          if (updErr) {
            console.warn(`[reviews/sync] response-state patch failed for ${rv.id}:`, updErr.message);
          }
        }
      }

      // Session 6.2 — guest_review submission reconciliation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channexGuestReview: any = (rv.reply as Record<string, unknown> | null | undefined)?.guest_review ?? null;
      const existingMeta = existingByChannexId.get(rv.id);

      if (channexGuestReview && existingMeta) {
        const localPub = existingMeta.guest_review_payload?.public_review ?? null;
        const channexPub = typeof channexGuestReview.public_review === "string" ? channexGuestReview.public_review : null;
        const matches = localPub != null && channexPub != null && localPub === channexPub;

        if (existingMeta.guest_review_submitted_at && !existingMeta.guest_review_airbnb_confirmed_at) {
          if (matches) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from("guest_reviews") as any)
              .update({ guest_review_airbnb_confirmed_at: new Date().toISOString() })
              .eq("id", existingMeta.id);
          } else {
            const ageMs = Date.now() - new Date(existingMeta.guest_review_submitted_at).getTime();
            if (ageMs > 6 * 3600 * 1000) {
              console.warn(
                `[reviews/sync] guest_review unconfirmed >6h: review=${rv.id} (likely probe-contamination)`,
              );
            }
          }
        } else if (!existingMeta.guest_review_submitted_at) {
          const stampAt = rv.updated_at ?? new Date().toISOString();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("guest_reviews") as any)
            .update({
              guest_review_submitted_at: stampAt,
              guest_review_channex_acked_at: stampAt,
              guest_review_airbnb_confirmed_at: stampAt,
              guest_review_payload: channexGuestReview,
            })
            .eq("id", existingMeta.id);
        }
      }
    }

    // Stamp reviews_last_synced_at on success only. Mirrors the
    // Python worker's behavior so the manual Refresh button and the
    // background timer write the same column.
    try {
      await supabase
        .from("properties")
        .update({ reviews_last_synced_at: new Date().toISOString() })
        .eq("id", prop.id);
    } catch (e) {
      console.warn(`[reviews/sync] stamp failed for ${prop.id}:`, e instanceof Error ? e.message : e);
    }
  } catch (err) {
    record.error = err instanceof Error ? err.message : String(err);
    console.error(`[reviews/sync] ${prop.name}: ${record.error}`);
  }

  return record;
}

/**
 * Sync a fixed list of properties. Caller is responsible for property
 * lookup + ownership verification.
 */
export async function syncReviewsForProperties(
  properties: ReviewSyncPropertyInput[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: SupabaseClient<any, "public", any>,
): Promise<ReviewSyncResult> {
  if (properties.length === 0) {
    return { synced: 0, reviews_new: 0, reviews_updated: 0, per_property: [] };
  }
  const sb = supabase ?? createServiceClient();
  const channex = createChannexClient();
  let totalNew = 0;
  let totalUpdated = 0;
  const per: ReviewSyncPerProperty[] = [];
  for (const prop of properties) {
    const r = await syncOneProperty(sb, channex, prop);
    totalNew += r.new;
    totalUpdated += r.updated;
    per.push(r);
  }
  return {
    synced: properties.length,
    reviews_new: totalNew,
    reviews_updated: totalUpdated,
    per_property: per,
  };
}

/**
 * Lookup a user's Channex-connected properties (optionally scoped to
 * one) and sync each. Used by the manual Refresh route.
 */
export async function syncReviewsForUser(opts: {
  userId: string;
  propertyId?: string;
}): Promise<ReviewSyncResult> {
  const supabase = createServiceClient();
  let query = supabase
    .from("properties")
    .select("id, name, channex_property_id")
    .eq("user_id", opts.userId)
    .not("channex_property_id", "is", null);
  if (opts.propertyId) query = query.eq("id", opts.propertyId);

  const { data } = await query;
  const properties = ((data ?? []) as ReviewSyncPropertyInput[]).filter(
    (p): p is ReviewSyncPropertyInput => !!p.channex_property_id,
  );

  if (properties.length === 0) {
    return {
      synced: 0,
      reviews_new: 0,
      reviews_updated: 0,
      per_property: [],
      message: opts.propertyId ? "property_not_found_or_not_connected" : "no_connected_properties",
    };
  }
  return syncReviewsForProperties(properties, supabase);
}

/**
 * Fire-and-log helper for connect-time triggers. Never throws. Logs
 * structured outcome so the import/activate routes stay narrow.
 */
export async function syncReviewsForOneProperty(prop: ReviewSyncPropertyInput): Promise<void> {
  try {
    const result = await syncReviewsForProperties([prop]);
    console.log("[reviews/sync] on-connect sync complete", {
      property_id: prop.id,
      reviews_new: result.reviews_new,
      reviews_updated: result.reviews_updated,
      per_property: result.per_property,
    });
  } catch (err) {
    console.error(
      "[reviews/sync] on-connect sync failed",
      { property_id: prop.id },
      err instanceof Error ? err.message : err,
    );
  }
}
