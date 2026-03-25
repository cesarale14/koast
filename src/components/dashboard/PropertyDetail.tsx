"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import CalendarGrid from "@/components/calendar/CalendarGrid";

interface PropertyDetailProps {
  property: {
    id: string; name: string; address: string | null; city: string | null;
    state: string | null; zip: string | null; bedrooms: number | null;
    bathrooms: number | null; max_guests: number | null; property_type: string | null;
    channex_property_id: string | null;
  };
  listings: {
    id: string; platform: string; platform_listing_id: string | null;
    listing_url: string | null; status: string | null;
  }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allBookings: any[];
  stats: { occupancy: number; revenue: number; adr: number; totalBookings: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarBookings: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarRates: any[];
}

const tabs = ["Overview", "Calendar", "Bookings", "Settings"];

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb", vrbo: "VRBO", booking_com: "Booking.com", direct: "Direct",
};
const platformBadgeColors: Record<string, string> = {
  airbnb: "bg-red-50 text-red-700", vrbo: "bg-indigo-50 text-indigo-700",
  booking_com: "bg-blue-50 text-blue-700", direct: "bg-emerald-50 text-emerald-700",
};
const typeLabels: Record<string, string> = {
  entire_home: "Entire Home", private_room: "Private Room", shared_room: "Shared Room",
};

export default function PropertyDetail({
  property, listings, allBookings, stats, calendarBookings, calendarRates,
}: PropertyDetailProps) {
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [editForm, setEditForm] = useState({
    name: property.name,
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    zip: property.zip ?? "",
    bedrooms: property.bedrooms?.toString() ?? "",
    bathrooms: property.bathrooms?.toString() ?? "",
    max_guests: property.max_guests?.toString() ?? "",
    property_type: property.property_type ?? "entire_home",
  });

  const handleSaveSettings = async () => {
    setSaving(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from("properties") as any;
    const { error } = await table
      .update({
        name: editForm.name,
        address: editForm.address || null,
        city: editForm.city || null,
        state: editForm.state || null,
        zip: editForm.zip || null,
        bedrooms: editForm.bedrooms ? parseInt(editForm.bedrooms) : null,
        bathrooms: editForm.bathrooms ? parseFloat(editForm.bathrooms) : null,
        max_guests: editForm.max_guests ? parseInt(editForm.max_guests) : null,
        property_type: editForm.property_type,
      })
      .eq("id", property.id);

    setSaving(false);
    if (error) {
      toast("Failed to update property", "error");
    } else {
      toast("Property updated successfully!");
      setEditing(false);
    }
  };

  const statusColors: Record<string, string> = {
    confirmed: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    cancelled: "bg-red-50 text-red-700",
    completed: "bg-gray-100 text-gray-600",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/properties" className="text-sm text-gray-400 hover:text-gray-600">Properties</Link>
            <span className="text-gray-300">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
          {(property.city || property.state) && (
            <p className="text-gray-500 mt-0.5">
              {[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Occupancy", value: `${stats.occupancy}%`, sub: "This month" },
          { label: "ADR", value: stats.adr > 0 ? `$${stats.adr}` : "—", sub: "This month" },
          { label: "Revenue", value: stats.revenue > 0 ? `$${stats.revenue.toLocaleString()}` : "$0", sub: "This month" },
          { label: "Total Bookings", value: stats.totalBookings.toString(), sub: "All time" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Property Info</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-900 font-medium">{typeLabels[property.property_type ?? ""] ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bedrooms</span>
                <span className="text-gray-900 font-medium">{property.bedrooms ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bathrooms</span>
                <span className="text-gray-900 font-medium">{property.bathrooms ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Guests</span>
                <span className="text-gray-900 font-medium">{property.max_guests ?? "—"}</span>
              </div>
              {property.channex_property_id && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Channex ID</span>
                  <span className="text-gray-900 font-mono text-xs">{property.channex_property_id}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Connected Platforms</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-gray-400">No platforms connected yet.</p>
            ) : (
              <div className="space-y-3">
                {listings.map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${platformBadgeColors[l.platform] ?? "bg-gray-100 text-gray-600"}`}>
                        {platformLabels[l.platform] ?? l.platform}
                      </span>
                      {l.platform_listing_id && (
                        <span className="text-xs text-gray-400 font-mono">{l.platform_listing_id}</span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${l.status === "active" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>
                      {l.status ?? "active"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Calendar" && (
        <CalendarGrid
          properties={[{ id: property.id, name: property.name }]}
          bookings={calendarBookings}
          rates={calendarRates}
          totalDays={60}
        />
      )}

      {tab === "Bookings" && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="grid grid-cols-7 text-xs font-medium text-gray-400 uppercase tracking-wider">
              <span>Guest</span>
              <span>Platform</span>
              <span>Check-in</span>
              <span>Check-out</span>
              <span>Nights</span>
              <span>Total</span>
              <span>Status</span>
            </div>
          </div>
          {allBookings.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No bookings yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {allBookings.map((b: {
                id: string; guest_name: string | null; platform: string;
                check_in: string; check_out: string; total_price: number | null; status: string;
              }) => {
                const nights = Math.round(
                  (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
                );
                return (
                  <div key={b.id} className="px-6 py-3 grid grid-cols-7 items-center text-sm">
                    <span className="font-medium text-gray-900">{b.guest_name ?? "—"}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${platformBadgeColors[b.platform] ?? "bg-gray-100 text-gray-600"}`}>
                      {platformLabels[b.platform] ?? b.platform}
                    </span>
                    <span className="text-gray-600">
                      {new Date(b.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-gray-600">
                      {new Date(b.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-gray-600">{nights}</span>
                    <span className="text-gray-900 font-medium">
                      {b.total_price != null ? `$${b.total_price.toLocaleString()}` : "—"}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${statusColors[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {b.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "Settings" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Property Settings</h2>
            {!editing && (
              <button onClick={() => setEditing(true)}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input type="text" value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                  <input type="text" value={editForm.zip}
                    onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                  <input type="number" value={editForm.bedrooms}
                    onChange={(e) => setEditForm({ ...editForm, bedrooms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                  <input type="number" value={editForm.bathrooms}
                    onChange={(e) => setEditForm({ ...editForm, bathrooms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" min="0" step="0.5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                  <input type="number" value={editForm.max_guests}
                    onChange={(e) => setEditForm({ ...editForm, max_guests: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={editForm.property_type}
                    onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white">
                    <option value="entire_home">Entire Home</option>
                    <option value="private_room">Private Room</option>
                    <option value="shared_room">Shared Room</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={handleSaveSettings} disabled={saving}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {[
                ["Name", property.name],
                ["Address", property.address],
                ["City", property.city],
                ["State", property.state],
                ["ZIP", property.zip],
                ["Bedrooms", property.bedrooms?.toString()],
                ["Bathrooms", property.bathrooms?.toString()],
                ["Max Guests", property.max_guests?.toString()],
                ["Type", typeLabels[property.property_type ?? ""]],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-900 font-medium">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
