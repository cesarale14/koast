/**
 * GET /api/calendar/rates?property_id=<uuid>&date=<YYYY-MM-DD>
 *
 * Returns the master (property-level) rate + per-platform rates for
 * a single (property, date). Consumed by the Session 5a Calendar
 * sidebar's Pricing tab.
 *
 * Response shape:
 *   {
 *     master: {
 *       base_rate, suggested_rate, applied_rate, rate_source,
 *       factors, min_stay, is_available, updated_at
 *     },
 *     platforms: [
 *       { channel_code, channel_name, applied_rate, overrides_master }
 *     ]
 *   }
 *
 * `overrides_master` is true when the platform's override rate differs
 * from the master applied_rate. A platform with no override row
 * inherits the master rate and renders with overrides_master=false.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

// Authoritative channel display-name source. `property_channels.channel_name`
// used to back this, but that column has historically stored the *property*
// name for some rows (e.g. "Villa Jamaica" on ABB) instead of the channel
// display name. Sourcing from this registry decouples the sidebar from
// that data-quality issue.
const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  BDC: "Booking.com",
  ABB: "Airbnb",
  VRBO: "Vrbo",
  DIRECT: "Direct",
};

interface MasterRow {
  base_rate: number | null;
  suggested_rate: number | null;
  applied_rate: number | null;
  rate_source: string | null;
  factors: Record<string, unknown> | null;
  min_stay: number | null;
  is_available: boolean | null;
  created_at: string | null;
}

interface OverrideRow {
  channel_code: string;
  applied_rate: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const propertyId = url.searchParams.get("property_id");
    const date = url.searchParams.get("date");
    if (!propertyId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "property_id and date (YYYY-MM-DD) required" }, { status: 400 });
    }
    const isOwner = await verifyPropertyOwnership(user.id, propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // Active channels registered for this property. We only need channel_code —
    // the display name comes from CHANNEL_DISPLAY_NAMES, not from the DB.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelRows } = await (supabase.from("property_channels") as any)
      .select("channel_code")
      .eq("property_id", propertyId)
      .eq("status", "active");
    const channels = ((channelRows ?? []) as Array<{ channel_code: string }>)
      .map((c) => ({ channel_code: c.channel_code.toUpperCase() }));

    // Master (base) row — channel_code IS NULL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: masterRaw } = await (supabase.from("calendar_rates") as any)
      .select("base_rate, suggested_rate, applied_rate, rate_source, factors, min_stay, is_available, created_at")
      .eq("property_id", propertyId)
      .eq("date", date)
      .is("channel_code", null)
      .maybeSingle();
    const master = masterRaw as MasterRow | null;

    // Override rows — one per channel that has explicitly differed from master.
    const activeCodes = channels.map((c) => c.channel_code);
    let overrides: OverrideRow[] = [];
    if (activeCodes.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: overrideRows } = await (supabase.from("calendar_rates") as any)
        .select("channel_code, applied_rate")
        .eq("property_id", propertyId)
        .eq("date", date)
        .in("channel_code", activeCodes);
      overrides = ((overrideRows ?? []) as OverrideRow[]).map((o) => ({
        channel_code: o.channel_code.toUpperCase(),
        applied_rate: o.applied_rate != null ? Number(o.applied_rate) : null,
      }));
    }
    const overrideByCode = new Map(overrides.map((o) => [o.channel_code, o]));

    const masterApplied = master?.applied_rate != null ? Number(master.applied_rate) : null;

    const platforms = channels.map((c) => {
      const override = overrideByCode.get(c.channel_code);
      const applied = override?.applied_rate ?? masterApplied;
      const overrides_master = override?.applied_rate != null && override.applied_rate !== masterApplied;
      return {
        channel_code: c.channel_code,
        channel_name: CHANNEL_DISPLAY_NAMES[c.channel_code] ?? c.channel_code,
        applied_rate: applied,
        overrides_master,
      };
    });

    return NextResponse.json({
      master: master
        ? {
            base_rate: master.base_rate != null ? Number(master.base_rate) : null,
            suggested_rate: master.suggested_rate != null ? Number(master.suggested_rate) : null,
            applied_rate: masterApplied,
            rate_source: master.rate_source,
            factors: master.factors,
            min_stay: master.min_stay != null ? Number(master.min_stay) : null,
            is_available: master.is_available ?? true,
            updated_at: master.created_at,
          }
        : {
            base_rate: null,
            suggested_rate: null,
            applied_rate: null,
            rate_source: null,
            factors: null,
            min_stay: null,
            is_available: true,
            updated_at: null,
          },
      platforms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar/rates GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
