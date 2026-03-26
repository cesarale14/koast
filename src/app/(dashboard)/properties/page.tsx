import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PropertiesPage() {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  const propertiesRes = await supabase
    .from("properties")
    .select("id, name, address, city, state, property_type, bedrooms, bathrooms, max_guests, channex_property_id")
    .order("name");
  const properties = (propertiesRes.data ?? []) as {
    id: string; name: string; address: string | null; city: string | null;
    state: string | null; property_type: string | null; bedrooms: number | null;
    bathrooms: number | null; max_guests: number | null; channex_property_id: string | null;
  }[];

  if (properties.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Properties</h1>
            <p className="text-gray-500">Manage your vacation rental properties</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No properties yet</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add your first property to start managing bookings, availability, and pricing.
          </p>
          <Link
            href="/properties/new"
            className="inline-flex px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Your First Property
          </Link>
        </div>
      </div>
    );
  }

  // Fetch listings and bookings for all properties
  const propertyIds = properties.map((p) => p.id);

  const listingsRes = await supabase
    .from("listings")
    .select("property_id, platform, status")
    .in("property_id", propertyIds);
  const listings = (listingsRes.data ?? []) as { property_id: string; platform: string; status: string | null }[];

  const bookingsRes = await supabase
    .from("bookings")
    .select("property_id, check_in, check_out")
    .in("property_id", propertyIds)
    .gte("check_out", monthStart)
    .lte("check_in", monthEnd)
    .in("status", ["confirmed", "completed"]);
  const monthBookings = (bookingsRes.data ?? []) as { property_id: string; check_in: string; check_out: string }[];

  const upcomingRes = await supabase
    .from("bookings")
    .select("property_id, check_in, guest_name")
    .in("property_id", propertyIds)
    .gte("check_in", today)
    .in("status", ["confirmed"])
    .order("check_in")
    .limit(100);
  const upcomingBookings = (upcomingRes.data ?? []) as { property_id: string; check_in: string; guest_name: string | null }[];

  // Build lookup maps
  const listingsByProp = new Map<string, string[]>();
  for (const l of listings) {
    if (!listingsByProp.has(l.property_id)) listingsByProp.set(l.property_id, []);
    listingsByProp.get(l.property_id)!.push(l.platform);
  }

  const occupancyByProp = new Map<string, number>();
  for (const propId of propertyIds) {
    const propBookings = monthBookings.filter((b) => b.property_id === propId);
    let nights = 0;
    for (const b of propBookings) {
      const ci = new Date(b.check_in);
      const co = new Date(b.check_out);
      const ms = Math.max(ci.getTime(), new Date(monthStart).getTime());
      const me = Math.min(co.getTime(), new Date(monthEnd).getTime() + 86400000);
      nights += Math.max(0, Math.ceil((me - ms) / 86400000));
    }
    occupancyByProp.set(propId, Math.round((nights / daysInMonth) * 100));
  }

  const nextCheckinByProp = new Map<string, { date: string; guest: string | null }>();
  for (const b of upcomingBookings) {
    if (!nextCheckinByProp.has(b.property_id)) {
      nextCheckinByProp.set(b.property_id, { date: b.check_in, guest: b.guest_name });
    }
  }

  const platformBadgeColors: Record<string, string> = {
    airbnb: "bg-red-50 text-red-700",
    vrbo: "bg-indigo-50 text-indigo-700",
    booking_com: "bg-blue-50 text-blue-700",
    direct: "bg-emerald-50 text-emerald-700",
  };

  const platformLabels: Record<string, string> = {
    airbnb: "Airbnb",
    vrbo: "VRBO",
    booking_com: "Booking",
    direct: "Direct",
  };

  const typeLabels: Record<string, string> = {
    entire_home: "Entire Home",
    private_room: "Private Room",
    shared_room: "Shared Room",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Properties</h1>
          <p className="text-gray-500">{properties.length} propert{properties.length === 1 ? "y" : "ies"}</p>
        </div>
        <Link
          href="/properties/new"
          className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Property
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {properties.map((prop) => {
          const platforms = listingsByProp.get(prop.id) ?? [];
          const occupancy = occupancyByProp.get(prop.id) ?? 0;
          const nextCheckin = nextCheckinByProp.get(prop.id);

          return (
            <Link
              key={prop.id}
              href={`/properties/${prop.id}`}
              className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all group"
            >
              {/* Photo placeholder */}
              <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-50 rounded-t-xl flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>

              <div className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {prop.name}
                </h3>
                {(prop.city || prop.state) && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[prop.city, prop.state].filter(Boolean).join(", ")}
                  </p>
                )}

                {/* Property type + specs */}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  {prop.property_type && (
                    <span>{typeLabels[prop.property_type] ?? prop.property_type}</span>
                  )}
                  {prop.bedrooms != null && <span>{prop.bedrooms} bed</span>}
                  {prop.bathrooms != null && <span>{prop.bathrooms} bath</span>}
                  {prop.max_guests != null && <span>{prop.max_guests} guests</span>}
                </div>

                {/* Platform badges */}
                {platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {platforms.map((p) => (
                      <span
                        key={p}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${platformBadgeColors[p] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {platformLabels[p] ?? p}
                      </span>
                    ))}
                  </div>
                )}

                {/* Connection badge */}
                <div className="mt-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    prop.channex_property_id ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {prop.channex_property_id ? "Channex" : "iCal"}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400">Occupancy</p>
                    <p className="text-sm font-semibold text-gray-900">{occupancy}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Next check-in</p>
                    <p className="text-sm font-medium text-gray-700">
                      {nextCheckin
                        ? new Date(nextCheckin.date + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
