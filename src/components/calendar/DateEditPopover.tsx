"use client";

import { useState } from "react";
import type { RateData } from "./DateCell";

interface DateEditPopoverProps {
  dates: string[];
  initialRate: RateData | null;
  position: { top: number; left: number };
  onSave: (updates: {
    dates: string[];
    applied_rate: number | null;
    is_available: boolean;
    min_stay: number;
  }) => void;
  onClose: () => void;
}

export default function DateEditPopover({
  dates,
  initialRate,
  position,
  onSave,
  onClose,
}: DateEditPopoverProps) {
  const [rate, setRate] = useState(
    initialRate?.applied_rate?.toString() ?? initialRate?.base_rate?.toString() ?? ""
  );
  const [available, setAvailable] = useState(initialRate?.is_available !== false);
  const [minStay, setMinStay] = useState(initialRate?.min_stay ?? 1);
  const [saving, setSaving] = useState(false);
  const [rateError, setRateError] = useState("");

  const validateRate = (value: string): string => {
    if (!value) return "";
    const num = parseFloat(value);
    if (isNaN(num)) return "Must be a number";
    if (num <= 0) return "Must be greater than 0";
    if (num >= 10000) return "Must be less than $10,000";
    return "";
  };

  const handleRateChange = (value: string) => {
    setRate(value);
    setRateError(validateRate(value));
  };

  const handleSave = () => {
    const error = validateRate(rate);
    if (error) {
      setRateError(error);
      return;
    }
    setSaving(true);
    onSave({
      dates,
      applied_rate: rate ? parseFloat(rate) : null,
      is_available: available,
      min_stay: minStay,
    });
  };

  const label =
    dates.length === 1
      ? new Date(dates[0] + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : `${dates.length} dates selected`;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="absolute z-40 bg-neutral-0 rounded-lg shadow-xl border border-[var(--border)] p-4 w-64"
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-800">{label}</h3>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">
              Nightly Rate ($)
            </label>
            <input
              type="number"
              value={rate}
              onChange={(e) => handleRateChange(e.target.value)}
              className={`w-full px-3 py-1.5 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-coastal/30 focus:border-coastal ${
                rateError ? "border-red-400" : "border-[var(--border)]"
              }`}
              placeholder="0"
              min="0"
              step="1"
            />
            {rateError && (
              <p className="text-xs text-red-500 mt-1">{rateError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">
              Min Stay (nights)
            </label>
            <input
              type="number"
              value={minStay}
              onChange={(e) => setMinStay(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-coastal/30 focus:border-coastal"
              min="1"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-coastal focus:ring-coastal"
            />
            <span className="text-sm text-neutral-700">Available</span>
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!rateError}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-coastal rounded-lg hover:bg-deep-sea disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
