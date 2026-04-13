import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock, releaseLock as releaseLockHelper } from "@/lib/concurrency/locks";

/**
 * Strict property-name normalization — matches the implementation in
 * /api/channex/import so both name-matching paths behave identically.
 */
function normalizePropertyName(name: string): string {
  if (!name) return "";
  let n = name.toLowerCase().trim();
  const dashIdx = n.lastIndexOf(" - ");
  if (dashIdx > 0) n = n.slice(0, dashIdx);
  const inIdx = n.lastIndexOf(" in ");
  if (inIdx > 0) n = n.slice(0, inIdx);
  n = n.replace(/^home\b/, "").trim();
  n = n.replace(/[·•★].*$/, "").trim();
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

/**
 * POST /api/channels/connect-booking-com
 * Creates (or reuses) a Channex BDC channel, links the property, and
 * pushes initial availability. The caller must separately test the
 * connection and handle the Booking.com authorization flow before
 * calling /activate.
 *
 * Body: { propertyId: string, hotelId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { propertyId, hotelId } = await request.json();
    if (!propertyId || !hotelId) {
      return NextResponse.json({ error: "propertyId and hotelId are required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // 1. Verify property ownership
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, channex_property_id, user_id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .single();

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // 1b. Per-property mutex. Acquire via the shared helper which
    //     handles inline stale-row cleanup so a server crash mid-flow
    //     can't permanently wedge future acquisitions.
    const lockKey = `bdc_connect:${propertyId}`;
    const lockAcquired = await acquireLock(supabase, lockKey, 60);
    if (!lockAcquired) {
      return NextResponse.json(
        { error: "connect_in_progress", message: "Another Booking.com connect request is already running for this property. Try again in a moment." },
        { status: 409 }
      );
    }

    // Track Channex entities we create so we can roll them back on failure.
    const createdChannexResources: Array<{ type: "property" | "rate_plan" | "channel"; id: string }> = [];
    // Track local DB writes we make so rollback can revert them too.
    const dbRollbackActions: Array<() => Promise<void>> = [];
    const rollback = async () => {
      // Reverse Channex resources first (newest first)
      for (const r of createdChannexResources.slice().reverse()) {
        try {
          if (r.type === "property") await channex.deleteProperty(r.id);
          else if (r.type === "channel") await channex.deleteChannel(r.id);
          else if (r.type === "rate_plan") await channex.deleteRatePlan(r.id);
        } catch (e) {
          console.warn(`[connect-bdc] rollback Channex ${r.type} ${r.id} failed:`, e instanceof Error ? e.message : e);
        }
      }
      // Then revert local DB writes (also newest first)
      for (const action of dbRollbackActions.slice().reverse()) {
        try {
          await action();
        } catch (e) {
          console.warn("[connect-bdc] rollback DB action failed:", e instanceof Error ? e.message : e);
        }
      }
    };

    try {

    // 2. Ensure Channex property exists
    //    First try to find a matching Channex property from the user's account
    //    (e.g., from Airbnb OAuth) before falling back to scaffold creation.
    let channexPropertyId = property.channex_property_id;
    if (!channexPropertyId) {
      // Strict name matching: normalize both sides (strip generic " - X" /
      // " in X" suffixes, Airbnb star/rating noise, whitespace) and require
      // exact equality on the normalized form. Substring contains led to
      // false positives like "Pool" → "Pool House in Tampa".
      const allChannexProps = await channex.getProperties();
      const propName = normalizePropertyName(property.name || "");
      const exactMatches = allChannexProps
        .filter((p) => normalizePropertyName(p.attributes?.title || "") === propName);
      const matched = exactMatches.length === 1 ? exactMatches[0] : null;

      if (exactMatches.length > 1) {
        return NextResponse.json({
          error: "multiple_channex_property_matches",
          message: "Multiple Channex properties share this name. Import the right one from Properties → Import first, then connect Booking.com.",
          candidates: exactMatches.map((m) => ({ id: m.id, title: m.attributes?.title })),
        }, { status: 409 });
      }

      if (matched) {
        channexPropertyId = matched.id;
        await supabase
          .from("properties")
          .update({ channex_property_id: channexPropertyId })
          .eq("id", propertyId);
        console.log(`[connect-bdc] Matched existing Channex property "${matched.attributes?.title}" (${channexPropertyId})`);
      } else {
        // No match — scaffold a new Channex property
        const scaffoldTitle = `SC-Scaffold-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
        const channexProp = await channex.createProperty({
          title: scaffoldTitle,
          currency: "USD",
          email: user.email || "",
          phone: "",
          zip_code: "",
          country: "US",
          state: "",
          city: "",
          address: "",
          longitude: 0,
          latitude: 0,
          timezone: "America/New_York",
        });
        channexPropertyId = channexProp.id;
        createdChannexResources.push({ type: "property", id: channexPropertyId });
        await supabase
          .from("properties")
          .update({ channex_property_id: channexPropertyId })
          .eq("id", propertyId);
        // Revert properties.channex_property_id on rollback so we don't
        // leave the Moora row pointing at a deleted scaffold.
        dbRollbackActions.push(async () => {
          await supabase
            .from("properties")
            .update({ channex_property_id: null })
            .eq("id", propertyId);
        });
        console.log(`[connect-bdc] Auto-scaffolded Channex property ${channexPropertyId}`);
      }
    }

    // 3. Ensure room type + rate plan exist
    const { data: roomTypes } = await supabase
      .from("channex_room_types")
      .select("id, channex_property_id")
      .eq("property_id", propertyId)
      .limit(1);

    let roomTypeId = roomTypes?.[0]?.id;
    if (!roomTypeId) {
      const rts = await channex.getRoomTypes(channexPropertyId);
      if (rts.length > 0) {
        roomTypeId = rts[0].id;
      } else {
        const rt = await channex.createRoomType({
          property_id: channexPropertyId,
          title: "Entire Home",
          count_of_rooms: 1,
          occ_adults: 6,
          occ_children: 2,
          occ_infants: 1,
          default_occupancy: 6,
        });
        roomTypeId = rt.id;
      }
      const now = new Date().toISOString();
      await supabase.from("channex_room_types").upsert({
        id: roomTypeId,
        property_id: propertyId,
        channex_property_id: channexPropertyId,
        title: "Entire Home",
        count_of_rooms: 1,
        occ_adults: 6,
        cached_at: now,
      }, { onConflict: "id" });
      dbRollbackActions.push(async () => {
        await supabase.from("channex_room_types").delete().eq("id", roomTypeId!);
      });
    }

    // Always create a DEDICATED rate plan for the BDC channel.
    // Reusing an existing rate plan (e.g. Airbnb's) would cause rate bleed
    // between channels — pushing a rate update for Booking.com would also
    // overwrite the Airbnb price.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingBdcLink } = await (supabase.from("property_channels") as any)
      .select("settings")
      .eq("property_id", propertyId)
      .eq("channel_code", "BDC")
      .maybeSingle();

    let bdcRatePlanId: string | undefined = existingBdcLink?.settings?.rate_plan_id;

    // Verify the stored rate plan still exists in Channex before reusing it
    if (bdcRatePlanId) {
      try {
        const rps = await channex.getRatePlans(channexPropertyId);
        if (!rps.find((rp) => rp.id === bdcRatePlanId)) {
          bdcRatePlanId = undefined;
        }
      } catch {
        bdcRatePlanId = undefined;
      }
    }

    if (!bdcRatePlanId) {
      const rp = await channex.createRatePlan({
        property_id: channexPropertyId,
        room_type_id: roomTypeId,
        title: `${property.name ?? "Pool House"} BDC Rate`,
        currency: "USD",
        sell_mode: "per_room",
        rate_mode: "manual",
        options: [{
          occupancy: 8,
          is_primary: true,
          inherit_rate: false,
          inherit_min_stay_arrival: false,
          inherit_min_stay_through: false,
          inherit_max_stay: false,
          inherit_closed_to_arrival: false,
          inherit_closed_to_departure: false,
          inherit_stop_sell: false,
          inherit_availability_offset: false,
          inherit_max_availability: false,
        }],
      });
      bdcRatePlanId = rp.id;
      createdChannexResources.push({ type: "rate_plan", id: bdcRatePlanId });
      console.log(`[connect-bdc] Created dedicated BDC rate plan ${bdcRatePlanId}`);

      const now = new Date().toISOString();
      await supabase.from("channex_rate_plans").upsert({
        id: bdcRatePlanId,
        property_id: propertyId,
        room_type_id: roomTypeId,
        title: `${property.name ?? "BDC"} BDC Rate`,
        sell_mode: "per_room",
        currency: "USD",
        rate_mode: "manual",
        cached_at: now,
      }, { onConflict: "id" });
      dbRollbackActions.push(async () => {
        await supabase.from("channex_rate_plans").delete().eq("id", bdcRatePlanId!);
      });
    }

    // 4. Find or create Booking.com channel.
    //
    //    Channex channels in a whitelabel account are shared across all
    //    Moora users who use the same underlying Channex master key.
    //    That means a naive match by hotel_id lets user B "steal" user A's
    //    BDC channel by connecting the same hotel. We prevent that by
    //    restricting matches to channels whose linked Channex property
    //    belongs to the CURRENT user (via properties.channex_property_id
    //    ↔ user_id join).
    //
    //    Never reuse an arbitrary BDC channel from another property —
    //    that was the original bug that linked Pool House to Villa
    //    Jamaica's BDC channel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userPropsData } = await (supabase.from("properties") as any)
      .select("channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);
    const userChannexPropertyIds = new Set(
      ((userPropsData ?? []) as Array<{ channex_property_id: string | null }>)
        .map((p) => p.channex_property_id)
        .filter((id): id is string => !!id)
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allChannels = await channex.getAllChannels();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdcChannel = (allChannels.data ?? []).find((ch: any) => {
      if (ch.attributes?.channel !== "BookingCom") return false;
      const chProps: string[] = ch.attributes?.properties ?? [];
      const chHotelId: string | undefined = ch.attributes?.settings?.hotel_id;
      // Match only if the channel is already mapped to THIS property OR
      // (it matches the hotel_id AND every property it's linked to belongs
      // to the current user). This blocks cross-tenant channel theft.
      if (chProps.includes(channexPropertyId)) return true;
      if (chHotelId === hotelId) {
        const allChProps = chProps.length > 0 ? chProps : [];
        return allChProps.every((pid) => userChannexPropertyIds.has(pid));
      }
      return false;
    });

    let channelId: string;

    if (bdcChannel) {
      channelId = bdcChannel.id;
      // Replace properties with ONLY this one — BDC channels should be
      // 1:1 with properties (one hotel_id = one property).
      await channex.updateChannel(channelId, {
        properties: [channexPropertyId],
        settings: { hotel_id: hotelId },
      });
      console.log(`[connect-bdc] Reconfigured existing BDC channel ${channelId} → ${channexPropertyId} (hotel ${hotelId})`);
    } else {
      const channelRes = await channex.createChannel({
        channel: "BookingCom",
        title: `${property.name ?? "Property"} - Booking.com`,
        properties: [channexPropertyId],
        settings: { hotel_id: hotelId },
      });
      channelId = channelRes.data?.id;
      createdChannexResources.push({ type: "channel", id: channelId });
      console.log(`[connect-bdc] Created new BDC channel ${channelId}`);
    }

    // Register rollback for property_channels insert below. We stash the
    // channelId at closure-capture time so rollback knows what to delete.
    const propertyChannelsRollbackKey = { propertyId, channexChannelId: channelId };
    dbRollbackActions.push(async () => {
      await supabase.from("property_channels")
        .delete()
        .eq("property_id", propertyChannelsRollbackKey.propertyId)
        .eq("channex_channel_id", propertyChannelsRollbackKey.channexChannelId);
    });

    // 5. Link the BDC-specific rate plan to the Channex channel so Channex
    //    syncs rates/availability from that rate plan (not a shared Airbnb one).
    //    The rate_plan_code/room_type_code values come back from Channex after
    //    the first successful sync and Channex auto-updates them.
    //
    //    If this link fails, we MUST trigger compensating rollback — a
    //    channel without a linked rate plan is worse than no channel at
    //    all (the per-channel rate editor will show an empty card and
    //    the user has no path to recover). Let the error bubble up so
    //    the outer catch cleans up everything we created.
    await channex.updateChannel(channelId, {
      rate_plans: [{
        settings: {
          readonly: false,
          occupancy: 8,
          primary_occ: true,
        },
        rate_plan_id: bdcRatePlanId,
      }],
    });

    // 6. Save to property_channels — include the dedicated rate_plan_id
    //    in settings so pricing/push can target only this channel's plan.
    const now = new Date().toISOString();
    await supabase.from("property_channels").upsert(
      {
        property_id: propertyId,
        channex_channel_id: channelId,
        channel_code: "BDC",
        channel_name: property.name ?? "Booking.com",
        status: "pending_authorization",
        settings: { hotel_id: hotelId, rate_plan_id: bdcRatePlanId },
        last_sync_at: now,
        updated_at: now,
      },
      { onConflict: "property_id,channex_channel_id" }
    );

    return NextResponse.json({
      success: true,
      channelId,
      channexPropertyId,
      hotelId,
      status: "pending_authorization",
    });
    } catch (err) {
      // Roll back any Channex entities + local DB writes we made during
      // this flow so the user's Channex account doesn't accumulate
      // half-configured channels/rate plans and Moora's DB doesn't keep
      // dangling references to things that no longer exist in Channex.
      console.error("[connect-bdc] flow failed, rolling back:", err instanceof Error ? err.message : err);
      await rollback();
      throw err;
    } finally {
      // Always release the lock, even on unhandled exceptions that
      // escape the inner try. A stuck lock would require waiting out
      // the TTL or a manual DB delete, and we don't want a single bad
      // deploy to make the feature unusable.
      await releaseLockHelper(supabase, lockKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
