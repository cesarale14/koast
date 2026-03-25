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

  const handleSave = () => {
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
        className="absolute z-40 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-64"
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Nightly Rate ($)
            </label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="0"
              min="0"
              step="1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Min Stay (nights)
            </label>
            <input
              type="number"
              value={minStay}
              onChange={(e) => setMinStay(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              min="1"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Available</span>
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
