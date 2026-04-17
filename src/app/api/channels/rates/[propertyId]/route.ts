import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { CALENDAR_PUSH_DISABLED_MESSAGE, isCalendarPushEnabled, isBdcChannelCode } from "@/lib/channex/calendar-push-gate";

/**
 * Per-channel rate editing API for the calendar right-side panel.
 *
 * GET  /api/channels/rates/[propertyId]?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD[&refresh=1]
 *      Returns the LIVE rate/availability state from Channex for every
 *      connected channel that has a rate plan registered in
 *      property_channels.settings.rate_plan_id, bucketed per channel per date,
 *      along with the locally-stored override rate (if any) so the UI can
 *      flag mismatches. Base rates are included for reference.
 *
 * POST /api/channels/rates/[propertyId]
 *      Body: { date_from, date_to, channel_code, rate, min_stay_arrival? }
 *      Saves a per-channel override to calendar_rates and pushes the new
 *      rate/restriction to the corresponding Channex rate plan. Every
 *      connected channel (Airbnb, Booking.com, Vrbo) receives the push.
 */

// ---------- Cache (disabled) ----------
// The in-memory cache was causing stale responses across deploys —
// warm Vercel lambdas were serving pre-auto-discovery payloads for
// minutes after a fix shipped. The client-side hook already dedupes
// in-flight requests for the same (propertyId, dateFrom, dateTo), and
// Channex responds in well under a second, so the server-side cache
// was premature optimization.
function invalidatePropertyCache(propertyId: string) {
  // no-op — retained so call sites don't have to change if we bring
  // the cache back later.
  void propertyId;
}

// ---------- Response types ----------
type ChannelDateEntry = {
  rate: number | null;
  availability: number | null;
  min_stay_arrival: number | null;
  stop_sell: boolean;
  stored_rate: number | null;
  mismatch: boolean;
  source: "channex" | "channex+db";
};

type ChannelBlock = {
  channel_code: string;
  channel_name: string;
  rate_plan_id: string | null;
  status: string;
  editable: boolean;
  read_only_reason?: string;
  needs_setup?: boolean;
  setup_hint?: string;
  dates: Record<string, ChannelDateEntry>;
};

type GetResponseBody = {
  base: Record<string, { base_rate: number | null; suggested_rate: number | null; applied_rate: number | null; min_stay: number | null }>;
  channels: ChannelBlock[];
  fetched_at: string;
  cache_hit: boolean;
};

const CHANNEL_NAME: Record<string, string> = {
  ABB: "Airbnb",
  BDC: "Booking.com",
  VRBO: "Vrbo",
  DIRECT: "Direct",
};

// Every connected channel is editable — Moora pushes rates to all of
// them via their dedicated Channex rate plans.
const READ_ONLY_CHANNELS = new Set<string>();

// ==========================================================================
// GET
// ==========================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const refresh = url.searchParams.get("refresh") === "1";

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "date_from and date_to are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const propertyId = params.propertyId;
    // Cache intentionally disabled — see comment at the top of the file.
    void refresh;
    const supabase = createServiceClient();

    // 1. Channex property id for this property. If the property isn't
    //    linked to Channex yet, return an empty state instead of an error
    //    so the UI can show "No channels connected" rather than a scary
    //    red banner — this is the normal state for manually-created
    //    properties that haven't gone through the import/connect flows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRow } = await (supabase.from("properties") as any)
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (!propRow?.channex_property_id) {
      const empty: GetResponseBody = {
        base: {},
        channels: [],
        fetched_at: new Date().toISOString(),
        cache_hit: false,
      };
      return NextResponse.json(empty);
    }
    const channexPropertyId: string = propRow.channex_property_id;

    // 2. Load connected channels from property_channels. We include
    //    pending_authorization channels so the user can pre-set rates
    //    before the first live push.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelLinks } = await (supabase.from("property_channels") as any)
      .select("channel_code, channel_name, status, settings")
      .eq("property_id", propertyId)
      .in("status", ["active", "pending_authorization"]);

    // 2b. Auto-discover rate plans from Channex for property_channels rows
    //     that don't have settings.rate_plan_id populated (common for rows
    //     created via the import flow rather than the BDC connect flow).
    //     We need to intersect each channel's rate_plans with THIS property's
    //     rate plans, because multi-property channels (e.g. the user's
    //     single Airbnb channel for all their listings) expose every rate
    //     plan from every linked property in one rate_plans array.
    const channexRatePlanByCode: Record<string, string> = {};
    const channexCodeMap: Record<string, string> = { "AirBNB": "ABB", "BookingCom": "BDC", "VRBO": "VRBO" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debug: Record<string, any> = {};
    try {
      const channex = createChannexClient();
      const propRatePlans = await channex.getRatePlans(channexPropertyId);
      const propertyRatePlanIds = new Set(propRatePlans.map((rp) => rp.id));
      debug.property_rate_plans = Array.from(propertyRatePlanIds);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chRes: any = await channex.getChannels(channexPropertyId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      debug.channex_channels = (chRes?.data ?? []).map((ch: any) => ({
        id: ch.id,
        channel: ch.attributes?.channel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rate_plans: (ch.attributes?.rate_plans ?? []).map((rp: any) => rp?.rate_plan_id),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ch of (chRes?.data ?? []) as any[]) {
        const channexChannelType = ch.attributes?.channel;
        const pmsCode = channexCodeMap[channexChannelType];
        if (!pmsCode) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matching = (ch.attributes?.rate_plans ?? []).find((rp: any) =>
          rp?.rate_plan_id && propertyRatePlanIds.has(rp.rate_plan_id)
        );
        const rp = matching?.rate_plan_id;
        if (rp && !channexRatePlanByCode[pmsCode]) {
          channexRatePlanByCode[pmsCode] = rp;
        }
      }
      debug.discovered = channexRatePlanByCode;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debug.error = msg;
      console.warn("[channels/rates GET] Channex channel discovery failed:", msg);
    }

    // 2c. Merge property_channels rows with Channex-discovered rate plans,
    //     AND persist the discovered rate_plan_ids back to the DB so
    //     subsequent GET/POST calls don't have to re-query Channex. Also
    //     create property_channels entries for channels Channex knows about
    //     but the DB is missing (e.g. Airbnb auto-linked via Channex OAuth).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergedLinks: Array<{ channel_code: string; channel_name: string | null; status: string; settings: { rate_plan_id?: string; hotel_id?: string } | null }> = [];
    const seenCodes = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persistTargets: Array<{ propertyId: string; channel_code: string; channel_name: string; settings: Record<string, unknown>; needsInsert: boolean }> = [];
    const now = new Date().toISOString();
    for (const link of (channelLinks ?? []) as Array<{
      channel_code: string;
      channel_name: string | null;
      status: string;
      settings: { rate_plan_id?: string; hotel_id?: string } | null;
    }>) {
      seenCodes.add(link.channel_code);
      const storedRp = link.settings?.rate_plan_id;
      const discoveredRp = channexRatePlanByCode[link.channel_code];
      const resolvedRp = storedRp ?? discoveredRp;
      mergedLinks.push({
        ...link,
        settings: resolvedRp
          ? { ...(link.settings ?? {}), rate_plan_id: resolvedRp }
          : link.settings,
      });
      // If the DB row was missing rate_plan_id but we discovered one, persist it.
      if (!storedRp && discoveredRp) {
        persistTargets.push({
          propertyId,
          channel_code: link.channel_code,
          channel_name: link.channel_name ?? CHANNEL_NAME[link.channel_code] ?? link.channel_code,
          settings: { ...(link.settings ?? {}), rate_plan_id: discoveredRp },
          needsInsert: false,
        });
      }
    }
    // Channels known to Channex but not in property_channels — synthesize
    // AND persist so the next call sees them in the DB directly.
    for (const [code, rp] of Object.entries(channexRatePlanByCode)) {
      if (seenCodes.has(code)) continue;
      mergedLinks.push({
        channel_code: code,
        channel_name: null,
        status: "active",
        settings: { rate_plan_id: rp },
      });
      persistTargets.push({
        propertyId,
        channel_code: code,
        channel_name: CHANNEL_NAME[code] ?? code,
        settings: { rate_plan_id: rp },
        needsInsert: true,
      });
    }
    // Fire-and-forget DB writes — don't block the response. Any errors are
    // logged but don't fail the request; the next GET will just re-discover.
    if (persistTargets.length > 0) {
      (async () => {
        for (const t of persistTargets) {
          try {
            if (t.needsInsert) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from("property_channels") as any).upsert({
                property_id: t.propertyId,
                channex_channel_id: `auto-${t.channel_code.toLowerCase()}-${t.propertyId}`,
                channel_code: t.channel_code,
                channel_name: t.channel_name,
                status: "active",
                settings: t.settings,
                last_sync_at: now,
                updated_at: now,
              }, { onConflict: "property_id,channex_channel_id" });
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from("property_channels") as any)
                .update({ settings: t.settings, updated_at: now })
                .eq("property_id", t.propertyId)
                .eq("channel_code", t.channel_code);
            }
          } catch (err) {
            console.warn("[channels/rates GET] persist rate_plan_id failed:", err instanceof Error ? err.message : err);
          }
        }
      })();
    }

    // 3. Base rates for the date range (local DB only — no network call)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: baseRows } = await (supabase.from("calendar_rates") as any)
      .select("date, base_rate, suggested_rate, applied_rate, min_stay")
      .eq("property_id", propertyId)
      .is("channel_code", null)
      .gte("date", dateFrom)
      .lte("date", dateTo);

    const base: GetResponseBody["base"] = {};
    for (const r of (baseRows ?? []) as Array<{
      date: string;
      base_rate: string | null;
      suggested_rate: string | null;
      applied_rate: string | null;
      min_stay: number | null;
    }>) {
      base[r.date] = {
        base_rate: r.base_rate != null ? Number(r.base_rate) : null,
        suggested_rate: r.suggested_rate != null ? Number(r.suggested_rate) : null,
        applied_rate: r.applied_rate != null ? Number(r.applied_rate) : null,
        min_stay: r.min_stay,
      };
    }

    // 4. Per-channel stored override rates (for mismatch comparison)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overrideRows } = await (supabase.from("calendar_rates") as any)
      .select("date, channel_code, applied_rate, last_channex_rate")
      .eq("property_id", propertyId)
      .not("channel_code", "is", null)
      .gte("date", dateFrom)
      .lte("date", dateTo);

    const overrideLookup = new Map<string, Map<string, { applied_rate: number | null; last_channex_rate: number | null }>>();
    for (const r of (overrideRows ?? []) as Array<{
      date: string;
      channel_code: string;
      applied_rate: string | null;
      last_channex_rate: string | null;
    }>) {
      if (!overrideLookup.has(r.channel_code)) overrideLookup.set(r.channel_code, new Map());
      overrideLookup.get(r.channel_code)!.set(r.date, {
        applied_rate: r.applied_rate != null ? Number(r.applied_rate) : null,
        last_channex_rate: r.last_channex_rate != null ? Number(r.last_channex_rate) : null,
      });
    }

    // 5. Fetch live bucketed restrictions from Channex — one call covers all
    //    rate plans on the property.
    const channexForRates = createChannexClient();
    let bucketedByRatePlan: Record<string, Record<string, {
      rate?: string;
      availability?: number;
      min_stay_arrival?: number;
      stop_sell?: boolean;
    }>> = {};
    let channexError: string | null = null;
    try {
      bucketedByRatePlan = await channexForRates.getRestrictionsBucketed(
        channexPropertyId,
        dateFrom,
        dateTo,
        ["rate", "availability", "min_stay_arrival", "stop_sell"]
      );
    } catch (err) {
      channexError = err instanceof Error ? err.message : "Unknown Channex error";
      console.warn("[channels/rates GET] Channex fetch failed:", channexError);
    }

    // 6. Build per-channel blocks from the merged (property_channels ∪ Channex-discovered) list
    const channels: ChannelBlock[] = [];
    for (const link of mergedLinks) {
      const code = link.channel_code;
      const ratePlanId = link.settings?.rate_plan_id ?? null;
      const channelName = CHANNEL_NAME[code] ?? link.channel_name ?? code;
      const readOnly = READ_ONLY_CHANNELS.has(code);

      if (!ratePlanId) {
        // Channel linked but no rate plan set up — this is the VRBO "Setup
        // needed" state. Show the card with a CTA rather than hiding it.
        channels.push({
          channel_code: code,
          channel_name: channelName,
          rate_plan_id: null,
          status: link.status,
          editable: false,
          needs_setup: true,
          setup_hint: "Finish channel setup to push rates.",
          dates: {},
        });
        continue;
      }

      const bucket = bucketedByRatePlan[ratePlanId] ?? {};
      const overrides = overrideLookup.get(code) ?? new Map();

      const dates: Record<string, ChannelDateEntry> = {};
      // Walk the requested date range so the UI always has an entry per date
      for (let d = new Date(dateFrom + "T00:00:00Z"); d <= new Date(dateTo + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        const live = bucket[ds];
        const override = overrides.get(ds);
        // Channex returns rate="0.00" for dates where no rate has ever
        // been pushed to the rate plan (past dates, newly created plans).
        // A $0 nightly rate is never legitimate for a vacation rental, so
        // treat 0 as "unset" — the UI falls back to the base rate for
        // display and the user can type a real number to push.
        const rawLive = live?.rate != null ? Number(live.rate) : null;
        const liveRate = rawLive != null && rawLive > 0 ? rawLive : null;
        const storedRate = override?.applied_rate ?? null;
        const mismatch = storedRate != null && liveRate != null && Math.abs(storedRate - liveRate) > 0.5;

        dates[ds] = {
          rate: liveRate,
          availability: live?.availability ?? null,
          min_stay_arrival: live?.min_stay_arrival ?? null,
          stop_sell: live?.stop_sell === true,
          stored_rate: storedRate,
          mismatch,
          source: storedRate != null ? "channex+db" : "channex",
        };
      }

      channels.push({
        channel_code: code,
        channel_name: channelName,
        rate_plan_id: ratePlanId,
        status: link.status,
        editable: !readOnly,
        dates,
      });
    }

    const body: GetResponseBody = {
      base,
      channels,
      fetched_at: new Date().toISOString(),
      cache_hit: false,
    };

    return NextResponse.json({
      ...body,
      channex_error: channexError,
      _debug: debug,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/rates GET] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ==========================================================================
// POST
// ==========================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    // Parse body FIRST so the Track B Stage 0 gate can inspect channel_code
    // before we spend a round-trip on auth. Symmetric with /activate and
    // /pricing/push which gate at the top of the handler — the only
    // difference is that this gate is conditional on the body's target
    // channel. See src/lib/channex/calendar-push-gate.ts + the postmortem.
    const body = await request.json().catch(() => ({}));
    const { date_from, date_to, channel_code, rate, min_stay_arrival } = body as {
      date_from?: string;
      date_to?: string;
      channel_code?: string;
      rate?: number;
      min_stay_arrival?: number;
    };

    if (isBdcChannelCode(channel_code) && !isCalendarPushEnabled()) {
      return NextResponse.json({
        error: `${CALENDAR_PUSH_DISABLED_MESSAGE} Airbnb-only rate saves still work.`,
      }, { status: 503 });
    }

    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!date_from || !date_to || !channel_code || rate == null) {
      return NextResponse.json(
        { error: "date_from, date_to, channel_code, rate are required" },
        { status: 400 }
      );
    }

    const propertyId = params.propertyId;
    const supabase = createServiceClient();

    // Resolve Channex property id + the channel's dedicated rate plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRow } = await (supabase.from("properties") as any)
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (!propRow?.channex_property_id) {
      return NextResponse.json({ error: "Property not connected to Channex" }, { status: 400 });
    }
    const channexPropertyId: string = propRow.channex_property_id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: link } = await (supabase.from("property_channels") as any)
      .select("channex_channel_id, settings, status")
      .eq("property_id", propertyId)
      .eq("channel_code", channel_code)
      .maybeSingle();

    let ratePlanId: string | undefined = link?.settings?.rate_plan_id;

    // Auto-discover the rate plan from Channex if property_channels.settings
    // doesn't have it (common for rows created via the import flow). Once
    // discovered, persist it back to property_channels so future calls skip
    // the discovery round-trip.
    if (!ratePlanId) {
      try {
        const channex = createChannexClient();
        const propRatePlans = await channex.getRatePlans(channexPropertyId);
        const propertyRatePlanIds = new Set(propRatePlans.map((rp) => rp.id));
        const channexCodeMap: Record<string, string> = { "AirBNB": "ABB", "BookingCom": "BDC", "VRBO": "VRBO" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chRes: any = await channex.getChannels(channexPropertyId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ch of (chRes?.data ?? []) as any[]) {
          const channexChannelType = ch.attributes?.channel;
          const pmsCode = channexCodeMap[channexChannelType];
          if (pmsCode !== channel_code) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matching = (ch.attributes?.rate_plans ?? []).find((rp: any) =>
            rp?.rate_plan_id && propertyRatePlanIds.has(rp.rate_plan_id)
          );
          if (matching?.rate_plan_id) {
            ratePlanId = matching.rate_plan_id;
            break;
          }
        }
      } catch (err) {
        console.warn("[channels/rates POST] Rate plan discovery failed:", err instanceof Error ? err.message : err);
      }

      if (ratePlanId && link) {
        // Persist the discovered rate plan id so future requests don't
        // repeat the lookup.
        const mergedSettings = { ...(link.settings ?? {}), rate_plan_id: ratePlanId };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("property_channels") as any)
          .update({ settings: mergedSettings, updated_at: new Date().toISOString() })
          .eq("property_id", propertyId)
          .eq("channel_code", channel_code);
      }
    }

    if (!ratePlanId) {
      return NextResponse.json(
        { error: `No rate plan configured for channel ${channel_code}. Finish channel setup first.` },
        { status: 400 }
      );
    }

    // Generate the date list (inclusive)
    const dates: string[] = [];
    for (let d = new Date(date_from + "T00:00:00Z"); d <= new Date(date_to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().split("T")[0]);
    }
    if (dates.length === 0) {
      return NextResponse.json({ error: "Empty date range" }, { status: 400 });
    }

    // Persist per-channel override rows in calendar_rates. Strict separation:
    // the base row (channel_code = NULL) is NOT touched — the pricing engine
    // still owns that number.
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overrideRows = dates.map((d) => ({
      property_id: propertyId,
      date: d,
      channel_code,
      applied_rate: rate,
      base_rate: rate,
      min_stay: min_stay_arrival ?? null,
      is_available: true,
      rate_source: "manual_per_channel",
      channex_rate_plan_id: ratePlanId,
      last_pushed_at: now,
      last_channex_rate: rate,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertErr } = await (supabase.from("calendar_rates") as any).upsert(
      overrideRows,
      { onConflict: "property_id,date,channel_code" }
    );
    if (upsertErr) {
      console.error("[channels/rates POST] DB upsert error:", upsertErr);
      return NextResponse.json({ error: `DB save failed: ${upsertErr.message}` }, { status: 500 });
    }

    // Push rate + (optional) min_stay to Channex. Channex expects cents.
    // Per our earlier Pool House investigation, some BDC rate types reject
    // min_stay_arrival pushes ("RATE_IS_A_SLAVE_RATE"); we catch and report
    // the push error in the response so the UI can surface it.
    const channex = createChannexClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restrictionValues: any[] = dates.map((d) => ({
      property_id: channexPropertyId,
      rate_plan_id: ratePlanId,
      date_from: d,
      date_to: d,
      rate: Math.round(rate * 100),
      ...(min_stay_arrival != null ? { min_stay_arrival } : {}),
    }));

    let pushed = false;
    let pushError: string | null = null;
    try {
      // Batches of 200 to match our existing pattern
      for (let i = 0; i < restrictionValues.length; i += 200) {
        await channex.updateRestrictions(restrictionValues.slice(i, i + 200));
      }
      pushed = true;
    } catch (err) {
      pushError = err instanceof Error ? err.message : String(err);
      console.warn("[channels/rates POST] Channex push failed:", pushError);
    }

    invalidatePropertyCache(propertyId);

    return NextResponse.json({
      ok: true,
      pushed,
      push_error: pushError,
      channel_code,
      rate_plan_id: ratePlanId,
      dates: dates.length,
      date_from,
      date_to,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/rates POST] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
