import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AnalyticsDashboard from "@/components/dashboard/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function MarketExplorerPage({ searchParams }: { searchParams: { property?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const end90 = new Date();
  end90.setDate(end90.getDate() + 90);
  const endStr = end90.toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split("T")[0];
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString().split("T")[0];
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  // Fetch properties
  const propertiesRes = await supabase.from("properties").select("id, name, cover_photo_url").eq("user_id", user.id).order("name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string; cover_photo_url: string | null }[];

  if (properties.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Market Explorer</h1>
        <p className="text-sm text-neutral-500 mb-8">Market analysis and performance metrics</p>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">No properties yet</h2>
          <p className="text-sm text-neutral-500 mb-6">Add a property to see market analytics.</p>
          <Link href="/properties" className="inline-flex px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors">
            Add Property
          </Link>
        </div>
      </div>
    );
  }

  const selectedId = searchParams.property;
  const propertyId = (selectedId && properties.some((p) => p.id === selectedId))
    ? selectedId
    : properties[0].id;

  // Fetch property lat/lng
  const propDetailRes = await supabase
    .from("properties")
    .select("latitude, longitude")
    .eq("id", propertyId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propDetail = ((propDetailRes.data ?? []) as any[])[0];
  const propertyLatLng = propDetail?.latitude && propDetail?.longitude
    ? { lat: Number(propDetail.latitude), lng: Number(propDetail.longitude) }
    : null;

  // Fetch market snapshot
  const snapRes = await supabase
    .from("market_snapshots")
    .select("market_adr, market_occupancy, market_revpar, market_supply, market_demand_score, snapshot_date")
    .eq("property_id", propertyId)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = ((snapRes.data ?? []) as any[])[0] ?? null;

  // Fetch comps
  const compsRes = await supabase
    .from("market_comps")
    .select("comp_listing_id, comp_name, comp_bedrooms, comp_adr, comp_occupancy, comp_revpar, distance_km, photo_url")
    .eq("property_id", propertyId)
    .order("comp_adr", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comps = (compsRes.data ?? []) as any[];

  // Fetch rates (90 days)
  const ratesRes = await supabase
    .from("calendar_rates")
    .select("date, applied_rate, suggested_rate, base_rate")
    .eq("property_id", propertyId)
    .is("channel_code", null)
    .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
    .lte("date", endStr)
    .order("date");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rates = (ratesRes.data ?? []) as any[];

  // Compute property stats
  const ratesWithApplied = rates.filter((r: { applied_rate: number | null }) => r.applied_rate != null);
  const avgRate = ratesWithApplied.length > 0
    ? Math.round(ratesWithApplied.reduce((s: number, r: { applied_rate: number }) => s + r.applied_rate, 0) / ratesWithApplied.length)
    : 0;

  // Property occupancy this month
  const bookingsRes = await supabase
    .from("bookings")
    .select("check_in, check_out")
    .eq("property_id", propertyId)
    .lte("check_in", monthEnd)
    .gte("check_out", monthStart)
    .in("status", ["confirmed", "completed"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthBookings = (bookingsRes.data ?? []) as any[];

  let bookedNights = 0;
  for (const b of monthBookings) {
    const ci = new Date(b.check_in);
    const co = new Date(b.check_out);
    const ms = Math.max(ci.getTime(), new Date(monthStart).getTime());
    const me = Math.min(co.getTime(), new Date(monthEnd).getTime() + 86400000);
    bookedNights += Math.max(0, Math.ceil((me - ms) / 86400000));
  }
  const occupancy = daysInMonth > 0 ? Math.round((bookedNights / daysInMonth) * 100) : 0;
  const revpar = Math.round(avgRate * (occupancy / 100));

  return (
    <AnalyticsDashboard
      key={propertyId}
      properties={properties}
      initialPropertyId={propertyId}
      snapshot={snapshot}
      comps={comps}
      rates={rates}
      propertyStats={{ avgRate, occupancy, revpar }}
      propertyLatLng={propertyLatLng}
      propertyName={properties[0].name}
      lastUpdated={snapshot?.snapshot_date ?? null}
      hasRevenueData={avgRate > 0}
    />
  );
}
