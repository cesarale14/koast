"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X, Loader2, ExternalLink } from "lucide-react";
import PlatformLogo from "@/components/ui/PlatformLogo";
import { useToast } from "@/components/ui/Toast";

export interface ConflictBooking {
  id: string;
  property_id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  total_price: number | null;
  channex_booking_id: string | null;
  platform_booking_id: string | null;
  status: string;
}

export interface Conflict {
  property_id: string;
  property_name: string;
  booking1: ConflictBooking;
  booking2: ConflictBooking;
  overlap_start: string;
  overlap_end: string;
  overlap_nights: number;
}

export interface ConflictsResponse {
  conflicts: Conflict[];
  count: number;
  affected_properties: number;
}

/* ---- Shared hook ---- */
export function useConflicts(enabled: boolean = true) {
  const [data, setData] = useState<ConflictsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bookings/conflicts");
      if (res.ok) {
        const json = (await res.json()) as ConflictsResponse;
        setData(json);
      }
    } catch {
      /* swallow — non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  return { data, loading, refresh };
}

/* ---- Helpers ---- */
function formatDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function platformSupportUrl(platform: string): string | null {
  const p = platform.toLowerCase();
  if (p === "airbnb") return "https://www.airbnb.com/help";
  if (p === "booking_com" || p === "booking.com") return "https://partner.booking.com/en-gb/help";
  if (p === "vrbo") return "https://help.vrbo.com";
  return null;
}

/* ---- Banner ---- */
export function ConflictBanner({
  conflicts,
  onResolve,
}: {
  conflicts: Conflict[];
  onResolve: (conflict: Conflict) => void;
}) {
  if (conflicts.length === 0) return null;

  // Show the first conflict in the banner; if there are more, mention them.
  const primary = conflicts[0];
  const extra = conflicts.length - 1;

  return (
    <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-500 flex items-center justify-center">
        <AlertTriangle size={18} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-900">
          Overbooking detected — {primary.property_name}
        </p>
        <p className="text-sm text-red-800 mt-0.5">
          {conflicts.length} bookings overlap on {formatRange(primary.overlap_start, primary.overlap_end)}
          {extra > 0 ? ` (+${extra} more conflict${extra === 1 ? "" : "s"})` : ""}. Immediate action required.
        </p>
      </div>
      <button
        onClick={() => onResolve(primary)}
        className="flex-shrink-0 px-4 h-9 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
      >
        Resolve now
      </button>
    </div>
  );
}

/* ---- Booking card (reused in modal) ---- */
function BookingCard({ booking, label }: { booking: ConflictBooking; label: string }) {
  const nights = Math.round(
    (Date.UTC(+booking.check_out.slice(0, 4), +booking.check_out.slice(5, 7) - 1, +booking.check_out.slice(8, 10)) -
      Date.UTC(+booking.check_in.slice(0, 4), +booking.check_in.slice(5, 7) - 1, +booking.check_in.slice(8, 10))) /
      86400000
  );
  return (
    <div className="flex-1 min-w-0 bg-neutral-50 rounded-lg p-4 border border-neutral-200">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <PlatformLogo platform={booking.platform} size="sm" />
      </div>
      <p className="text-base font-semibold text-neutral-800 truncate">{booking.guest_name ?? "Guest"}</p>
      <p className="text-sm text-neutral-500 mt-0.5">
        {formatRange(booking.check_in, booking.check_out)} · {nights} night{nights === 1 ? "" : "s"}
      </p>
      {booking.total_price != null && (
        <p className="text-sm font-mono text-neutral-700 mt-2">${Number(booking.total_price).toFixed(2)}</p>
      )}
      {booking.platform_booking_id && (
        <p className="text-[11px] font-mono text-neutral-400 mt-1 truncate">{booking.platform_booking_id}</p>
      )}
    </div>
  );
}

/* ---- Timeline bar ---- */
function Timeline({ conflict }: { conflict: Conflict }) {
  // Combined range is min(start)..max(end)
  const starts = [conflict.booking1.check_in, conflict.booking2.check_in].sort();
  const ends = [conflict.booking1.check_out, conflict.booking2.check_out].sort();
  const totalStart = starts[0];
  const totalEnd = ends[1];
  const toMs = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const span = toMs(totalEnd) - toMs(totalStart);
  const pct = (s: string) => ((toMs(s) - toMs(totalStart)) / span) * 100;

  return (
    <div className="mt-6">
      <div className="flex justify-between text-[11px] text-neutral-500 mb-1.5">
        <span>{formatDate(totalStart)}</span>
        <span className="font-semibold text-red-600">Conflict zone</span>
        <span>{formatDate(totalEnd)}</span>
      </div>
      <div className="relative h-6 rounded-full bg-neutral-100 overflow-hidden">
        {/* Booking 1 */}
        <div
          className="absolute top-0 bottom-0 bg-neutral-400/60"
          style={{ left: `${pct(conflict.booking1.check_in)}%`, width: `${pct(conflict.booking1.check_out) - pct(conflict.booking1.check_in)}%` }}
          title={`Booking A: ${conflict.booking1.guest_name}`}
        />
        {/* Booking 2 */}
        <div
          className="absolute top-0 bottom-0 bg-neutral-500/60"
          style={{ left: `${pct(conflict.booking2.check_in)}%`, width: `${pct(conflict.booking2.check_out) - pct(conflict.booking2.check_in)}%` }}
          title={`Booking B: ${conflict.booking2.guest_name}`}
        />
        {/* Overlap zone */}
        <div
          className="absolute top-0 bottom-0 bg-red-500/80"
          style={{ left: `${pct(conflict.overlap_start)}%`, width: `${pct(conflict.overlap_end) - pct(conflict.overlap_start)}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 mt-2 text-center">
        {conflict.overlap_nights} night{conflict.overlap_nights === 1 ? "" : "s"} overlap:
        {" "}
        <span className="font-semibold text-red-600">{formatRange(conflict.overlap_start, conflict.overlap_end)}</span>
      </p>
    </div>
  );
}

/* ---- Resolution modal ---- */
type ResolutionMode = "relocate" | "cancel_later" | "cancel_earlier" | "contact_platform";

export function ConflictResolutionModal({
  conflict,
  onClose,
  onResolved,
}: {
  conflict: Conflict | null;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<ResolutionMode>("cancel_later");
  const [applying, setApplying] = useState(false);
  const [alternates, setAlternates] = useState<{ id: string; name: string }[]>([]);
  const [relocateTo, setRelocateTo] = useState<string>("");

  // Determine which is the "earlier" and "later" booking for the cancel options
  const sorted = conflict
    ? [conflict.booking1, conflict.booking2].sort((a, b) =>
        a.check_in === b.check_in ? a.check_out.localeCompare(b.check_out) : a.check_in.localeCompare(b.check_in)
      )
    : [];
  const earlierBooking = sorted[0];
  const laterBooking = sorted[1];

  useEffect(() => {
    if (!conflict) return;
    setMode("cancel_later");
    setRelocateTo("");
    // Fetch other properties as relocation candidates (best-effort — the
    // availability check happens on apply).
    fetch("/api/properties/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = ((d?.properties ?? d ?? []) as any[])
          .filter((p) => p.id !== conflict.property_id)
          .map((p) => ({ id: p.id as string, name: p.name as string }));
        setAlternates(props);
        if (props.length > 0) setRelocateTo(props[0].id);
      })
      .catch(() => { /* non-critical */ });
  }, [conflict]);

  if (!conflict || !earlierBooking || !laterBooking) return null;

  const apply = async () => {
    setApplying(true);
    try {
      if (mode === "cancel_later") {
        const res = await fetch(`/api/bookings/${laterBooking.id}/cancel`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Cancel failed");
        toast(`Cancelled ${laterBooking.guest_name ?? "later booking"}`);
      } else if (mode === "cancel_earlier") {
        const res = await fetch(`/api/bookings/${earlierBooking.id}/cancel`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Cancel failed");
        toast(`Cancelled ${earlierBooking.guest_name ?? "earlier booking"}`);
      } else if (mode === "relocate") {
        if (!relocateTo) throw new Error("Pick a property to relocate to");
        // Relocate = create a new booking at the alternate property, then
        // cancel the original. The guest usually travels the later booking
        // since the earlier one is "in-system" longer.
        const target = laterBooking;
        const createRes = await fetch("/api/bookings/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_id: relocateTo,
            guest_name: target.guest_name,
            check_in: target.check_in,
            check_out: target.check_out,
            total_price: target.total_price,
            platform: target.platform,
            notes: `Relocated from overbooked ${conflict.property_name}`,
          }),
        });
        if (!createRes.ok) throw new Error((await createRes.json()).error ?? "Relocate failed");
        const cancelRes = await fetch(`/api/bookings/${target.id}/cancel`, { method: "POST" });
        if (!cancelRes.ok) throw new Error((await cancelRes.json()).error ?? "Original cancel failed");
        toast(`Relocated ${target.guest_name ?? "booking"} to alternate property`);
      } else if (mode === "contact_platform") {
        const url = platformSupportUrl(laterBooking.platform);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        toast("Opened platform support");
        setApplying(false);
        return;
      }
      onResolved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Resolution failed", "error");
    } finally {
      setApplying(false);
    }
  };

  const refundFor = (b: ConflictBooking) => (b.total_price != null ? `$${Number(b.total_price).toFixed(2)}` : "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              <h2 className="text-lg font-bold text-neutral-900">Resolve overbooking</h2>
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">{conflict.property_name}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Bookings side-by-side */}
        <div className="p-6 border-b border-neutral-100">
          <div className="flex gap-4">
            <BookingCard booking={earlierBooking} label="Booking A" />
            <BookingCard booking={laterBooking} label="Booking B" />
          </div>
          <Timeline conflict={conflict} />
        </div>

        {/* Resolution options */}
        <div className="p-6 border-b border-neutral-100">
          <p className="text-sm font-semibold text-neutral-800 mb-3">Choose a resolution</p>
          <div className="space-y-2">
            {/* Relocate */}
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              mode === "relocate" ? "border-red-300 bg-red-50/50" : "border-neutral-200 hover:bg-neutral-50"
            }`}>
              <input
                type="radio"
                checked={mode === "relocate"}
                onChange={() => setMode("relocate")}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800">
                  Relocate {laterBooking.guest_name ?? "guest"} to another property
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Creates a new booking at the alternate property and cancels the original.
                </p>
                {mode === "relocate" && (
                  alternates.length > 0 ? (
                    <select
                      value={relocateTo}
                      onChange={(e) => setRelocateTo(e.target.value)}
                      className="mt-2 w-full h-9 px-3 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    >
                      {alternates.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-400">No other properties available</p>
                  )
                )}
              </div>
            </label>

            {/* Cancel later booking */}
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              mode === "cancel_later" ? "border-red-300 bg-red-50/50" : "border-neutral-200 hover:bg-neutral-50"
            }`}>
              <input
                type="radio"
                checked={mode === "cancel_later"}
                onChange={() => setMode("cancel_later")}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800">
                  Cancel {laterBooking.guest_name ?? "later booking"} (later check-in)
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Refund ~{refundFor(laterBooking)} — restores availability via Channex.
                </p>
              </div>
            </label>

            {/* Cancel earlier booking */}
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              mode === "cancel_earlier" ? "border-red-300 bg-red-50/50" : "border-neutral-200 hover:bg-neutral-50"
            }`}>
              <input
                type="radio"
                checked={mode === "cancel_earlier"}
                onChange={() => setMode("cancel_earlier")}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800">
                  Cancel {earlierBooking.guest_name ?? "earlier booking"} (earlier check-in)
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Refund ~{refundFor(earlierBooking)} — restores availability via Channex.
                </p>
              </div>
            </label>

            {/* Contact platform */}
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              mode === "contact_platform" ? "border-red-300 bg-red-50/50" : "border-neutral-200 hover:bg-neutral-50"
            }`}>
              <input
                type="radio"
                checked={mode === "contact_platform"}
                onChange={() => setMode("contact_platform")}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 flex items-center gap-1">
                  Contact {laterBooking.platform === "booking_com" ? "Booking.com" : laterBooking.platform === "airbnb" ? "Airbnb" : "platform"} support
                  <ExternalLink size={12} />
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">Opens the platform's partner help center in a new tab.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={applying}
            className="h-9 px-5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {applying && <Loader2 size={14} className="animate-spin" />}
            Apply resolution
          </button>
        </div>
      </div>
    </div>
  );
}
