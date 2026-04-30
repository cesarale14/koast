import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PricingDashboard from "@/components/dashboard/PricingDashboard";

export default async function PricingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const today = new Date().toISOString().split("T")[0];
  const end90 = new Date();
  end90.setDate(end90.getDate() + 90);
  const endStr = end90.toISOString().split("T")[0];

  // Fetch properties
  const propertiesRes = await supabase.from("properties").select("id, name").eq("user_id", user.id).order("name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string }[];

  if (properties.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Dynamic Pricing</h1>
        <p className="text-sm text-neutral-500 mb-8">AI-powered rate optimization</p>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-16 h-16 bg-success-light rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-coastal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">No properties yet</h2>
          <p className="text-sm text-neutral-500 mb-6">Add a property to start using the pricing engine.</p>
          <Link
            href="/properties"
            className="inline-flex px-5 py-2.5 bg-coastal text-white text-sm font-medium rounded-lg hover:bg-deep-sea transition-colors"
          >
            Add Property
          </Link>
        </div>
      </div>
    );
  }

  const propertyId = properties[0].id;

  // Fetch rates for 90 days
  const ratesRes = await supabase
    .from("calendar_rates")
    .select("date, base_rate, suggested_rate, applied_rate, rate_source, factors, is_available, min_stay")
    .eq("property_id", propertyId)
    .is("channel_code", null)
    .gte("date", today)
    .lte("date", endStr)
    .order("date");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rates = (ratesRes.data ?? []) as any[];

  // Fetch comps
  const compsRes = await supabase
    .from("market_comps")
    .select("comp_name, comp_adr, comp_occupancy, comp_revpar, comp_bedrooms, distance_km, photo_url")
    .eq("property_id", propertyId)
    .order("comp_adr", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comps = (compsRes.data ?? []) as any[];

  // Fetch latest market snapshot
  const snapRes = await supabase
    .from("market_snapshots")
    .select("market_adr, market_occupancy, market_revpar, market_supply, market_demand_score")
    .eq("property_id", propertyId)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = ((snapRes.data ?? []) as any[])[0] ?? null;

  return (
    <PricingDashboard
      properties={properties}
      initialPropertyId={propertyId}
      rates={rates}
      comps={comps}
      snapshot={snapshot}
    />
  );
}
