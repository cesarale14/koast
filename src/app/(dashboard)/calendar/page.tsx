import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import CalendarView from "@/components/polish/CalendarView";
import { KoastEmptyState } from "@/components/polish/KoastEmptyState";
import { KoastButton } from "@/components/polish/KoastButton";

const TOTAL_DAYS = 730;

export default async function CalendarPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const yesterdayUtc = new Date();
  yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
  const today = yesterdayUtc.toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + TOTAL_DAYS);
  const end = endDate.toISOString().split("T")[0];

  const propertiesRes = await supabase
    .from("properties")
    .select("id, name, cover_photo_url")
    .eq("user_id", user.id)
    .order("name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string; cover_photo_url: string | null }[];

  if (properties.length === 0) {
    return (
      <div style={{ padding: 48 }}>
        <KoastEmptyState
          title="No properties yet"
          body="Add your first property to see the calendar."
          action={
            <Link href="/properties">
              <KoastButton variant="primary">Add a property</KoastButton>
            </Link>
          }
        />
      </div>
    );
  }

  const propertyIds = properties.map((p) => p.id);
  const svc = createServiceClient();
  // Session 5a.4: fetch ALL calendar_rates rows (both base where
  // channel_code IS NULL and per-channel override rows) in one query.
  // We then group by (property_id, date) to compute the grid's
  // display_rate and the divergence flag per the policy:
  //   - No overrides, or overrides all equal base  → display base, no divergence
  //   - Overrides uniform but differ from base     → display the override, divergence ON
  //   - Overrides disagree                         → display base, divergence ON
  //   - No base + overrides present (edge)         → display first override, divergence per agreement
  // The sidebar still fetches its own bundle via /api/calendar/rates.
  const [bookingsRes, ratesRes] = await Promise.all([
    svc
      .from("bookings")
      .select(
        "id, property_id, guest_name, check_in, check_out, platform, total_price, num_guests, status"
      )
      .in("property_id", propertyIds)
      .lte("check_in", end)
      .gte("check_out", today)
      .in("status", ["confirmed", "completed", "pending"]),
    svc
      .from("calendar_rates")
      .select(
        "property_id, date, channel_code, base_rate, suggested_rate, applied_rate, min_stay, is_available, rate_source"
      )
      .in("property_id", propertyIds)
      .gte("date", today)
      .lte("date", end),
  ]);

  const bookings = (bookingsRes.data ?? []) as {
    id: string;
    property_id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    platform: string;
    total_price: number | null;
    num_guests: number | null;
    status: string;
  }[];

  type CalendarRateRow = {
    property_id: string;
    date: string;
    channel_code: string | null;
    base_rate: number | null;
    suggested_rate: number | null;
    applied_rate: number | null;
    min_stay: number;
    is_available: boolean;
    rate_source: string;
  };

  const allRows = (ratesRes.data ?? []) as CalendarRateRow[];

  // Group by (property_id, date): one base row (channel_code=NULL)
  // plus zero-or-more override rows keyed by channel_code.
  const byKey = new Map<string, { base: CalendarRateRow | null; overrides: CalendarRateRow[] }>();
  for (const r of allRows) {
    const key = `${r.property_id}|${r.date}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { base: null, overrides: [] };
      byKey.set(key, bucket);
    }
    if (r.channel_code === null) bucket.base = r;
    else bucket.overrides.push(r);
  }

  const rates: Array<{
    property_id: string;
    date: string;
    base_rate: number | null;
    suggested_rate: number | null;
    applied_rate: number | null;
    display_rate: number | null;
    min_stay: number;
    is_available: boolean;
    rate_source: string;
  }> = [];
  const overrideDatesByProperty: Record<string, string[]> = {};

  for (const bucket of Array.from(byKey.values())) {
    const { base, overrides } = bucket;
    // Choose a canonical "record" to carry the non-rate fields (min_stay,
    // is_available, rate_source). Prefer the base row; fall back to the
    // first override in the edge case where the base row doesn't exist
    // yet (post-apply, pre-sync state).
    const canonical: CalendarRateRow | null = base ?? overrides[0] ?? null;
    if (!canonical) continue;

    const baseApplied = base?.applied_rate ?? null;
    const overrideApplied: number[] = overrides
      .map((o: CalendarRateRow) => o.applied_rate)
      .filter((v: number | null): v is number => v != null);
    const allOverridesEqual =
      overrideApplied.length > 0 && overrideApplied.every((v: number) => v === overrideApplied[0]);

    let displayRate: number | null;
    let hasDivergence: boolean;

    if (overrides.length === 0) {
      displayRate = baseApplied;
      hasDivergence = false;
    } else if (!base) {
      displayRate = overrideApplied[0] ?? null;
      hasDivergence = !allOverridesEqual;
    } else if (allOverridesEqual) {
      const unified = overrideApplied[0];
      if (unified === baseApplied) {
        displayRate = baseApplied;
        hasDivergence = false;
      } else {
        displayRate = unified;
        hasDivergence = true;
      }
    } else {
      displayRate = baseApplied;
      hasDivergence = true;
    }

    rates.push({
      property_id: canonical.property_id,
      date: canonical.date,
      base_rate: base?.base_rate ?? null,
      suggested_rate: base?.suggested_rate ?? null,
      applied_rate: baseApplied,
      display_rate: displayRate,
      min_stay: canonical.min_stay,
      is_available: canonical.is_available,
      rate_source: canonical.rate_source,
    });

    if (hasDivergence) {
      if (!overrideDatesByProperty[canonical.property_id]) {
        overrideDatesByProperty[canonical.property_id] = [];
      }
      overrideDatesByProperty[canonical.property_id].push(canonical.date);
    }
  }

  return (
    <CalendarView
      properties={properties}
      bookings={bookings}
      rates={rates}
      overrideDatesByProperty={overrideDatesByProperty}
    />
  );
}
