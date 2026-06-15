/**
 * bootstrapNewProperty — the single shared post-creation step (P7.2).
 *
 * Every property add-path runs this and nothing else owns these three jobs, so
 * there are no divergent add-paths:
 *   • POST /api/properties        (the onboarding wizard + the manual form)
 *   • /api/properties/import-from-url  (inline, server-side)
 *   • /api/channex/import         (inline, per imported property)
 *
 * Idempotent + safe to re-run. Enforces the launch invariant:
 *   1. timezone is NEVER null — resolved from coords (offline tz-lookup) with a
 *      country / launch-region fallback. Set ONLY when currently missing/invalid
 *      so a host-set tz is never clobbered. This is what keeps the property
 *      agenda-visible (buildAgendaRollup skips null-tz properties).
 *   2. a property_details row exists (ensure-only; never overwrites values).
 *   3. when a base rate is known, the calendar_rates base layer (channel_code
 *      NULL) is seeded so the Calendar / Pricing surfaces aren't empty. Upsert
 *      with ignoreDuplicates — never clobbers an existing rate.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePropertyTimezone } from "./timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

const DEFAULT_SEED_DAYS = 365;
const SEED_CHUNK = 200;

function isValidIanaTz(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type BootstrapResult = {
  timezone: string;
  timezoneWasSet: boolean;
  detailsEnsured: boolean;
  ratesSeeded: number;
};

export async function bootstrapNewProperty(
  svc: Svc,
  opts: {
    propertyId: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    country?: string | null;
    baseRate?: number | null;
    minStay?: number | null;
    seedDays?: number;
    rateSource?: string;
  },
): Promise<BootstrapResult> {
  const { propertyId } = opts;

  // 1. Timezone invariant — set only when the property's tz is null/invalid.
  const { data: cur } = await svc
    .from("properties")
    .select("timezone")
    .eq("id", propertyId)
    .single();
  const existingTz = (cur as { timezone: string | null } | null)?.timezone ?? null;
  let timezone: string;
  let timezoneWasSet = false;
  if (isValidIanaTz(existingTz)) {
    timezone = existingTz as string;
  } else {
    timezone = resolvePropertyTimezone({
      latitude: opts.latitude,
      longitude: opts.longitude,
      country: opts.country,
    });
    await svc.from("properties").update({ timezone }).eq("id", propertyId);
    timezoneWasSet = true;
  }

  // 2. Ensure a property_details row exists (never overwrite existing values).
  await svc
    .from("property_details")
    .upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { property_id: propertyId } as any,
      { onConflict: "property_id", ignoreDuplicates: true },
    );

  // 3. Seed the calendar_rates base layer when a usable base rate is known.
  let ratesSeeded = 0;
  const baseRate = opts.baseRate;
  if (baseRate != null && Number.isFinite(baseRate) && baseRate > 0) {
    const seedDays = opts.seedDays ?? DEFAULT_SEED_DAYS;
    const minStay = opts.minStay && opts.minStay > 0 ? opts.minStay : 1;
    const rateSource = opts.rateSource ?? "default";
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < seedDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      rows.push({
        property_id: propertyId,
        date: d.toISOString().slice(0, 10),
        channel_code: null,
        base_rate: baseRate,
        applied_rate: baseRate,
        min_stay: minStay,
        is_available: true,
        rate_source: rateSource,
      });
    }
    for (let i = 0; i < rows.length; i += SEED_CHUNK) {
      const slice = rows.slice(i, i + SEED_CHUNK);
      const { error } = await svc
        .from("calendar_rates")
        // ignoreDuplicates → ON CONFLICT DO NOTHING against the
        // (property_id, date, channel_code) NULLS NOT DISTINCT unique index.
        .upsert(slice, {
          onConflict: "property_id,date,channel_code",
          ignoreDuplicates: true,
        });
      if (error) {
        console.warn(`[bootstrap] rate seed chunk failed for ${propertyId}: ${error.message}`);
        break;
      }
      ratesSeeded += slice.length;
    }
  }

  return { timezone, timezoneWasSet, detailsEnsured: true, ratesSeeded };
}
