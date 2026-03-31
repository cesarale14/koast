"use client";

import { useState, useMemo } from "react";
import PropertyAvatar from "@/components/ui/PropertyAvatar";
import { Download } from "lucide-react";

interface Booking {
  id: string;
  property_id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  total_price: number | null;
  num_guests: number | null;
  status: string;
  notes: string | null;
}

interface Property {
  id: string;
  name: string;
  cover_photo_url: string | null;
}

interface Props {
  bookings: Booking[];
  properties: Property[];
}

const statusColors: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-neutral-100 text-neutral-600",
};

const platformColors: Record<string, string> = {
  airbnb: "bg-red-50 text-red-700",
  vrbo: "bg-indigo-50 text-indigo-700",
  booking_com: "bg-blue-50 text-blue-700",
  direct: "bg-emerald-50 text-emerald-700",
};

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb", vrbo: "VRBO", booking_com: "Booking", direct: "Direct",
};

function getNights(ci: string, co: string): number {
  return Math.round(
    (Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10)) -
     Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10))) / 86400000
  );
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SortKey = "check_in" | "check_out" | "guest_name" | "platform" | "status" | "total_price";

export default function BookingsClient({ bookings, properties }: Props) {
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("check_in");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const filtered = useMemo(() => {
    let result = bookings;
    if (propertyFilter !== "all") result = result.filter((b) => b.property_id === propertyFilter);
    if (platformFilter !== "all") result = result.filter((b) => b.platform === platformFilter);
    if (statusFilter !== "all") result = result.filter((b) => b.status === statusFilter);
    return result;
  }, [bookings, propertyFilter, platformFilter, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "total_price") { av = a.total_price ?? 0; bv = b.total_price ?? 0; }
      else { av = (a[sortKey] ?? "") as string; bv = (b[sortKey] ?? "") as string; }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const selectedBooking = selectedId ? bookings.find((b) => b.id === selectedId) : null;
  const sortArrow = (key: string) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  const exportCSV = () => {
    const headers = ["Guest", "Property", "Platform", "Check-in", "Check-out", "Nights", "Status", "Revenue"];
    const rows = sorted.map((b) => [
      b.guest_name ?? "", propMap.get(b.property_id)?.name ?? "", b.platform,
      b.check_in, b.check_out, getNights(b.check_in, b.check_out),
      b.status, b.total_price ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bookings.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Bookings</h1>
          <p className="text-sm text-neutral-500">{filtered.length} reservation{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0">
          <option value="all">All Properties</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0">
          <option value="all">All Platforms</option>
          <option value="airbnb">Airbnb</option>
          <option value="vrbo">VRBO</option>
          <option value="booking_com">Booking.com</option>
          <option value="direct">Direct</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0">
          <option value="all">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">Property</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("guest_name")}>
                  Guest{sortArrow("guest_name")}
                </th>
                <th className="text-left py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("platform")}>
                  Platform{sortArrow("platform")}
                </th>
                <th className="text-left py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("check_in")}>
                  Check-in{sortArrow("check_in")}
                </th>
                <th className="text-left py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Check-out</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Nights</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("status")}>
                  Status{sortArrow("status")}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("total_price")}>
                  Revenue{sortArrow("total_price")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const prop = propMap.get(b.property_id);
                const nights = getNights(b.check_in, b.check_out);
                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
                    className={`border-b border-neutral-50 cursor-pointer transition-colors ${
                      selectedId === b.id ? "bg-brand-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <PropertyAvatar name={prop?.name ?? "?"} photoUrl={prop?.cover_photo_url} size={28} />
                        <span className="text-neutral-700 truncate max-w-[140px]">{prop?.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-neutral-800">{b.guest_name ?? "—"}</td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${platformColors[b.platform] ?? "bg-neutral-100 text-neutral-500"}`}>
                        {platformLabels[b.platform] ?? b.platform}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-neutral-700 font-mono text-xs">{formatDate(b.check_in)}</td>
                    <td className="py-3 px-3 text-neutral-700 font-mono text-xs">{formatDate(b.check_out)}</td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-700">{nights}</td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[b.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-mono text-neutral-800">
                      {b.total_price != null ? `$${b.total_price.toLocaleString()}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="p-16 text-center">
            <p className="text-neutral-400 text-sm">No bookings match your filters.</p>
          </div>
        )}
      </div>

      {/* Booking detail panel */}
      {selectedBooking && (() => {
        const prop = propMap.get(selectedBooking.property_id);
        const nights = getNights(selectedBooking.check_in, selectedBooking.check_out);
        return (
          <>
            <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedId(null)} />
            <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-neutral-0 shadow-xl z-50 overflow-y-auto">
              <div className="sticky top-0 bg-neutral-0 border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-800">Booking Details</h2>
                <button onClick={() => setSelectedId(null)} className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-5">
                {prop && (
                  <div className="flex items-center gap-3">
                    <PropertyAvatar name={prop.name} photoUrl={prop.cover_photo_url} size={40} />
                    <p className="text-sm font-medium text-neutral-700">{prop.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">Guest</p>
                  <p className="text-lg font-bold text-neutral-800">{selectedBooking.guest_name ?? "Unknown"}</p>
                  {selectedBooking.guest_email && <p className="text-sm text-neutral-500">{selectedBooking.guest_email}</p>}
                  {selectedBooking.guest_phone && <p className="text-sm text-neutral-500">{selectedBooking.guest_phone}</p>}
                </div>
                <div className="flex gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${platformColors[selectedBooking.platform] ?? "bg-neutral-100"}`}>
                    {platformLabels[selectedBooking.platform] ?? selectedBooking.platform}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[selectedBooking.status] ?? "bg-neutral-100"}`}>
                    {selectedBooking.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-neutral-400 mb-1">Check-in</p><p className="text-sm font-medium">{formatDate(selectedBooking.check_in)}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-1">Check-out</p><p className="text-sm font-medium">{formatDate(selectedBooking.check_out)}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-1">Nights</p><p className="text-sm font-medium font-mono">{nights}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-1">Guests</p><p className="text-sm font-medium">{selectedBooking.num_guests ?? "—"}</p></div>
                </div>
                {selectedBooking.total_price != null && (
                  <div className="bg-neutral-50 rounded-lg p-4">
                    <div className="flex justify-between"><span className="text-sm text-neutral-500">Total</span><span className="text-xl font-bold font-mono">${selectedBooking.total_price.toLocaleString()}</span></div>
                    {nights > 0 && <div className="flex justify-between mt-1"><span className="text-xs text-neutral-400">Per night</span><span className="text-sm font-mono">${Math.round(selectedBooking.total_price / nights)}</span></div>}
                  </div>
                )}
                {selectedBooking.notes && (
                  <div><p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">Notes</p><p className="text-sm text-neutral-600 whitespace-pre-wrap">{selectedBooking.notes}</p></div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
