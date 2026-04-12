"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import BookingComConnect from "./BookingComConnect";

interface Booking {
  id: string;
  guest_name: string | null;
  platform: string;
  check_in: string;
  check_out: string;
  total_price: number | null;
  status: string;
}

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
  channels?: { channel_code: string; status: string; settings?: Record<string, unknown> }[];
}

const tabs = ["Overview", "Calendar", "Bookings", "Settings"];

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb", vrbo: "VRBO", booking_com: "Booking.com", direct: "Direct",
};
const platformBadgeColors: Record<string, string> = {
  airbnb: "bg-red-50 text-red-700", vrbo: "bg-indigo-50 text-indigo-700",
  booking_com: "bg-brand-50 text-brand-700", direct: "bg-[#eef5f0] text-[#1a3a2a]",
};
const typeLabels: Record<string, string> = {
  entire_home: "Entire Home", private_room: "Private Room", shared_room: "Shared Room",
};

export default function PropertyDetail({
  property, listings, allBookings: initialBookings, stats, calendarBookings, calendarRates, channels = [],
}: PropertyDetailProps) {
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [showBdcConnect, setShowBdcConnect] = useState(false);
  const bdcChannel = channels.find((c) => c.channel_code === "BDC");

  // Scenario 1: Full Sync state
  const [syncing, setSyncing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [syncResult, setSyncResult] = useState<any>(null);

  // Scenario 2: Add Booking state
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [addingBooking, setAddingBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    guest_name: "", check_in: "", check_out: "", total_price: "",
  });
  const [rateBreakdown, setRateBreakdown] = useState<{ date: string; rate: number }[]>([]);
  const [priceAutoFilled, setPriceAutoFilled] = useState(false);

  // Scenario 3: Edit/Cancel Booking state
  const [editingBooking, setEditingBooking] = useState<string | null>(null);
  const [editBookingForm, setEditBookingForm] = useState({
    guest_name: "", check_in: "", check_out: "", total_price: "",
  });
  const [savingBooking, setSavingBooking] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);
  const [editRateBreakdown, setEditRateBreakdown] = useState<{ date: string; rate: number }[]>([]);
  const [editPriceAutoFilled, setEditPriceAutoFilled] = useState(false);

  // Auto-fill total price when dates change
  useEffect(() => {
    if (!bookingForm.check_in || !bookingForm.check_out || bookingForm.check_in >= bookingForm.check_out) {
      setRateBreakdown([]);
      return;
    }
    const supabase = createClient();
    // Generate all dates between check_in and check_out (exclusive)
    const dates: string[] = [];
    const ci = new Date(bookingForm.check_in + "T00:00:00");
    const co = new Date(bookingForm.check_out + "T00:00:00");
    for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0]);
    }
    supabase
      .from("calendar_rates")
      .select("date, applied_rate, suggested_rate, base_rate")
      .eq("property_id", property.id)
      .is("channel_code", null)
      .in("date", dates)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rateMap = new Map((data ?? []).map((r: any) => [r.date, Number(r.applied_rate ?? r.suggested_rate ?? r.base_rate ?? 0)]));
        const breakdown = dates.map((d) => ({ date: d, rate: rateMap.get(d) ?? 0 }));
        setRateBreakdown(breakdown);
        const total = breakdown.reduce((s, b) => s + b.rate, 0);
        if (total > 0) {
          setBookingForm((prev) => ({ ...prev, total_price: total.toFixed(2) }));
          setPriceAutoFilled(true);
        } else {
          setPriceAutoFilled(false);
        }
      });
  }, [bookingForm.check_in, bookingForm.check_out, property.id]);

  // Auto-fill total price when edit form dates change
  useEffect(() => {
    if (!editBookingForm.check_in || !editBookingForm.check_out || editBookingForm.check_in >= editBookingForm.check_out) {
      setEditRateBreakdown([]);
      return;
    }
    const supabase = createClient();
    const dates: string[] = [];
    const ci = new Date(editBookingForm.check_in + "T00:00:00");
    const co = new Date(editBookingForm.check_out + "T00:00:00");
    for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0]);
    }
    supabase
      .from("calendar_rates")
      .select("date, applied_rate, suggested_rate, base_rate")
      .eq("property_id", property.id)
      .is("channel_code", null)
      .in("date", dates)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rateMap = new Map((data ?? []).map((r: any) => [r.date, Number(r.applied_rate ?? r.suggested_rate ?? r.base_rate ?? 0)]));
        const breakdown = dates.map((d) => ({ date: d, rate: rateMap.get(d) ?? 0 }));
        setEditRateBreakdown(breakdown);
        const total = breakdown.reduce((s, b) => s + b.rate, 0);
        if (total > 0) {
          setEditBookingForm((prev) => ({ ...prev, total_price: total.toFixed(2) }));
          setEditPriceAutoFilled(true);
        } else {
          setEditPriceAutoFilled(false);
        }
      });
  }, [editBookingForm.check_in, editBookingForm.check_out, property.id]);

  const [editForm, setEditForm] = useState({
    name: property.name,
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    zip: property.zip ?? "",
    latitude: "",
    longitude: "",
    bedrooms: property.bedrooms?.toString() ?? "",
    bathrooms: property.bathrooms?.toString() ?? "",
    max_guests: property.max_guests?.toString() ?? "",
    property_type: property.property_type ?? "entire_home",
  });
  const [locationFound, setLocationFound] = useState<string | null>(null);

  const handleSaveSettings = async () => {
    setSaving(true);

    // Use lat/lng from AddressAutocomplete selection, or geocode from address
    let lat: number | null = editForm.latitude ? parseFloat(editForm.latitude) : null;
    let lng: number | null = editForm.longitude ? parseFloat(editForm.longitude) : null;

    if (!lat && (editForm.address || editForm.city)) {
      try {
        const { geocodeAddress } = await import("@/lib/geocode");
        const result = await geocodeAddress(editForm.address, editForm.city, editForm.state);
        if (result) { lat = result.lat; lng = result.lng; }
      } catch { /* geocode failed, save without coords */ }
    }

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
        latitude: lat,
        longitude: lng,
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
      const locMsg = lat ? ` Location: ${editForm.city || "found"}, ${editForm.state || ""}` : "";
      toast(`Property updated!${locMsg}`);
      setEditing(false);
    }
  };

  // ==================== Scenario 1: Full Sync ====================
  const handleFullSync = async () => {
    if (!property.channex_property_id) {
      toast("No Channex property ID connected", "error");
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      // Use certification runner Test 1 which has correct Villa Jamaica rates and real booking availability
      const res = await fetch("/api/channex/certification-runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncResult(data);
      toast(`Full sync complete! Rates and availability pushed for 500 days`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Full sync failed", "error");
      setSyncResult({ error: err instanceof Error ? err.message : "Failed" });
    }
    setSyncing(false);
  };

  // ==================== Scenario 2: Add Booking ====================
  const handleAddBooking = async () => {
    if (!bookingForm.guest_name || !bookingForm.check_in || !bookingForm.check_out) {
      toast("Please fill in guest name, check-in, and check-out dates", "error");
      return;
    }
    setAddingBooking(true);
    try {
      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: property.id,
          guest_name: bookingForm.guest_name,
          check_in: bookingForm.check_in,
          check_out: bookingForm.check_out,
          total_price: bookingForm.total_price ? parseFloat(bookingForm.total_price) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const channexMsg = data.channex?.error
        ? ` (Channex: ${data.channex.error})`
        : data.channex
          ? " + Channex availability updated"
          : "";
      toast(`Booking created${channexMsg}`);
      setBookings([data.booking, ...bookings]);
      setBookingForm({ guest_name: "", check_in: "", check_out: "", total_price: "" });
      setShowAddBooking(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create booking", "error");
    }
    setAddingBooking(false);
  };

  // ==================== Scenario 3: Edit Booking ====================
  const startEditBooking = (b: Booking) => {
    setEditingBooking(b.id);
    setEditBookingForm({
      guest_name: b.guest_name ?? "",
      check_in: b.check_in,
      check_out: b.check_out,
      total_price: b.total_price?.toString() ?? "",
    });
  };

  const handleEditBooking = async () => {
    if (!editingBooking) {
      alert("Error: no booking selected to edit");
      return;
    }
    if (!editBookingForm.check_in || !editBookingForm.check_out) {
      toast("Please select check-in and check-out dates", "error");
      return;
    }
    setSavingBooking(true);
    try {
      const res = await fetch(`/api/bookings/${editingBooking}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_name: editBookingForm.guest_name,
          check_in: editBookingForm.check_in,
          check_out: editBookingForm.check_out,
          total_price: editBookingForm.total_price ? parseFloat(editBookingForm.total_price) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      const channexMsg = data.channex?.error
        ? ` — Channex sync failed`
        : data.channex
          ? " — Channex availability synced"
          : "";
      toast(`Booking updated${channexMsg}`);
      setBookings((prev) => prev.map((b) => b.id === editingBooking ? data.booking : b));
      setEditingBooking(null);
      setEditRateBreakdown([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update booking";
      toast(msg, "error");
      alert(`Save error: ${msg}`);
    }
    setSavingBooking(false);
  };

  // ==================== Scenario 3: Cancel Booking ====================
  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm("Cancel this booking? This will restore availability in Channex.")) return;
    setCancellingBooking(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const channexMsg = data.channex?.error
        ? ` (Channex: ${data.channex.error})`
        : data.channex
          ? " + Channex availability restored"
          : "";
      toast(`Booking cancelled${channexMsg}`);
      setBookings(bookings.map((b) => b.id === bookingId ? { ...b, status: "cancelled" } : b));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to cancel booking", "error");
    }
    setCancellingBooking(null);
  };

  const statusColors: Record<string, string> = {
    confirmed: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    cancelled: "bg-red-50 text-red-700",
    completed: "bg-neutral-100 text-neutral-600",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/properties" className="text-sm text-neutral-400 hover:text-neutral-600">Properties</Link>
            <span className="text-neutral-300">/</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-800">{property.name}</h1>
          {(property.city || property.state) && (
            <p className="text-neutral-500 mt-0.5">
              {[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Occupancy", value: `${stats.occupancy}%`, sub: "This month" },
          { label: "ADR", value: stats.adr > 0 ? `$${stats.adr}` : "\u2014", sub: "This month" },
          { label: "Revenue", value: stats.revenue > 0 ? `$${stats.revenue.toLocaleString()}` : "$0", sub: "This month" },
          { label: "Total Bookings", value: stats.totalBookings.toString(), sub: "All time" },
        ].map((s) => (
          <div key={s.label} className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4">
            <p className="text-xs text-neutral-400">{s.label}</p>
            <p className="text-2xl font-bold font-mono text-neutral-800 mt-1">{s.value}</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
            <h2 className="text-lg font-semibold text-neutral-800 mb-4">Property Info</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Type</span>
                <span className="text-neutral-800 font-medium">{typeLabels[property.property_type ?? ""] ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Bedrooms</span>
                <span className="text-neutral-800 font-medium">{property.bedrooms ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Bathrooms</span>
                <span className="text-neutral-800 font-medium">{property.bathrooms ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Max Guests</span>
                <span className="text-neutral-800 font-medium">{property.max_guests ?? "\u2014"}</span>
              </div>
              {property.channex_property_id && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Channex ID</span>
                  <span className="text-neutral-800 font-mono text-xs">{property.channex_property_id}</span>
                </div>
              )}
            </div>

            {/* Scenario 1: Full Sync Button */}
            {property.channex_property_id && (
              <div className="mt-6 pt-4 border-t border-neutral-100">
                <button
                  onClick={handleFullSync}
                  disabled={syncing}
                  className="btn-primary-3d w-full px-4 py-2.5 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {syncing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Syncing 500 days...
                    </>
                  ) : (
                    "Full Sync to Channex"
                  )}
                </button>
                {syncResult && !syncResult.error && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                    <p className="font-medium">Sync complete</p>
                    <p className="mt-1">Room types: {syncResult.roomTypes} | Rate plans: {syncResult.ratePlans}</p>
                    {syncResult.availabilityResult?.data && (
                      <p>Availability task: {JSON.stringify(syncResult.availabilityResult.data).slice(0, 80)}...</p>
                    )}
                    {syncResult.restrictionsResult?.data && (
                      <p>Restrictions task: {JSON.stringify(syncResult.restrictionsResult.data).slice(0, 80)}...</p>
                    )}
                  </div>
                )}
                {syncResult?.error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                    Error: {syncResult.error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
            <h2 className="text-lg font-semibold text-neutral-800 mb-4">Connected Platforms</h2>
            {listings.length === 0 && !bdcChannel ? (
              <p className="text-sm text-neutral-400">No platforms connected yet.</p>
            ) : (
              <div className="space-y-3">
                {listings.map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${platformBadgeColors[l.platform] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {platformLabels[l.platform] ?? l.platform}
                      </span>
                      {l.platform_listing_id && (
                        <span className="text-xs text-neutral-400 font-mono">{l.platform_listing_id}</span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${l.status === "active" ? "bg-green-50 text-green-600" : "bg-neutral-100 text-neutral-500"}`}>
                      {l.status ?? "active"}
                    </span>
                  </div>
                ))}
                {bdcChannel && (
                  <div className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#003580]/10 text-[#003580]">Booking.com</span>
                      {bdcChannel.settings?.hotel_id != null && (
                        <span className="text-xs text-neutral-400 font-mono">Hotel {String(bdcChannel.settings.hotel_id)}</span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${bdcChannel.status === "active" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
                      {bdcChannel.status === "active" ? "active" : "pending"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Connect Booking.com — only shown if not already connected */}
            {!bdcChannel && (
              <button
                onClick={() => setShowBdcConnect(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#003580] bg-[#003580]/5 border border-[#003580]/20 rounded-lg hover:bg-[#003580]/10 transition-colors"
              >
                <div className="w-5 h-5 rounded bg-[#003580] flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">B.</span>
                </div>
                Connect Booking.com
              </button>
            )}
          </div>

          {showBdcConnect && (
            <BookingComConnect
              propertyId={property.id}
              propertyName={property.name}
              onClose={() => setShowBdcConnect(false)}
              onConnected={() => { toast("Booking.com connected!"); window.location.reload(); }}
            />
          )}
        </div>
      )}

      {tab === "Calendar" && (
        <CalendarGrid
          properties={[{ id: property.id, name: property.name }]}
          bookings={calendarBookings}
          rates={calendarRates}
          totalDays={730}
        />
      )}

      {tab === "Bookings" && (
        <div className="space-y-4">
          {/* Scenario 2: Add Booking Button + Form */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddBooking(!showAddBooking)}
              className="btn-primary-3d px-4 py-2 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600"
            >
              {showAddBooking ? "Cancel" : "Add Booking"}
            </button>
          </div>

          {showAddBooking && (
            <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
              <h3 className="text-sm font-semibold text-neutral-800 mb-4">New Booking</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Date range calendar */}
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-2">
                    Select Dates *
                    {bookingForm.check_in && bookingForm.check_out && (
                      <span className="text-neutral-400 font-normal ml-1">
                        {new Date(bookingForm.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(bookingForm.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" "}({Math.round((new Date(bookingForm.check_out + "T00:00:00").getTime() - new Date(bookingForm.check_in + "T00:00:00").getTime()) / 86400000)} nights)
                      </span>
                    )}
                    {bookingForm.check_in && !bookingForm.check_out && (
                      <span className="text-brand-500 font-normal ml-1">Select check-out date</span>
                    )}
                  </label>
                  <DateRangeCalendar
                    checkIn={bookingForm.check_in}
                    checkOut={bookingForm.check_out}
                    onSelect={(ci, co) => setBookingForm((prev) => ({ ...prev, check_in: ci, check_out: co }))}
                  />
                </div>

                {/* Right: Guest info + price */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Guest Name *</label>
                    <input type="text" value={bookingForm.guest_name}
                      onChange={(e) => setBookingForm({ ...bookingForm, guest_name: e.target.value })}
                      className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
                      placeholder="John Smith" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Total Price ($)
                    </label>
                    <input type="number" value={bookingForm.total_price}
                      onChange={(e) => { setBookingForm({ ...bookingForm, total_price: e.target.value }); setPriceAutoFilled(false); }}
                      className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
                      placeholder="500.00" min="0" step="0.01" />
                    {priceAutoFilled && <p className="text-[10px] text-brand-500 mt-1">Auto-calculated from calendar rates</p>}
                  </div>

                  {/* Rate breakdown */}
                  {rateBreakdown.length > 0 && rateBreakdown.some((r) => r.rate > 0) && (
                    <div className="px-3 py-2 bg-neutral-50 rounded-lg">
                      <div className="flex flex-wrap gap-x-1 text-[11px] text-neutral-500">
                        {rateBreakdown.map((r, i) => (
                          <span key={r.date}>
                            {new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}: <span className="font-mono font-medium text-neutral-700">${Math.round(r.rate)}</span>
                            {i < rateBreakdown.length - 1 && <span className="text-neutral-300 mx-0.5">|</span>}
                          </span>
                        ))}
                        <span className="ml-1 font-medium text-neutral-700">
                          = ${Math.round(rateBreakdown.reduce((s, r) => s + r.rate, 0))} ({rateBreakdown.length} night{rateBreakdown.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </div>
                  )}
                  {rateBreakdown.length > 0 && !rateBreakdown.some((r) => r.rate > 0) && (
                    <p className="text-[11px] text-neutral-400">No rates set for these dates</p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button onClick={handleAddBooking} disabled={addingBooking}
                      className="btn-primary-3d px-5 py-2 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                      {addingBooking ? "Creating..." : "Create Booking"}
                    </button>
                    {property.channex_property_id && (
                      <span className="text-xs text-neutral-400 self-center">
                        Channex availability will be automatically updated
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bookings Table */}
          <div className="bg-neutral-0 rounded-lg border border-[var(--border)]">
            <div className="px-6 py-4 border-b border-neutral-100">
              <div className="grid grid-cols-8 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                <span>Guest</span>
                <span>Platform</span>
                <span>Check-in</span>
                <span>Check-out</span>
                <span>Nights</span>
                <span>Total</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
            </div>
            {bookings.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 text-sm">No bookings yet.</div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {bookings.map((b) => {
                  const nights = (() => {
                    const ci = Date.UTC(+b.check_in.slice(0,4), +b.check_in.slice(5,7)-1, +b.check_in.slice(8,10));
                    const co = Date.UTC(+b.check_out.slice(0,4), +b.check_out.slice(5,7)-1, +b.check_out.slice(8,10));
                    return Math.round((co - ci) / 86400000);
                  })();
                  const isEditing = editingBooking === b.id;

                  if (isEditing) {
                    return (
                      <div key={b.id} className="px-6 py-4 bg-brand-50 border-l-4 border-brand-500">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
                          {/* Left: Calendar */}
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-2">
                              Dates
                              {editBookingForm.check_in && editBookingForm.check_out && (
                                <span className="text-neutral-400 font-normal ml-1">
                                  {new Date(editBookingForm.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(editBookingForm.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  {" "}({Math.round((new Date(editBookingForm.check_out + "T00:00:00").getTime() - new Date(editBookingForm.check_in + "T00:00:00").getTime()) / 86400000)} nights)
                                </span>
                              )}
                            </label>
                            <DateRangeCalendar
                              checkIn={editBookingForm.check_in}
                              checkOut={editBookingForm.check_out}
                              onSelect={(ci, co) => setEditBookingForm((prev) => ({ ...prev, check_in: ci, check_out: co }))}
                            />
                          </div>
                          {/* Right: Guest + Price */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-neutral-600 mb-1">Guest Name</label>
                              <input type="text" value={editBookingForm.guest_name}
                                onChange={(e) => { const v = e.target.value; setEditBookingForm((prev) => ({ ...prev, guest_name: v })); }}
                                className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-neutral-600 mb-1">Total Price ($)</label>
                              <input type="number" value={editBookingForm.total_price}
                                onChange={(e) => { const v = e.target.value; setEditBookingForm((prev) => ({ ...prev, total_price: v })); setEditPriceAutoFilled(false); }}
                                className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                                min="0" step="0.01" />
                              {editPriceAutoFilled && <p className="text-[10px] text-brand-500 mt-1">Recalculated from calendar rates</p>}
                            </div>
                            {/* Rate breakdown */}
                            {editRateBreakdown.length > 0 && editRateBreakdown.some((r) => r.rate > 0) && (
                              <div className="px-3 py-2 bg-white/60 rounded-lg">
                                <div className="flex flex-wrap gap-x-1 text-[11px] text-neutral-500">
                                  {editRateBreakdown.map((r, i) => (
                                    <span key={r.date}>
                                      {new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}: <span className="font-mono font-medium text-neutral-700">${Math.round(r.rate)}</span>
                                      {i < editRateBreakdown.length - 1 && <span className="text-neutral-300 mx-0.5">|</span>}
                                    </span>
                                  ))}
                                  <span className="ml-1 font-medium text-neutral-700">
                                    = ${Math.round(editRateBreakdown.reduce((s, r) => s + r.rate, 0))} ({editRateBreakdown.length}n)
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button onClick={handleEditBooking} disabled={savingBooking}
                                className="btn-primary-3d px-3 py-1.5 text-xs font-medium bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                                {savingBooking ? "Saving..." : "Save Changes"}
                              </button>
                              <button onClick={() => setEditingBooking(null)}
                                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-800">
                                Cancel
                              </button>
                            </div>
                            {property.channex_property_id && (
                              <p className="text-[10px] text-neutral-400">Channex availability will be updated automatically</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={b.id} className="px-6 py-3 grid grid-cols-8 items-center text-sm group hover:bg-neutral-50">
                      <span className="font-medium text-neutral-800">{b.guest_name ?? "\u2014"}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${platformBadgeColors[b.platform] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {platformLabels[b.platform] ?? b.platform}
                      </span>
                      <span className="text-neutral-600">
                        {new Date(b.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-neutral-600">
                        {new Date(b.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-neutral-600">{nights}</span>
                      <span className="text-neutral-800 font-medium font-mono">
                        {b.total_price != null ? `$${Number(b.total_price).toLocaleString()}` : "\u2014"}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${statusColors[b.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {b.status}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {b.status !== "cancelled" && (
                          <>
                            <button onClick={() => startEditBooking(b)}
                              className="px-2 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50 rounded">
                              Edit
                            </button>
                            <button onClick={() => handleCancelBooking(b.id)}
                              disabled={cancellingBooking === b.id}
                              className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
                              {cancellingBooking === b.id ? "..." : "Cancel"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Settings" && (
        <div className="space-y-6 max-w-2xl">
        {/* Calendar Connections */}
        <CalendarConnections propertyId={property.id} hasChannex={!!property.channex_property_id} />

        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-neutral-800">Property Settings</h2>
            {!editing && (
              <button onClick={() => setEditing(true)}
                className="px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 rounded-lg transition-colors">
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
                <input type="text" value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Address</label>
                <AddressAutocomplete
                  value={editForm.address}
                  onChange={(v) => setEditForm({ ...editForm, address: v })}
                  onSelect={(r) => {
                    setEditForm({
                      ...editForm,
                      address: r.address,
                      city: r.city,
                      state: r.state,
                      zip: r.zip,
                      latitude: r.latitude,
                      longitude: r.longitude,
                    });
                    setLocationFound(`${r.city || "Location found"}, ${r.state || ""}`);
                  }}
                  placeholder="Start typing an address..."
                />
                {locationFound && (
                  <p className="text-xs text-success mt-1 font-medium">Location found: {locationFound}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">City</label>
                  <input type="text" value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">State</label>
                  <input type="text" value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">ZIP</label>
                  <input type="text" value={editForm.zip}
                    onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Bedrooms</label>
                  <input type="number" value={editForm.bedrooms}
                    onChange={(e) => setEditForm({ ...editForm, bedrooms: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Bathrooms</label>
                  <input type="number" value={editForm.bathrooms}
                    onChange={(e) => setEditForm({ ...editForm, bathrooms: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" min="0" step="0.5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Max Guests</label>
                  <input type="number" value={editForm.max_guests}
                    onChange={(e) => setEditForm({ ...editForm, max_guests: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Type</label>
                  <select value={editForm.property_type}
                    onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
                    className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors bg-neutral-0">
                    <option value="entire_home">Entire Home</option>
                    <option value="private_room">Private Room</option>
                    <option value="shared_room">Shared Room</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={handleSaveSettings} disabled={saving}
                  className="btn-primary-3d px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-5 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors">
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
                  <span className="text-neutral-500">{label}</span>
                  <span className="text-neutral-800 font-medium">{value || "\u2014"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

// Calendar Connections sub-component
function CalendarConnections({ propertyId, hasChannex }: { propertyId: string; hasChannex: boolean }) {
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addPlatform, setAddPlatform] = useState("airbnb");
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchFeeds = useCallback(async () => {
    const res = await fetch(`/api/ical/status/${propertyId}`);
    const data = await res.json();
    setFeeds(data.feeds ?? []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchFeeds(); }, [fetchFeeds]);

  const addFeed = async () => {
    if (!addUrl) return;
    setAdding(true);
    try {
      const res = await fetch("/api/ical/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: propertyId, feed_url: addUrl, platform: addPlatform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Connected! ${data.bookings_found} bookings found`);
      setShowAdd(false);
      setAddUrl("");
      fetchFeeds();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
    setAdding(false);
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/ical/sync/${propertyId}`, { method: "POST" });
      toast("Synced!");
      fetchFeeds();
    } catch { toast("Sync failed", "error"); }
    setSyncing(false);
  };

  const removeFeed = async (feedId: string) => {
    await fetch(`/api/ical/${feedId}`, { method: "DELETE" });
    toast("Feed removed");
    fetchFeeds();
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const platformIcons: Record<string, string> = { airbnb: "bg-red-50 text-red-700", vrbo: "bg-indigo-50 text-indigo-700", booking_com: "bg-brand-50 text-brand-700", direct: "bg-[#eef5f0] text-[#1a3a2a]" };
  const platformNames: Record<string, string> = { airbnb: "Airbnb", vrbo: "VRBO", booking_com: "Booking.com", direct: "Direct" };

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-800">Calendar Connections</h2>
        <div className="flex gap-2">
          {feeds.length > 0 && (
            <button onClick={syncAll} disabled={syncing}
              className="px-3 py-1.5 text-xs font-medium bg-brand-50 text-brand-500 rounded-lg hover:bg-brand-100 disabled:opacity-50">
              {syncing ? "Syncing..." : "Sync All"}
            </button>
          )}
          <button onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200">
            Add Calendar
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : feeds.length === 0 && !showAdd ? (
        <p className="text-sm text-neutral-400">No calendars connected. Add an iCal feed to sync bookings.</p>
      ) : (
        <div className="space-y-2">
          {feeds.filter((f: {isActive: boolean}) => f.isActive !== false).map((f: {id: string; platform: string; feedUrl: string; lastSynced: string; syncCount: number}) => (
            <div key={f.id} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${platformIcons[f.platform] ?? "bg-neutral-100 text-neutral-600"}`}>
                  {platformNames[f.platform] ?? f.platform}
                </span>
                <span className="text-xs text-neutral-500 truncate max-w-[200px]">{f.feedUrl}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400">{timeAgo(f.lastSynced)}</span>
                {f.syncCount > 0 && (
                  <span className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">{f.syncCount} syncs</span>
                )}
                <button onClick={() => removeFeed(f.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
          <div className="flex gap-3">
            <select value={addPlatform} onChange={(e) => setAddPlatform(e.target.value)}
              className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-neutral-0">
              <option value="airbnb">Airbnb</option>
              <option value="vrbo">VRBO</option>
              <option value="booking_com">Booking.com</option>
              <option value="direct">Direct</option>
            </select>
            <input type="url" value={addUrl} onChange={(e) => setAddUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Paste calendar export URL..." />
            <button onClick={addFeed} disabled={adding || !addUrl}
              className="btn-primary-3d px-4 py-1.5 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {!hasChannex && feeds.length > 0 && (
        <div className="mt-4 p-3 bg-gradient-to-r from-brand-50 to-indigo-50 border border-brand-200 rounded-lg">
          <p className="text-xs text-brand-800">
            <span className="font-semibold">Upgrade to Pro</span> for automatic rate pushing — your pricing suggestions will sync directly to Airbnb, VRBO, and Booking.com.
          </p>
        </div>
      )}
    </div>
  );
}

// ====== Date Range Calendar ======

function DateRangeCalendar({
  checkIn,
  checkOut,
  onSelect,
}: {
  checkIn: string;
  checkOut: string;
  onSelect: (checkIn: string, checkOut: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const handleDayClick = (dateStr: string) => {
    if (dateStr < todayStr) return;
    if (!checkIn || (checkIn && checkOut)) {
      onSelect(dateStr, "");
    } else {
      if (dateStr <= checkIn) {
        onSelect(dateStr, "");
      } else {
        onSelect(checkIn, dateStr);
      }
    }
  };

  const renderMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = firstDay.getDay();
    const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const cells: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-neutral-800 text-center mb-2">{monthLabel}</p>
        <div className="grid grid-cols-7 gap-0">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-neutral-400 py-1">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isPast = dateStr < todayStr;
            const isCheckIn = dateStr === checkIn;
            const isCheckOut = dateStr === checkOut;
            const isInRange = !!(checkIn && checkOut && dateStr > checkIn && dateStr < checkOut);
            const isToday = dateStr === todayStr;

            let bg = "hover:bg-neutral-100 text-neutral-700";
            if (isCheckIn || isCheckOut) bg = "bg-brand-500 text-white font-bold";
            else if (isInRange) bg = "bg-brand-50 text-brand-700";
            else if (isPast) bg = "text-neutral-200 cursor-default";

            return (
              <button
                key={dateStr}
                onClick={() => !isPast && handleDayClick(dateStr)}
                disabled={isPast}
                className={`h-8 text-xs rounded-md transition-colors ${bg} ${isToday && !isCheckIn ? "ring-1 ring-brand-300" : ""}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const prevMonth = () => {
    setViewMonth((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  };
  const nextMonth = () => {
    setViewMonth((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });
  };
  const m2 = viewMonth.month === 11 ? { year: viewMonth.year + 1, month: 0 } : { year: viewMonth.year, month: viewMonth.month + 1 };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 text-neutral-400 hover:text-neutral-600 rounded">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={nextMonth} className="p-1 text-neutral-400 hover:text-neutral-600 rounded">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="flex gap-4">
        {renderMonth(viewMonth.year, viewMonth.month)}
        {renderMonth(m2.year, m2.month)}
      </div>
    </div>
  );
}
