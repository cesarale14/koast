import { createClient } from "@/lib/supabase/server";
import NearbyListingsClient from "./NearbyListingsClient";

export const dynamic = "force-dynamic";

export default async function NearbyListingsPage() {
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
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Nearby Listings</h1>
        <p className="text-sm text-neutral-500 mb-8">Discover comparable properties in your market</p>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <p className="text-neutral-400">Add a property first to see nearby listings.</p>
        </div>
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

  return (
    <NearbyListingsClient
      properties={properties}
      initialPropertyId={propertyId}
      initialComps={compData}
      propertyLat={properties[0].latitude ? parseFloat(properties[0].latitude) : null}
      propertyLng={properties[0].longitude ? parseFloat(properties[0].longitude) : null}
    />
  );
}
