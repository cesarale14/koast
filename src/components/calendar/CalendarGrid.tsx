"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Minus, Plus, X } from "lucide-react";
import CalendarToolbar from "./CalendarToolbar";
import MonthlyView, { MONTH_NAMES } from "./MonthlyView";
import PropertyThumbStrip from "./PropertyThumbStrip";
import BookingSidePanel from "./BookingSidePanel";
import { PerChannelRateEditor } from "./PerChannelRateEditor";
import {
  ConflictResolutionModal,
  type Conflict,
  type ConflictBooking,
} from "@/components/dashboard/ConflictResolution";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";
import Image from "next/image";

interface CalendarProperty {
  id: string;
  name: string;
  cover_photo_url?: string | null;
}

interface CalendarBooking {
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

interface CalendarRate {
  property_id: string;
  date: string;
  base_rate: number | null;
  suggested_rate: number | null;
  applied_rate: number | null;
  min_stay: number;
  is_available: boolean;
  rate_source: string;
}

interface CalendarGridProps {
  properties: CalendarProperty[];
  bookings: CalendarBooking[];
  rates: CalendarRate[];
  totalDays: number;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatRangeDate(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function CalendarGrid({
  properties,
  bookings,
  rates: initialRates,
}: CalendarGridProps) {
  const { toast } = useToast();
  const todayStr = getToday();

  const [activePropertyId, setActivePropertyId] = useState(properties[0]?.id ?? "");
  const [selectedBooking, setSelectedBooking] = useState<BookingBarData | null>(null);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);

  // View month state (single-month pagination)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Selected date (controls the right panel). Default to today so the
  // panel always has something to show when the page loads.
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

  const [ratesState, setRatesState] = useState(initialRates);

  // Mount-only entrance trigger. Avoids animations replaying on internal
  // state changes (month nav, date selection, rate saves) — only fires
  // once per page load.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const rateLookup = useMemo(() => {
    const map = new Map<string, Map<string, RateData>>();
    for (const r of ratesState) {
      if (!map.has(r.property_id)) map.set(r.property_id, new Map());
      map.get(r.property_id)!.set(r.date, {
        base_rate: r.base_rate,
        suggested_rate: r.suggested_rate,
        applied_rate: r.applied_rate,
        min_stay: r.min_stay,
        is_available: r.is_available,
        rate_source: r.rate_source,
      });
    }
    return map;
  }, [ratesState]);

  const bookingLookup = useMemo(() => {
    const map = new Map<string, BookingBarData[]>();
    for (const b of bookings) {
      if (!map.has(b.property_id)) map.set(b.property_id, []);
      map.get(b.property_id)!.push(b);
    }
    return map;
  }, [bookings]);

  // Property → connected platform slugs map for thumbnail channel badges.
  const [propertyPlatforms, setPropertyPlatforms] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    // Derive from bookings directly — every connected channel that has
    // pushed or received a booking shows up in the booking set.
    const map = new Map<string, Set<string>>();
    for (const b of bookings) {
      const key = platformKeyFrom(b.platform);
      if (!key) continue;
      if (!map.has(b.property_id)) map.set(b.property_id, new Set());
      map.get(b.property_id)!.add(key);
    }
    const out = new Map<string, string[]>();
    for (const [k, v] of Array.from(map.entries())) out.set(k, Array.from(v));
    setPropertyPlatforms(out);
  }, [bookings]);

  // Quick stats for the thumbnail strip (computed for the active property).
  const stats = useMemo(() => {
    if (!activePropertyId) return { nextCheckIn: "—", occupancy: 0, avgRate: 0 };
    const propBookings = bookingLookup.get(activePropertyId) ?? [];
    const propRates = rateLookup.get(activePropertyId) ?? new Map<string, RateData>();

    const upcoming = propBookings
      .filter((b) => b.check_in >= todayStr)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    const nextCheckIn = upcoming[0]
      ? new Date(upcoming[0].check_in + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "—";

    let bookedNights = 0;
    const days = 30;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (propBookings.some((b) => ds >= b.check_in && ds < b.check_out)) bookedNights++;
    }
    const occupancy = Math.round((bookedNights / days) * 100);

    let rateSum = 0;
    let rateCount = 0;
    propRates.forEach((r) => {
      const rate = r.applied_rate ?? r.suggested_rate ?? r.base_rate;
      if (rate) {
        rateSum += rate;
        rateCount++;
      }
    });
    const avgRate = rateCount > 0 ? Math.round(rateSum / rateCount) : 0;

    return { nextCheckIn, occupancy, avgRate };
  }, [activePropertyId, bookingLookup, rateLookup, todayStr]);

  // ---------- Month nav ----------
  const goPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      const month = m.month === 0 ? 11 : m.month - 1;
      const year = m.month === 0 ? m.year - 1 : m.year;
      return { year, month };
    });
  }, []);
  const goNextMonth = useCallback(() => {
    setViewMonth((m) => {
      const month = m.month === 11 ? 0 : m.month + 1;
      const year = m.month === 11 ? m.year + 1 : m.year;
      return { year, month };
    });
  }, []);
  const goToday = useCallback(() => {
    const d = new Date();
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(todayStr);
  }, [todayStr]);

  // ---------- Rate save ----------
  const handleSaveRate = useCallback(
    async (updates: { date: string; applied_rate: number | null; is_available: boolean; min_stay: number }) => {
      const supabase = createClient();
      await supabase.from("calendar_rates").upsert(
        {
          property_id: activePropertyId,
          date: updates.date,
          applied_rate: updates.applied_rate,
          is_available: updates.is_available,
          min_stay: updates.min_stay,
          rate_source: "manual",
          channel_code: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        { onConflict: "property_id,date,channel_code" }
      );

      setRatesState((prev) => {
        const next = [...prev];
        const idx = next.findIndex(
          (r) => r.property_id === activePropertyId && r.date === updates.date
        );
        const entry: CalendarRate = {
          property_id: activePropertyId,
          date: updates.date,
          base_rate: null,
          suggested_rate: null,
          applied_rate: updates.applied_rate,
          min_stay: updates.min_stay,
          is_available: updates.is_available,
          rate_source: "manual",
        };
        if (idx >= 0) next[idx] = { ...next[idx], ...entry };
        else next.push(entry);
        return next;
      });

      toast("Saved. Use the per-channel editor below to push to OTAs.");
    },
    [activePropertyId, toast]
  );

  // ---------- Conflict helpers ----------
  const monthlyConflictPairs = useMemo(() => {
    const propBookings = bookingLookup.get(activePropertyId) ?? [];
    const confirmed = propBookings.filter((b) => !b.status || b.status === "confirmed");
    const sorted = [...confirmed].sort((x, y) =>
      x.check_in === y.check_in
        ? x.check_out.localeCompare(y.check_out)
        : x.check_in.localeCompare(y.check_in)
    );
    const pairs: { a: BookingBarData; b: BookingBarData; start: string; end: string; nights: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].check_in >= sorted[i].check_out) continue;
        if (sorted[i].check_out === sorted[j].check_in || sorted[j].check_out === sorted[i].check_in) continue;
        const start = sorted[i].check_in > sorted[j].check_in ? sorted[i].check_in : sorted[j].check_in;
        const end = sorted[i].check_out < sorted[j].check_out ? sorted[i].check_out : sorted[j].check_out;
        const nights = Math.round(
          (Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) -
            Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))) /
            86400000
        );
        if (nights === 0) continue;
        pairs.push({ a: sorted[i], b: sorted[j], start, end, nights });
      }
    }
    return pairs;
  }, [activePropertyId, bookingLookup]);

  const handleConflictResolve = useCallback(
    (a: BookingBarData, b: BookingBarData) => {
      const toConflictBooking = (x: BookingBarData): ConflictBooking => ({
        id: x.id,
        property_id: x.property_id,
        guest_name: x.guest_name,
        check_in: x.check_in,
        check_out: x.check_out,
        platform: x.platform,
        total_price: x.total_price,
        channex_booking_id: null,
        platform_booking_id: null,
        status: x.status,
      });
      const start = a.check_in > b.check_in ? a.check_in : b.check_in;
      const end = a.check_out < b.check_out ? a.check_out : b.check_out;
      const nights = Math.round(
        (Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) -
          Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))) /
          86400000
      );
      setActiveConflict({
        property_id: activePropertyId,
        property_name: properties.find((p) => p.id === activePropertyId)?.name ?? "Property",
        booking1: toConflictBooking(a),
        booking2: toConflictBooking(b),
        overlap_start: start,
        overlap_end: end,
        overlap_nights: nights,
      });
    },
    [activePropertyId, properties]
  );

  // ---------- Selected booking tracking ----------
  const selectedBookingDetails = useMemo(() => {
    if (!selectedBooking) return null;
    const propName = properties.find((p) => p.id === selectedBooking.property_id)?.name ?? "";
    const nights = Math.round(
      (Date.UTC(+selectedBooking.check_out.slice(0, 4), +selectedBooking.check_out.slice(5, 7) - 1, +selectedBooking.check_out.slice(8, 10)) -
        Date.UTC(+selectedBooking.check_in.slice(0, 4), +selectedBooking.check_in.slice(5, 7) - 1, +selectedBooking.check_in.slice(8, 10))) /
        86400000
    );
    return { propName, nights };
  }, [selectedBooking, properties]);

  // Rate for the currently selected date on the active property
  const activeRate = useMemo(() => {
    if (!selectedDate) return null;
    return rateLookup.get(activePropertyId)?.get(selectedDate) ?? null;
  }, [rateLookup, activePropertyId, selectedDate]);

  const thumbnailProps = useMemo(
    () =>
      properties.map((p) => ({
        id: p.id,
        name: p.name,
        cover_photo_url: p.cover_photo_url,
        platforms: propertyPlatforms.get(p.id) ?? [],
      })),
    [properties, propertyPlatforms]
  );

  const monthLabel = MONTH_NAMES[viewMonth.month];
  const yearLabel = String(viewMonth.year);

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Conflict pill row — persists from the old implementation */}
      {monthlyConflictPairs.length > 0 && (
        <div
          className="flex-shrink-0 px-4 py-2 bg-coral-reef/[0.04]"
          style={{ borderBottom: "1px solid rgba(196,64,64,0.15)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {monthlyConflictPairs.map((p, i) => {
              const s = new Date(p.start + "T00:00:00");
              const e = new Date(p.end + "T00:00:00");
              const sMonth = s.toLocaleDateString("en-US", { month: "short" });
              const eMonth = e.toLocaleDateString("en-US", { month: "short" });
              const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
              const range = sameMonth
                ? `${sMonth} ${s.getDate()}–${e.getDate()}`
                : `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}`;
              const label = `${monthlyConflictPairs.length > 1 ? `#${i + 1} ` : ""}${p.nights} night${p.nights === 1 ? "" : "s"} overlap ${range}`;
              return (
                <button
                  key={`${p.a.id}-${p.b.id}`}
                  onClick={() => handleConflictResolve(p.a, p.b)}
                  className="inline-flex items-center gap-2 px-3 h-7 rounded-full text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: "rgba(196,64,64,0.08)",
                    border: "1px solid rgba(196,64,64,0.2)",
                    color: "var(--coral-reef)",
                  }}
                >
                  <span
                    className="w-4 h-4 rounded-full text-white inline-flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: "var(--coral-reef)" }}
                  >
                    !
                  </span>
                  <span>{label}</span>
                  <span style={{ opacity: 0.7, fontWeight: 400 }}>· Click to resolve</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Three-column layout (strip hides when there's only one property,
          i.e. when embedded inside the property detail page). */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {properties.length > 1 && (
          <PropertyThumbStrip
            properties={thumbnailProps}
            activeId={activePropertyId}
            onSelect={(id) => setActivePropertyId(id)}
            stats={stats}
          />
        )}

        <div
          className={`flex-1 min-w-0 flex flex-col ${mounted ? "animate-fadeSlideIn" : "opacity-0"}`}
          style={{ animationDelay: "250ms" }}
        >
          <CalendarToolbar
            monthLabel={monthLabel}
            yearLabel={yearLabel}
            onPrev={goPrevMonth}
            onNext={goNextMonth}
            onToday={goToday}
          />
          <MonthlyView
            propertyId={activePropertyId}
            bookings={bookingLookup.get(activePropertyId) ?? []}
            rates={rateLookup.get(activePropertyId) ?? new Map()}
            todayStr={todayStr}
            selectedDate={selectedDate}
            viewMonth={viewMonth}
            onBookingClick={setSelectedBooking}
            onDateClick={(date) => {
              setSelectedDate(date);
              setSelectedBooking(null);
            }}
          />
        </div>

        <RightPanel
          propertyId={activePropertyId}
          propertyName={properties.find((p) => p.id === activePropertyId)?.name ?? ""}
          selectedDate={selectedDate}
          activeRate={activeRate}
          selectedBooking={selectedBooking}
          selectedBookingDetails={selectedBookingDetails}
          onClearBooking={() => setSelectedBooking(null)}
          onSaveRate={handleSaveRate}
          mounted={mounted}
        />
      </div>

      <BookingSidePanel
        booking={null}
        onClose={() => {}}
        propertyMap={new Map(properties.map((p) => [p.id, { name: p.name, cover_photo_url: p.cover_photo_url }]))}
      />

      <ConflictResolutionModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolved={() => {}}
      />
    </div>
  );
}

// ============ Right Panel ============

function RightPanel({
  propertyId,
  propertyName,
  selectedDate,
  activeRate,
  selectedBooking,
  selectedBookingDetails,
  onClearBooking,
  onSaveRate,
  mounted,
}: {
  propertyId: string;
  propertyName: string;
  selectedDate: string | null;
  activeRate: RateData | null;
  selectedBooking: BookingBarData | null;
  selectedBookingDetails: { propName: string; nights: number } | null;
  onClearBooking: () => void;
  onSaveRate: (updates: { date: string; applied_rate: number | null; is_available: boolean; min_stay: number }) => void;
  mounted: boolean;
}) {
  const [available, setAvailable] = useState(true);
  const [minStay, setMinStay] = useState(1);

  // Re-sync controls when the selection changes
  useEffect(() => {
    if (!activeRate) {
      setAvailable(true);
      setMinStay(1);
      return;
    }
    setAvailable(activeRate.is_available !== false);
    setMinStay(activeRate.min_stay ?? 1);
  }, [selectedDate, activeRate]);

  const dateLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const dowLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
    : null;

  const baseRate = activeRate?.suggested_rate ?? activeRate?.base_rate ?? activeRate?.applied_rate ?? null;

  const handleAvailableToggle = () => {
    if (!selectedDate) return;
    const next = !available;
    setAvailable(next);
    onSaveRate({
      date: selectedDate,
      applied_rate: activeRate?.applied_rate ?? null,
      is_available: next,
      min_stay: minStay,
    });
  };

  const handleMinStayChange = (delta: number) => {
    if (!selectedDate) return;
    const next = Math.max(1, minStay + delta);
    setMinStay(next);
    onSaveRate({
      date: selectedDate,
      applied_rate: activeRate?.applied_rate ?? null,
      is_available: available,
      min_stay: next,
    });
  };

  const showBookingView = !!(selectedBooking && selectedBookingDetails);

  // Date range for the channel rate editor. When showing a booking we
  // use every night of its stay; otherwise we fall back to the single
  // selected date.
  const channelRateDates = useMemo(() => {
    if (showBookingView && selectedBooking) {
      const out: string[] = [];
      const d = new Date(selectedBooking.check_in + "T00:00:00Z");
      const co = new Date(selectedBooking.check_out + "T00:00:00Z");
      while (d < co) {
        out.push(d.toISOString().split("T")[0]);
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return out.length > 0 ? out : [selectedDate ?? ""].filter(Boolean);
    }
    return selectedDate ? [selectedDate] : [];
  }, [showBookingView, selectedBooking, selectedDate]);

  return (
    <aside
      className={`hidden lg:flex flex-col flex-shrink-0 bg-white overflow-y-auto ${mounted ? "animate-fadeSlideIn" : "opacity-0"}`}
      style={{ width: 310, borderLeft: "1px solid var(--dry-sand)", animationDelay: "400ms" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        {showBookingView ? (
          <>
            <div className="text-[18px] font-bold" style={{ color: "var(--coastal)" }}>
              Booking details
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--tideline)" }}>
              {propertyName}
            </div>
          </>
        ) : selectedDate ? (
          <>
            <div className="text-[18px] font-bold" style={{ color: "var(--coastal)" }}>
              {dateLabel}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--tideline)" }}>
              {dowLabel} · {propertyName}
            </div>
          </>
        ) : (
          <div className="text-[13px]" style={{ color: "var(--tideline)" }}>
            Select a date to edit pricing
          </div>
        )}
      </div>

      {/* Booking-specific view: booking card + channel rates only */}
      {selectedBooking && selectedBookingDetails && (
        <BookingInfoSection
          booking={selectedBooking}
          nights={selectedBookingDetails.nights}
          onClear={onClearBooking}
        />
      )}

      {/* Base Rate — hidden while a booking is being inspected */}
      {!showBookingView && selectedDate && (
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(237,231,219,0.5)" }}>
          <SectionLabel label="Base rate" />
          <div className="flex items-center justify-between">
            <div
              className="text-[28px] font-bold tabular-nums"
              style={{ color: "var(--coastal)", letterSpacing: "-0.03em" }}
            >
              ${baseRate ?? "—"}
            </div>
            <div
              className="px-[10px] py-1 rounded-full text-[10px] font-bold"
              style={{
                background: "linear-gradient(135deg, rgba(26,122,90,0.12), rgba(26,122,90,0.04))",
                color: "var(--lagoon)",
                border: "1px solid rgba(26,122,90,0.15)",
              }}
            >
              9-signal
            </div>
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: "var(--tideline)" }}>
            {activeRate?.rate_source === "manual" ? "Manual override" : "Engine output"}
          </div>
        </div>
      )}

      {/* Channel rates */}
      {(selectedDate || showBookingView) && (
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(237,231,219,0.5)" }}>
          <PerChannelRateEditor
            propertyId={propertyId}
            dates={channelRateDates}
            baseRate={baseRate}
          />
        </div>
      )}

      {/* Settings — hidden while a booking is being inspected */}
      {!showBookingView && selectedDate && (
        <div className="px-5 py-4">
          <SectionLabel label="Settings" />
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-[13px] font-semibold" style={{ color: "var(--coastal)" }}>
                Available
              </div>
              <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
                Open on all channels
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={available}
              onClick={handleAvailableToggle}
              className="relative transition-colors"
              style={{
                width: 42,
                height: 22,
                borderRadius: 11,
                backgroundColor: available ? "var(--lagoon)" : "var(--shell)",
              }}
            >
              <div
                className="absolute top-[2px] rounded-full bg-white"
                style={{
                  width: 18,
                  height: 18,
                  left: available ? 22 : 2,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  transition: "left 0.2s ease",
                }}
              />
            </button>
          </div>
          <div
            className="flex items-center justify-between py-3"
            style={{ borderTop: "1px solid var(--dry-sand)" }}
          >
            <div>
              <div className="text-[13px] font-semibold" style={{ color: "var(--coastal)" }}>
                Min stay
              </div>
              <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
                All channels
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMinStayChange(-1)}
                className="flex items-center justify-center transition-colors"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  border: "1px solid var(--dry-sand)",
                  backgroundColor: "#fff",
                  color: "var(--coastal)",
                }}
              >
                <Minus size={14} />
              </button>
              <div
                className="text-[18px] font-bold text-center"
                style={{ color: "var(--coastal)", minWidth: 28 }}
              >
                {minStay}
              </div>
              <button
                type="button"
                onClick={() => handleMinStayChange(1)}
                className="flex items-center justify-center transition-colors"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  border: "1px solid var(--dry-sand)",
                  backgroundColor: "#fff",
                  color: "var(--coastal)",
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="mb-3 text-[10px] font-bold tracking-[0.08em] uppercase"
      style={{ color: "var(--golden)" }}
    >
      {label}
    </div>
  );
}

function BookingInfoSection({
  booking,
  nights,
  onClear,
}: {
  booking: BookingBarData;
  nights: number;
  onClear: () => void;
}) {
  const platformKey = platformKeyFrom(booking.platform);
  const platform = platformKey ? PLATFORMS[platformKey] : null;
  const guestName = booking.guest_name?.trim() || "Guest";
  const initials = guestName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const total = booking.total_price ?? 0;
  const perNight = total && nights > 0 ? Math.round(total / nights) : 0;

  return (
    <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(237,231,219,0.5)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: "var(--golden)" }}>
          Current booking
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-0.5 transition-colors rounded"
          style={{ color: "var(--tideline)" }}
          aria-label="Clear booking selection"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex items-center justify-center flex-shrink-0 text-white font-bold"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--mangrove), var(--tideline))",
            fontSize: 16,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold truncate" style={{ color: "var(--coastal)" }}>
              {guestName}
            </span>
            {platform && (
              <span
                className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold"
                style={{
                  height: 18,
                  backgroundColor: platform.colorLight,
                  color: platform.color,
                }}
              >
                <Image src={platform.icon} alt={platform.name} width={10} height={10} />
                {platform.name}
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--tideline)" }}>
            {formatRangeDate(booking.check_in)} — {formatRangeDate(booking.check_out)} ·{" "}
            {nights} night{nights !== 1 ? "s" : ""} · {booking.num_guests ?? 1} guest
            {(booking.num_guests ?? 1) !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[10px] px-3 py-2.5" style={{ backgroundColor: "var(--shore)" }}>
          <div className="text-[16px] font-bold" style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}>
            ${total || "—"}
          </div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.04em] mt-0.5"
            style={{ color: "var(--tideline)" }}
          >
            Total payout
          </div>
        </div>
        <div className="rounded-[10px] px-3 py-2.5" style={{ backgroundColor: "var(--shore)" }}>
          <div className="text-[16px] font-bold" style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}>
            ${perNight || "—"}
          </div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.04em] mt-0.5"
            style={{ color: "var(--tideline)" }}
          >
            Per night
          </div>
        </div>
      </div>
    </div>
  );
}
