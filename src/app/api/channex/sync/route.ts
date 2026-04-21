import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

function detectPlatform(otaName: string | null | undefined): string {
  const lower = (otaName ?? "").toLowerCase();
  if (lower.includes("airbnb")) return "airbnb";
  if (lower.includes("vrbo") || lower.includes("homeaway")) return "vrbo";
  if (lower.includes("booking")) return "booking_com";
  return "direct";
}

// Uppercase channel_code → lowercase slug used in response payloads
// and pricing_performance.channels_pushed (matches the helper in
// /api/pricing/apply). Kept inline rather than imported cross-route.
function channelSlugFor(code: string): string {
  const c = code.toUpperCase();
  if (c === "BDC") return "booking_com";
  if (c === "ABB") return "airbnb";
  if (c === "VRBO") return "vrbo";
  if (c === "DIRECT") return "direct";
  return code.toLowerCase();
}

// POST: sync bookings + rates from Channex for the current user's connected
// properties. Body { property_id?: uuid } limits the sync to one property.
export async function POST(request: NextRequest) {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let body: { property_id?: string } = {};
    try { body = await request.json(); } catch { /* empty body ok */ }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    let query = supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);
    if (body.property_id) query = query.eq("id", body.property_id);

    const { data: propData } = await query;
    const properties = (propData ?? []) as { id: string; name: string; channex_property_id: string }[];

    if (properties.length === 0) {
      return NextResponse.json({
        message: "No Channex-connected properties to sync",
        synced: 0,
        bookings: 0,
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const end90 = new Date();
    end90.setDate(end90.getDate() + 90);
    const endDate = end90.toISOString().split("T")[0];

    let totalBookingsInserted = 0;
    let totalBookingsUpdated = 0;
    let totalRates = 0;
    const perProperty: {
      property_id: string;
      name: string;
      bookings_new: number;
      bookings_updated: number;
      rates: number;                                   // kept for frontend compat (see 2ed92e9)
      rates_total: number;                             // same value as `rates`, explicit name
      rates_by_channel: Record<string, number>;        // { airbnb?, booking_com?, vrbo?, direct? }
      rate_error?: string;                             // Channex API error surfaced here
      error?: string;
    }[] = [];
    const errors: string[] = [];

    for (const prop of properties) {
      const channexId = prop.channex_property_id;
      let newCount = 0;
      let updatedCount = 0;
      let rateCount = 0;
      try {
        // Fetch ALL bookings for the property (no date filter — the task
        // wants Channex to be the source of truth for this property).
        const bookings = await channex.getBookings({ propertyId: channexId });

        for (const booking of bookings) {
          const ba = booking.attributes;
          const guestName = ba.customer
            ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
            : null;

          const platform = detectPlatform(ba.ota_name);
          const status = ba.status === "cancelled" ? "cancelled" : "confirmed";

          const bookingRecord = {
            property_id: prop.id,
            platform,
            channex_booking_id: booking.id,
            guest_name: guestName,
            guest_email: ba.customer?.mail || null,
            guest_phone: ba.customer?.phone || null,
            check_in: ba.arrival_date,
            check_out: ba.departure_date,
            total_price: ba.amount ? parseFloat(ba.amount) : null,
            currency: ba.currency || "USD",
            status,
            platform_booking_id: ba.ota_reservation_code || null,
            notes: ba.notes || null,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bookTable = supabase.from("bookings") as any;
          const { data: existing } = await bookTable
            .select("id")
            .eq("channex_booking_id", booking.id)
            .limit(1);

          if (existing && existing.length > 0) {
            const { error } = await bookTable
              .update(bookingRecord)
              .eq("id", existing[0].id);
            if (error) {
              console.error(`[channex/sync] Update error for ${booking.id}:`, error.message);
            } else {
              updatedCount++;
            }
          } else {
            const { error } = await bookTable.insert(bookingRecord);
            if (error) {
              console.error(`[channex/sync] Insert error for ${booking.id}:`, error.message);
            } else {
              newCount++;
            }
          }
        }

        // Per-channel rate pull. The legacy getRestrictions wrapper
        // called /restrictions without filter[restrictions]=rate, which
        // Channex interprets as "availability only" — that's why the
        // route used to report rates:0 on every call even when hosts
        // had active rate changes on Airbnb. We now use the bucketed
        // endpoint (same variant pricing_validator.py uses, and the
        // only one that returns rate data). Each (rate_plan_id, date)
        // lands as a per-channel calendar_rates override keyed by
        // channel_code from property_channels. Base rows
        // (channel_code=NULL) are engine intent and never touched
        // here — readers already prefer channel override first, base
        // fallback.
        const ratesByChannel: Record<string, number> = {};
        let rateErrorMsg: string | undefined;
        try {
          // Build rate_plan_id → channel_code map from property_channels.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: channelRows } = await (supabase.from("property_channels") as any)
            .select("channel_code, settings")
            .eq("property_id", prop.id)
            .eq("status", "active");
          const planToChannel = new Map<string, string>();
          for (const row of ((channelRows ?? []) as Array<{ channel_code: string; settings: { rate_plan_id?: string } | null }>)) {
            const rpId = row.settings?.rate_plan_id;
            if (rpId) planToChannel.set(rpId, row.channel_code.toUpperCase());
          }

          const bucketed = await channex.getRestrictionsBucketed(
            channexId,
            today,
            endDate,
            ["rate", "availability", "min_stay_arrival", "stop_sell"]
          );
          const pulledAt = new Date().toISOString();

          for (const [ratePlanId, byDate] of Object.entries(bucketed)) {
            const channelCode = planToChannel.get(ratePlanId);
            if (!channelCode) {
              console.log(`[channex/sync] Unmapped rate plan ${ratePlanId} for ${prop.name} — skipping`);
              continue;
            }
            for (const [date, rateData] of Object.entries(byDate)) {
              const rawRate = rateData.rate;
              if (rawRate == null || rawRate === "") continue;
              // Channex bucketed /restrictions returns rate as a decimal
              // string in whole currency units ("200.00"), NOT cents —
              // verified against docs + ~/staycommand-workers/pricing_validator.py:91
              // (which calls the same endpoint and does float(rate) with
              // no division). The legacy non-bucketed endpoint returned
              // an integer in minor units; don't carry that assumption
              // over here.
              const rateDollars = typeof rawRate === "string" ? parseFloat(rawRate) : Number(rawRate);
              if (!Number.isFinite(rateDollars) || rateDollars <= 0) continue;
              const rateDollar = rateDollars.toFixed(2);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rateTable = supabase.from("calendar_rates") as any;
              const { error: upErr } = await rateTable.upsert(
                {
                  property_id: prop.id,
                  date,
                  channel_code: channelCode,
                  applied_rate: rateDollar,
                  base_rate: rateDollar,
                  min_stay: rateData.min_stay_arrival ?? 1,
                  is_available: !rateData.stop_sell,
                  rate_source: "manual_per_channel",
                  channex_rate_plan_id: ratePlanId,
                  last_channex_rate: rateDollar,
                  last_pushed_at: pulledAt,
                },
                { onConflict: "property_id,date,channel_code" }
              );
              if (upErr) {
                console.warn(`[channex/sync] Upsert error ${prop.name} ${channelCode} ${date}:`, upErr.message);
                continue;
              }
              const slug = channelSlugFor(channelCode);
              ratesByChannel[slug] = (ratesByChannel[slug] ?? 0) + 1;
              rateCount++;
            }
          }
        } catch (rateErr) {
          rateErrorMsg = rateErr instanceof Error ? rateErr.message : String(rateErr);
          console.warn(`[channex/sync] Rate pull failed for ${prop.name}: ${rateErrorMsg}`);
        }

        totalBookingsInserted += newCount;
        totalBookingsUpdated += updatedCount;
        totalRates += rateCount;

        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          bookings_new: newCount,
          bookings_updated: updatedCount,
          rates: rateCount,
          rates_total: rateCount,
          rates_by_channel: ratesByChannel,
          ...(rateErrorMsg ? { rate_error: rateErrorMsg } : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${prop.name}: ${msg}`);
        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          bookings_new: newCount,
          bookings_updated: updatedCount,
          rates: rateCount,
          rates_total: rateCount,
          rates_by_channel: {},
          error: msg,
        });
      }
    }

    return NextResponse.json({
      message: `Synced ${properties.length} propert${properties.length === 1 ? "y" : "ies"}`,
      synced: properties.length,
      bookings_new: totalBookingsInserted,
      bookings_updated: totalBookingsUpdated,
      rates: totalRates,
      per_property: perProperty,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
