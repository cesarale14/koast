import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/channels/connect-booking-com/activate
 * Called after the connection test passes. Pushes initial availability,
 * ensures the webhook exists, and marks the channel as active.
 *
 * Body: { propertyId: string, channelId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { propertyId, channelId } = await request.json();
    if (!propertyId || !channelId) {
      return NextResponse.json({ error: "propertyId and channelId are required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Verify property
    const { data: property } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .single();

    if (!property?.channex_property_id) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const channexPropertyId = property.channex_property_id;

    // Look up the BDC-specific rate plan for this property so we can push
    // rates + restrictions (not just availability) to the channel. Without
    // rates, Booking.com displays the listing as "closed / not bookable".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pc } = await (supabase.from("property_channels") as any)
      .select("settings")
      .eq("property_id", propertyId)
      .eq("channex_channel_id", channelId)
      .maybeSingle();
    const bdcRatePlanId: string | undefined = pc?.settings?.rate_plan_id;

    // 1. Push initial availability + rates for 365 days
    const roomTypes = await channex.getRoomTypes(channexPropertyId);
    if (roomTypes.length > 0) {
      const startStr = new Date().toISOString().split("T")[0];
      const endAvail = new Date();
      endAvail.setDate(endAvail.getDate() + 365);
      const endStr = endAvail.toISOString().split("T")[0];

      // Load Moora's rates for the next 365 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: moorRates } = await (supabase.from("calendar_rates") as any)
        .select("date, applied_rate, base_rate, min_stay, is_available")
        .eq("property_id", propertyId)
        .is("channel_code", null)
        .gte("date", startStr)
        .lte("date", endStr);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rateByDate = new Map<string, any>();
      for (const r of (moorRates ?? [])) rateByDate.set(r.date, r);

      // Build booked-date set so we can mark stop_sell=true
      const { data: bookings } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("property_id", propertyId)
        .in("status", ["confirmed", "pending"])
        .gte("check_out", startStr);
      const blockedDates = new Set<string>();
      for (const b of (bookings ?? []) as Array<{ check_in: string; check_out: string }>) {
        const s = new Date(b.check_in + "T00:00:00Z");
        const e = new Date(b.check_out + "T00:00:00Z");
        for (let d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) {
          blockedDates.add(d.toISOString().split("T")[0]);
        }
      }

      // Push restrictions (rate + availability + min_stay + stop_sell) to
      // the BDC-specific rate plan. If there's no rate plan (legacy), fall
      // back to pushing only availability to all room types.
      if (bdcRatePlanId) {
        const restrictionValues: Array<{
          property_id: string;
          rate_plan_id: string;
          date_from: string;
          date_to: string;
          rate?: number;
          min_stay_arrival: number;
          stop_sell: boolean;
          availability?: number;
        }> = [];
        for (let d = new Date(startStr + "T00:00:00Z"); d <= new Date(endStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().split("T")[0];
          const r = rateByDate.get(ds);
          const isBlocked = blockedDates.has(ds);
          restrictionValues.push({
            property_id: channexPropertyId,
            rate_plan_id: bdcRatePlanId,
            date_from: ds,
            date_to: ds,
            rate: r?.applied_rate ? Math.round(Number(r.applied_rate) * 100) : undefined,
            min_stay_arrival: r?.min_stay ?? 1,
            stop_sell: isBlocked || r?.is_available === false,
            availability: isBlocked ? 0 : 1,
          });
        }
        for (let i = 0; i < restrictionValues.length; i += 200) {
          await channex.updateRestrictions(restrictionValues.slice(i, i + 200));
        }
        console.log(`[connect-bdc/activate] Pushed ${restrictionValues.length} restrictions to BDC rate plan ${bdcRatePlanId}`);
      } else {
        // Legacy path — push availability only
        const availValues = roomTypes.map((rt) => ({
          property_id: channexPropertyId,
          room_type_id: rt.id,
          date_from: startStr,
          date_to: endStr,
          availability: 1,
        }));
        await channex.updateAvailability(availValues);
        console.log(`[connect-bdc/activate] Pushed availability=1 for ${startStr} to ${endStr}`);

        if (blockedDates.size > 0) {
          const blockValues: Array<{ property_id: string; room_type_id: string; date_from: string; date_to: string; availability: number }> = [];
          blockedDates.forEach((ds) => {
            for (const rt of roomTypes) {
              blockValues.push({ property_id: channexPropertyId, room_type_id: rt.id, date_from: ds, date_to: ds, availability: 0 });
            }
          });
          for (let i = 0; i < blockValues.length; i += 200) {
            await channex.updateAvailability(blockValues.slice(i, i + 200));
          }
          console.log(`[connect-bdc/activate] Blocked ${blockValues.length} date slots`);
        }
      }
    }

    // 2. Ensure webhook exists
    try {
      const webhooks = await channex.listWebhooks();
      const callbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://staycommand.vercel.app"}/api/webhooks/channex`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = (webhooks.data ?? []).find((wh: any) =>
        wh.attributes?.callback_url === callbackUrl &&
        (wh.attributes?.property_id === channexPropertyId || !wh.attributes?.property_id)
      );

      if (!existing) {
        await channex.createWebhook({
          property_id: channexPropertyId,
          callback_url: callbackUrl,
          event_mask: "booking_new,booking_modification,booking_cancellation",
          is_active: true,
          send_data: true,
        });
        console.log("[connect-bdc/activate] Created webhook");
      }
    } catch (err) {
      console.warn("[connect-bdc/activate] Webhook setup warning:", err instanceof Error ? err.message : err);
    }

    // 3. Activate channel via the DEDICATED activate endpoint.
    //    PUT /channels/{id} { is_active: true } silently no-ops for newly
    //    created BookingCom channels (discovered during Villa Jamaica
    //    setup). POST /channels/{id}/activate is the only reliable way
    //    to flip the channel live. If activation fails we surface the
    //    error so the user sees a real message instead of a fake "active"
    //    status.
    let activationError: string | null = null;
    try {
      await channex.activateChannel(channelId);
    } catch (err) {
      activationError = err instanceof Error ? err.message : String(err);
      console.warn("[connect-bdc/activate] Channel activation failed:", activationError);
    }

    // 4. Auto-discover the parent BDC rate plan code. The first rate plan
    //    code Channex auto-populates is often a child/slave rate that
    //    rejects pushes with RATE_IS_A_SLAVE_RATE. We test each candidate
    //    code by pushing a tiny probe restriction and watching the most
    //    recent sync event's log. The first code that syncs successfully
    //    gets cached in property_channels.settings.parent_rate_plan_code.
    let parentRateCode: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pcRow } = await (supabase.from("property_channels") as any)
      .select("settings")
      .eq("property_id", propertyId)
      .eq("channex_channel_id", channelId)
      .maybeSingle();
    const storedParentCode: number | undefined = pcRow?.settings?.parent_rate_plan_code;

    if (!storedParentCode && bdcRatePlanId) {
      // Grab the channel's current rate_plan_code so we know where to
      // start probing. Channex returns a single code per channel rate
      // plan — our candidates are the one it gave us plus its immediate
      // neighbors (since BDC parent codes are usually within a few of
      // the child codes).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chRes: any = await channex.request(`/channels/${channelId}`);
        const seedCode = chRes?.data?.attributes?.rate_plans?.[0]?.settings?.rate_plan_code;
        if (typeof seedCode === "number") {
          const candidates = [seedCode];
          for (let delta = -1; delta >= -10; delta--) candidates.push(seedCode + delta);
          for (let delta = 1; delta <= 10; delta++) candidates.push(seedCode + delta);
          const roomTypeCode = chRes?.data?.attributes?.rate_plans?.[0]?.settings?.room_type_code;

          // Grab a future date to probe against (today + 30 days).
          const probe = new Date();
          probe.setUTCDate(probe.getUTCDate() + 30);
          const probeDate = probe.toISOString().split("T")[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const baseSettings = chRes?.data?.attributes?.rate_plans?.[0]?.settings ?? {};

          for (const candidate of candidates) {
            // Update channel to use this candidate code
            try {
              await channex.updateChannel(channelId, {
                rate_plans: [{
                  settings: { ...baseSettings, rate_plan_code: candidate, room_type_code: roomTypeCode },
                  rate_plan_id: bdcRatePlanId,
                }],
              });
            } catch { continue; }

            // Push a probe restriction
            try {
              await channex.updateRestrictions([{
                property_id: channexPropertyId,
                rate_plan_id: bdcRatePlanId,
                date_from: probeDate,
                date_to: probeDate,
                rate: 10000, // probe value in cents
              }]);
            } catch { continue; }

            // Give Channex a couple seconds to run the sync event
            await new Promise((r) => setTimeout(r, 3500));

            // Check the most recent sync event for this channel
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ev: any = await channex.request(
                `/channel_events?filter[channel_id]=${channelId}&filter[name]=sync&pagination[per_page]=1&order[inserted_at]=desc`
              );
              const latest = ev?.data?.[0];
              const result = latest?.attributes?.payload?.result;
              if (result === "success") {
                parentRateCode = candidate;
                console.log(`[connect-bdc/activate] Parent rate code discovered: ${candidate}`);
                break;
              }
              // If it errored, check if the error is slave-rate (try next) or
              // "not active for room" (try next) vs something else (stop).
              if (latest?.id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const logs: any = await channex.request(`/channel_events/${latest.id}/logs`);
                const firstErr = logs?.data?.logs?.[0]?.data?.errors?.[0]?.code;
                if (firstErr && firstErr !== "rate_is_a_slave_rate" && firstErr !== "rate_not_active_for_room") {
                  console.warn(`[connect-bdc/activate] Parent rate probe hit unexpected error ${firstErr}; stopping`);
                  break;
                }
              }
            } catch { /* continue probing */ }
          }
        }
      } catch (err) {
        console.warn("[connect-bdc/activate] Parent rate discovery failed:", err instanceof Error ? err.message : err);
      }
    }

    // 5. Update property_channels to active (include discovered parent code)
    const now = new Date().toISOString();
    const mergedSettings = {
      ...(pcRow?.settings ?? {}),
      ...(parentRateCode != null ? { parent_rate_plan_code: parentRateCode } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("property_channels") as any)
      .update({
        status: activationError ? "activation_failed" : "active",
        settings: mergedSettings,
        last_sync_at: now,
        updated_at: now,
      })
      .eq("property_id", propertyId)
      .eq("channex_channel_id", channelId);

    if (activationError) {
      return NextResponse.json({
        success: false,
        status: "activation_failed",
        error: activationError,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      status: "active",
      parent_rate_plan_code: parentRateCode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc/activate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
