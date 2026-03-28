"use client";

import Link from "next/link";
import type { BookingBarData } from "./BookingBar";

const platformColors: Record<string, string> = {
  airbnb: "bg-red-50 text-red-700",
  vrbo: "bg-indigo-50 text-indigo-700",
  booking_com: "bg-brand-50 text-brand-700",
  booking: "bg-brand-50 text-brand-700",
  direct: "bg-emerald-50 text-emerald-700",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-50 text-green-700",
  pending: "bg-amber-50 text-amber-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-neutral-100 text-neutral-600",
};

interface BookingSidePanelProps {
  booking: BookingBarData | null;
  onClose: () => void;
}

export default function BookingSidePanel({ booking, onClose }: BookingSidePanelProps) {
  if (!booking) return null;

  const nights = Math.round(
    (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000
  );

  const formatDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-neutral-0 shadow-xl z-50 overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-neutral-0 border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-800">Booking Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Guest info */}
          <div>
            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">Guest</h3>
            <p className="text-lg font-bold text-neutral-800">
              {booking.guest_name ?? "Unknown Guest"}
            </p>
            {booking.guest_email && (
              <p className="text-sm text-neutral-500 mt-1">{booking.guest_email}</p>
            )}
            {booking.guest_phone && (
              <p className="text-sm text-neutral-500 mt-0.5">{booking.guest_phone}</p>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${platformColors[booking.platform] ?? "bg-neutral-100 text-neutral-600"}`}>
              {booking.platform}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[booking.status] ?? "bg-neutral-100 text-neutral-600"}`}>
              {booking.status}
            </span>
          </div>

          {/* Stay details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-400 mb-1">Check-in</p>
              <p className="text-sm font-medium text-neutral-800">{formatDate(booking.check_in)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1">Check-out</p>
              <p className="text-sm font-medium text-neutral-800">{formatDate(booking.check_out)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1">Nights</p>
              <p className="text-sm font-medium text-neutral-800">{nights}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1">Guests</p>
              <p className="text-sm font-medium text-neutral-800">{booking.num_guests ?? "—"}</p>
            </div>
          </div>

          {/* Price */}
          {booking.total_price != null && (
            <div className="bg-neutral-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Total</span>
                <span className="text-xl font-bold font-mono text-neutral-800">
                  ${booking.total_price.toLocaleString()}
                </span>
              </div>
              {nights > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-neutral-400">Per night</span>
                  <span className="text-sm font-mono text-neutral-500">
                    ${Math.round(booking.total_price / nights).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div>
              <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-sm text-neutral-600 whitespace-pre-wrap">{booking.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <Link
              href="/messages"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-brand-500 text-brand-500 text-sm font-medium rounded-lg hover:bg-brand-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Message Guest
            </Link>
            <Link
              href="/turnover"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-0 text-neutral-700 text-sm font-medium rounded-lg border border-[var(--border)] hover:bg-neutral-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              View Cleaning
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
