/**
 * POST /api/calendar/rates/apply
 *
 * Parallel write surface to /api/pricing/apply but scoped to ad-hoc
 * rate edits from the Session 5a Calendar sidebar (master or per-
 * platform). See docs/CHANNEX_PER_PLATFORM_AUDIT.md for the schema
 * rules this endpoint respects.
 *
 * Body:
 *   {
 *     property_id: uuid,
 *     date: 'YYYY-MM-DD',
 *     mode: 'master' | 'platform',
 *     channel_code?: 'BDC'|'ABB'|'VRBO'|'DIRECT',   // required if mode='platform'
 *     rate: number,
 *     wipe_overrides?: boolean,                      // only used for mode='master'
 *     idempotency_key: uuid
 *   }
 *
 * Behavior:
 *   mode=master, wipe=false : upsert base row, push to channels w/o overrides
 *   mode=master, wipe=true  : upsert base row, DELETE overrides, push to all active channels
 *   mode=platform           : upsert override row, push to that channel only
 *
 * Push dispatch reuses the pattern from /api/pricing/apply's multi-
 * channel loop: BDC goes through buildSafeBdcRestrictions; non-BDC
 * channels push directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  CALENDAR_PUSH_DISABLED_MESSAGE,
  isBdcChannelCode,
  isCalendarPushEnabled,
} from "@/lib/channex/calendar-push-gate";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
  type KoastRestrictionProposal,
} from "@/lib/channex/safe-restrictions";

type Mode = "master" | "platform";

type ChannelLink = {
  channel_code: string;
  channel_name: string | null;
  settings: { rate_plan_id?: string } | null;
};

export async function POST(request: NextRequest) {
  if (!isCalendarPushEnabled()) {
    return NextResponse.json({ error: CALENDAR_PUSH_DISABLED_MESSAGE }, { status: 503 });
  }
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const {
      property_id,
      date,
      mode,
      channel_code,
      rate,
      wipe_overrides,
      idempotency_key,
    } = body as {
      property_id?: string;
      date?: string;
      mode?: Mode;
      channel_code?: string;
      rate?: number;
      wipe_overrides?: boolean;
      idempotency_key?: string;
    };

    if (!property_id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "property_id and date (YYYY-MM-DD) required" }, { status: 400 });
    }
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "rate must be a positive number" }, { status: 400 });
    }
    if (mode !== "master" && mode !== "platform") {
      return NextResponse.json({ error: "mode must be 'master' or 'platform'" }, { status: 400 });
    }
    if (mode === "platform" && !channel_code) {
      return NextResponse.json({ error: "channel_code required when mode='platform'" }, { status: 400 });
    }
    if (!idempotency_key) {
      return NextResponse.json({ error: "idempotency_key required" }, { status: 400 });
    }

    const isOwner = await verifyPropertyOwnership(user.id, property_id);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const lockKey = `calendar_rate_apply:${property_id}:${date}:${idempotency_key}`;
    const lockAcquired = await acquireLock(supabase, lockKey, 60);
    if (!lockAcquired) {
      return NextResponse.json(
        { error: "duplicate_request", message: "An identical apply is in flight." },
        { status: 409 }
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prop } = await (supabase.from("properties") as any)
        .select("id, channex_property_id")
        .eq("id", property_id)
        .maybeSingle();
      if (!prop?.channex_property_id) {
        return NextResponse.json({ error: "Property not connected to Channex" }, { status: 400 });
      }
      const channexPropertyId: string = prop.channex_property_id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: channelLinks } = await (supabase.from("property_channels") as any)
        .select("channel_code, channel_name, settings, status")
        .eq("property_id", property_id)
        .eq("status", "active");
      const links = ((channelLinks ?? []) as ChannelLink[])
        .filter((l) => l.settings?.rate_plan_id)
        .map((l) => ({
          channel_code: l.channel_code.toUpperCase(),
          rate_plan_id: l.settings?.rate_plan_id as string,
        }));

      if (links.length === 0) {
        return NextResponse.json({ error: "No connected channels with a rate plan configured" }, { status: 400 });
      }

      // Determine which channels to push to this call.
      let targets: Array<{ channel_code: string; rate_plan_id: string }> = [];
      if (mode === "platform") {
        const code = (channel_code ?? "").toUpperCase();
        const match = links.find((l) => l.channel_code === code);
        if (!match) {
          return NextResponse.json({ error: `Channel ${code} not connected for this property` }, { status: 400 });
        }
        targets = [match];
      } else if (wipe_overrides) {
        // Master + wipe — hit every connected channel.
        targets = links;
      } else {
        // Master without wipe — hit channels that DO NOT have a
        // differing override row for this date. Query overrides first.
        const codes = links.map((l) => l.channel_code);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingOverrides } = await (supabase.from("calendar_rates") as any)
          .select("channel_code, applied_rate")
          .eq("property_id", property_id)
          .eq("date", date)
          .in("channel_code", codes);
        const overrideCodes = new Set(
          ((existingOverrides ?? []) as Array<{ channel_code: string; applied_rate: number | null }>)
            .filter((o) => o.applied_rate != null && Number(o.applied_rate) !== rate)
            .map((o) => o.channel_code.toUpperCase())
        );
        targets = links.filter((l) => !overrideCodes.has(l.channel_code));
      }

      // Push to Channex target-by-target, mirroring /api/pricing/apply.
      const channex = createChannexClient();
      const failedChannels: Array<{ channel_code: string; error: string }> = [];
      const pushedChannels: string[] = [];

      for (const t of targets) {
        try {
          if (isBdcChannelCode(t.channel_code)) {
            const proposal: KoastRestrictionProposal = {
              rate,
              availability: 1,
              stop_sell: false,
            };
            const koastProposed = new Map<string, KoastRestrictionProposal>([[date, proposal]]);
            const plan = await buildSafeBdcRestrictions({
              channex,
              channexPropertyId,
              bdcRatePlanId: t.rate_plan_id,
              dateFrom: date,
              dateTo: date,
              koastProposed,
            });
            if (plan.entries_to_push.length === 0) {
              failedChannels.push({ channel_code: t.channel_code, error: "safe_restrictions_skipped" });
              continue;
            }
            const payload = toChannexRestrictionValues(plan, channexPropertyId, t.rate_plan_id);
            await channex.updateRestrictions(payload);
            pushedChannels.push(t.channel_code);
          } else {
            await channex.updateRestrictions([
              {
                property_id: channexPropertyId,
                rate_plan_id: t.rate_plan_id,
                date_from: date,
                date_to: date,
                rate: Math.round(rate * 100),
                min_stay_arrival: 1,
                stop_sell: false,
              },
            ]);
            pushedChannels.push(t.channel_code);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failedChannels.push({ channel_code: t.channel_code, error: msg });
          console.error(`[calendar/rates/apply ${t.channel_code}]`, msg);
        }
      }

      // DB writes — only touch rows for channels that pushed successfully.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = supabase.from("calendar_rates") as any;
      let calendar_rates_upserted = 0;

      if (mode === "master") {
        // Upsert base row (channel_code NULL).
        const { error: baseErr } = await table.upsert(
          [{ property_id, date, channel_code: null, applied_rate: rate, rate_source: "manual", is_available: true }],
          { onConflict: "property_id,date,channel_code" }
        );
        if (baseErr) console.warn("[calendar/rates/apply] base upsert failed:", baseErr.message);
        else calendar_rates_upserted += 1;

        if (wipe_overrides) {
          // Delete ALL override rows for this (property, date).
          const { error: delErr } = await table
            .delete()
            .eq("property_id", property_id)
            .eq("date", date)
            .not("channel_code", "is", null);
          if (delErr) console.warn("[calendar/rates/apply] override wipe failed:", delErr.message);
        }
      } else {
        // mode === 'platform' — upsert the specific channel's override.
        const code = (channel_code ?? "").toUpperCase();
        if (pushedChannels.includes(code)) {
          const { error: overErr } = await table.upsert(
            [
              {
                property_id,
                date,
                channel_code: code,
                applied_rate: rate,
                rate_source: "manual_per_channel",
                is_available: true,
              },
            ],
            { onConflict: "property_id,date,channel_code" }
          );
          if (overErr) console.warn("[calendar/rates/apply] override upsert failed:", overErr.message);
          else calendar_rates_upserted += 1;
        }
      }

      const success = failedChannels.length === 0;
      const status = failedChannels.length === 0 ? 200 : 207;
      return NextResponse.json(
        {
          success,
          calendar_rates_upserted,
          channels_pushed: pushedChannels,
          ...(failedChannels.length > 0 ? { failed_channels: failedChannels } : {}),
        },
        { status }
      );
    } finally {
      await releaseLock(supabase, lockKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar/rates/apply POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
