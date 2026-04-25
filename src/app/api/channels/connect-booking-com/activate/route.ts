import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { CALENDAR_PUSH_DISABLED_MESSAGE, isCalendarPushEnabled } from "@/lib/channex/calendar-push-gate";
import { syncReviewsForOneProperty } from "@/lib/reviews/sync";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
  type KoastRestrictionProposal,
  type SafeRestrictionPlan,
} from "@/lib/channex/safe-restrictions";

/**
 * POST /api/channels/connect-booking-com/activate
 * Called after the connection test passes. Pushes initial availability,
 * ensures the webhook exists, and marks the channel as active.
 *
 * Body: { propertyId: string, channelId: string }
 */
export async function POST(request: NextRequest) {
  // Track B Stage 0 gate. Shared with /pricing/push and the BDC-targeting
  // path of /channels/rates. See src/lib/channex/calendar-push-gate.ts.
  if (!isCalendarPushEnabled()) {
    return NextResponse.json({ error: CALENDAR_PUSH_DISABLED_MESSAGE }, { status: 503 });
  }

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
      .select("id, name, channex_property_id")
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
      // the BDC-specific rate plan via the safe-restrictions helper. The
      // old 365-day write-only sweep was the source of the BDC clobber
      // incident — see docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md.
      // The helper pre-fetches current BDC state and only emits writes
      // for dates where Koast has an opinion AND the change is safe
      // (BDC-closed dates are fully preserved, rate deltas >10% are
      // skipped, etc.).
      //
      // KNOWN GAP: This retrofit covers rate-plan-level restrictions only.
      // The legacy `else` branch below pushes availability at the ROOM-TYPE
      // level via channex.updateAvailability, which is a different endpoint
      // and is NOT wrapped by safe-restrictions. If room-type availability
      // has the same default-to-open clobber pattern, it reintroduces a
      // lesser form of the incident. Audit + retrofit scheduled as Stage 1.5
      // / early PR B work.
      if (bdcRatePlanId) {
        // Build the koastProposed Map from our existing rate/booking data.
        const koastProposed = new Map<string, KoastRestrictionProposal>();
        for (let d = new Date(startStr + "T00:00:00Z"); d <= new Date(endStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().split("T")[0];
          const r = rateByDate.get(ds);
          const isBlocked = blockedDates.has(ds);
          const proposal: KoastRestrictionProposal = {};
          if (r?.applied_rate != null) proposal.rate = Number(r.applied_rate);
          if (r?.min_stay != null) proposal.min_stay_arrival = r.min_stay;
          if (isBlocked) {
            proposal.availability = 0;
            proposal.stop_sell = true;
          } else if (r?.is_available === false) {
            proposal.stop_sell = true;
          }
          // Only add dates where Koast has SOME opinion — absent dates
          // tell the helper "leave BDC alone."
          if (
            proposal.rate !== undefined ||
            proposal.min_stay_arrival !== undefined ||
            proposal.availability !== undefined ||
            proposal.stop_sell !== undefined
          ) {
            koastProposed.set(ds, proposal);
          }
        }

        const plan: SafeRestrictionPlan = await buildSafeBdcRestrictions({
          channex,
          channexPropertyId,
          bdcRatePlanId,
          dateFrom: startStr,
          dateTo: endStr,
          koastProposed,
        });
        const payload = toChannexRestrictionValues(plan, channexPropertyId, bdcRatePlanId);
        for (let i = 0; i < payload.length; i += 200) {
          await channex.updateRestrictions(payload.slice(i, i + 200));
        }
        console.log(`[connect-bdc/activate] Safe-restrictions push: ${payload.length} entries, ${plan.skipped_fields.length} skipped (BDC-closed / rate-delta / etc.)`);
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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set — webhook callback can't be built");
      const callbackUrl = `${appUrl}/api/webhooks/channex`;
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

    // 4. Mark channel active and kick off the parent-rate probe in the
    //    background. The probe loop is slow (up to ~70s across 21
    //    candidate rate codes with a sync-wait between each) — blocking
    //    the user's /activate request on that is terrible UX. Instead we
    //    flip status to "active" + "rate_discovery: in_progress" and run
    //    the probe as fire-and-forget. The UI polls the status endpoint
    //    at /api/channels/connect-booking-com/status/[propertyId] until
    //    rate_discovery flips to "complete" or "failed".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pcRow } = await (supabase.from("property_channels") as any)
      .select("settings")
      .eq("property_id", propertyId)
      .eq("channex_channel_id", channelId)
      .maybeSingle();
    const storedParentCode: number | undefined = pcRow?.settings?.parent_rate_plan_code;

    const now = new Date().toISOString();
    const baseMergedSettings = {
      ...(pcRow?.settings ?? {}),
      ...(storedParentCode == null && bdcRatePlanId ? { rate_discovery: "in_progress" } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("property_channels") as any)
      .update({
        status: activationError ? "activation_failed" : "active",
        settings: baseMergedSettings,
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

    // Fire-and-forget parent rate discovery. We intentionally don't
    // await — the response returns while the background probe runs.
    // Any failures are persisted to property_channels.settings.rate_discovery.
    if (!storedParentCode && bdcRatePlanId) {
      discoverParentRateInBackground({
        supabase,
        channex,
        channelId,
        channexPropertyId,
        propertyId,
        bdcRatePlanId,
        existingSettings: pcRow?.settings ?? {},
      }).catch((err) => {
        console.error("[connect-bdc/activate] Background probe crashed:", err instanceof Error ? err.message : err);
      });
    }

    // Session 6.7 — non-blocking on-connect reviews sync.
    void syncReviewsForOneProperty({
      id: propertyId,
      name: property.name ?? "Property",
      channex_property_id: channexPropertyId,
    });

    return NextResponse.json({
      success: true,
      status: "active",
      rate_discovery: storedParentCode != null ? "complete" : (bdcRatePlanId ? "in_progress" : "not_needed"),
      parent_rate_plan_code: storedParentCode ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc/activate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ===========================================================================
// Background parent-rate discovery
// ===========================================================================

/**
 * Probes candidate BDC rate_plan_codes to find the parent code that
 * Booking.com will accept pushes to. Runs as a detached async task so
 * the /activate endpoint returns immediately and the UI polls the status
 * endpoint instead of blocking.
 *
 * Writes state to property_channels.settings.rate_discovery:
 *   "in_progress"  → probing
 *   "complete"     → found a parent code (see parent_rate_plan_code)
 *   "failed"       → tried every candidate, none worked
 */
async function discoverParentRateInBackground(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channex: any;
  channelId: string;
  channexPropertyId: string;
  propertyId: string;
  bdcRatePlanId: string;
  existingSettings: Record<string, unknown>;
}): Promise<void> {
  const { supabase, channex, channelId, channexPropertyId, propertyId, bdcRatePlanId, existingSettings } = opts;
  let parentRateCode: number | null = null;
  let rateDiscoveryStatus: "complete" | "failed" = "failed";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chRes: any = await channex.request(`/channels/${channelId}`);
    const seedCode = chRes?.data?.attributes?.rate_plans?.[0]?.settings?.rate_plan_code;
    if (typeof seedCode !== "number") {
      console.warn("[connect-bdc/activate bg] No seed rate code on channel; aborting probe");
      return;
    }
    const candidates: number[] = [seedCode];
    for (let delta = -1; delta >= -10; delta--) candidates.push(seedCode + delta);
    for (let delta = 1; delta <= 10; delta++) candidates.push(seedCode + delta);
    const roomTypeCode = chRes?.data?.attributes?.rate_plans?.[0]?.settings?.room_type_code;
    const baseSettings = chRes?.data?.attributes?.rate_plans?.[0]?.settings ?? {};

    const probe = new Date();
    probe.setUTCDate(probe.getUTCDate() + 30);
    const probeDate = probe.toISOString().split("T")[0];

    for (const candidate of candidates) {
      try {
        await channex.updateChannel(channelId, {
          rate_plans: [{
            settings: { ...baseSettings, rate_plan_code: candidate, room_type_code: roomTypeCode },
            rate_plan_id: bdcRatePlanId,
          }],
        });
      } catch { continue; }

      try {
        await channex.updateRestrictions([{
          property_id: channexPropertyId,
          rate_plan_id: bdcRatePlanId,
          date_from: probeDate,
          date_to: probeDate,
          rate: 10000,
        }]);
      } catch { continue; }

      await new Promise((r) => setTimeout(r, 3500));

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev: any = await channex.request(
          `/channel_events?filter[channel_id]=${channelId}&filter[name]=sync&pagination[per_page]=1&order[inserted_at]=desc`
        );
        const latest = ev?.data?.[0];
        const result = latest?.attributes?.payload?.result;
        if (result === "success") {
          parentRateCode = candidate;
          rateDiscoveryStatus = "complete";
          console.log(`[connect-bdc/activate bg] Parent rate code discovered: ${candidate}`);
          break;
        }
        if (latest?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const logs: any = await channex.request(`/channel_events/${latest.id}/logs`);
          const firstErr = logs?.data?.logs?.[0]?.data?.errors?.[0]?.code;
          if (firstErr && firstErr !== "rate_is_a_slave_rate" && firstErr !== "rate_not_active_for_room") {
            console.warn(`[connect-bdc/activate bg] Stopping probe on unexpected error ${firstErr}`);
            break;
          }
        }
      } catch { /* continue */ }
    }
  } catch (err) {
    console.warn("[connect-bdc/activate bg] Probe failed:", err instanceof Error ? err.message : err);
  } finally {
    // Persist final status so the UI poller can stop.
    const mergedSettings = {
      ...existingSettings,
      rate_discovery: rateDiscoveryStatus,
      ...(parentRateCode != null ? { parent_rate_plan_code: parentRateCode } : {}),
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("property_channels") as any)
        .update({ settings: mergedSettings, updated_at: new Date().toISOString() })
        .eq("property_id", propertyId)
        .eq("channex_channel_id", channelId);
    } catch (err) {
      console.error("[connect-bdc/activate bg] Failed to persist final state:", err instanceof Error ? err.message : err);
    }
  }
}
