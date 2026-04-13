import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

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

    // 1b. Per-property mutex. Two concurrent BDC connects for the same
    //     property can race — one creates a scaffold while the other
    //     creates a channel, then both overwrite each other's
    //     property_channels row. Acquire a short-lived advisory lock in
    //     the concurrency_locks table before doing any Channex work.
    const lockKey = `bdc_connect:${propertyId}`;
    // Opportunistically clean up stale locks (cheap).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("release_stale_locks").catch(() => { /* ignore */ });
    const lockExpires = new Date(Date.now() + 60_000).toISOString(); // 60s TTL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lockRow, error: lockErr } = await (supabase.from("concurrency_locks") as any)
      .insert({ lock_key: lockKey, expires_at: lockExpires })
      .select("lock_key")
      .maybeSingle();
    if (lockErr || !lockRow) {
      return NextResponse.json(
        { error: "connect_in_progress", message: "Another Booking.com connect request is already running for this property. Try again in a moment." },
        { status: 409 }
      );
    }

    // Track Channex entities we create so we can roll them back on failure.
    const createdChannexResources: Array<{ type: "property" | "rate_plan" | "channel"; id: string }> = [];
    const rollback = async () => {
      for (const r of createdChannexResources.reverse()) {
        try {
          if (r.type === "property") await channex.deleteProperty(r.id);
          // rate_plan and channel deletes are best-effort; Channex's delete
          // endpoints may require specific ordering, so log and continue.
          else if (r.type === "channel") await channex.request(`/channels/${r.id}`, { method: "DELETE" });
          else if (r.type === "rate_plan") await channex.request(`/rate_plans/${r.id}`, { method: "DELETE" });
        } catch (e) {
          console.warn(`[connect-bdc] rollback ${r.type} ${r.id} failed:`, e instanceof Error ? e.message : e);
        }
      }
    };
    const releaseLock = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("concurrency_locks") as any).delete().eq("lock_key", lockKey);
      } catch { /* ignore */ }
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
    }

    // 4. Find or create Booking.com channel
    //    Match on (a) channels already mapped to this property OR (b) same hotel_id.
    //    Never reuse an arbitrary BDC channel from another property — that was the
    //    original bug that linked Pool House to Villa Jamaica's BDC channel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allChannels = await channex.getAllChannels();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdcChannel = (allChannels.data ?? []).find((ch: any) => {
      if (ch.attributes?.channel !== "BookingCom") return false;
      const chProps: string[] = ch.attributes?.properties ?? [];
      const chHotelId: string | undefined = ch.attributes?.settings?.hotel_id;
      return chProps.includes(channexPropertyId) || chHotelId === hotelId;
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

    // 5. Link the BDC-specific rate plan to the Channex channel so Channex
    //    syncs rates/availability from that rate plan (not a shared Airbnb one).
    //    The rate_plan_code/room_type_code values come back from Channex after
    //    the first successful sync and Channex auto-updates them.
    try {
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
    } catch (rpErr) {
      console.warn(`[connect-bdc] Could not link rate plan to channel immediately (will retry on activation):`, rpErr instanceof Error ? rpErr.message : rpErr);
    }

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

    await releaseLock();
    return NextResponse.json({
      success: true,
      channelId,
      channexPropertyId,
      hotelId,
      status: "pending_authorization",
    });
    } catch (err) {
      // Roll back any Channex entities we created during this flow so
      // the user's Channex account doesn't accumulate half-configured
      // channels/rate plans when the later steps fail.
      console.error("[connect-bdc] flow failed, rolling back Channex creates:", err instanceof Error ? err.message : err);
      await rollback();
      await releaseLock();
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
