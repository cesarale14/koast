import { createClient } from "@/lib/supabase/server";
import CompSetsClient from "./CompSetsClient";
import EmptyState from "@/components/ui/EmptyState";
import { GitCompare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompSetsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: props } = await supabase
    .from("properties")
    .select("id, name, cover_photo_url, latitude, longitude, bedrooms, bathrooms")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (props ?? []) as any[];

  if (properties.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Comp Sets</h1>
        <p className="text-sm text-neutral-500 mb-8">Your competitive set analysis</p>
        <EmptyState
          icon={GitCompare}
          title="No competitive set"
          description="Run a market analysis to build your competitive set of similar properties."
          action={{ label: "Market Intel", href: "/market-explorer" }}
        />
      </div>
    );
  }

  const propertyId = properties[0].id;
  const { data: comps } = await supabase
    .from("market_comps")
    .select("comp_listing_id, comp_name, comp_bedrooms, comp_adr, comp_occupancy, comp_revpar, distance_km, photo_url, latitude, longitude")
    .eq("property_id", propertyId)
    .order("comp_adr", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compData = (comps ?? []) as any[];

  // Get property's own stats
  const today = new Date().toISOString().split("T")[0];
  const { data: rates } = await supabase
    .from("calendar_rates")
    .select("applied_rate, suggested_rate, base_rate")
    .eq("property_id", propertyId)
    .gte("date", today)
    .not("applied_rate", "is", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rateRows = (rates ?? []) as any[];
  const avgRate = rateRows.length > 0
    ? Math.round(rateRows.reduce((s: number, r: { applied_rate: number }) => s + (r.applied_rate ?? 0), 0) / rateRows.length)
    : 0;

  return (
    <CompSetsClient
      properties={properties}
      initialPropertyId={propertyId}
      initialComps={compData}
      propertyAvgRate={avgRate}
    />
  );
}
