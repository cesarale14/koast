"use client";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: LucideIcon;
}

export default function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
}: StatCardProps) {
  const changeBg =
    changeType === "positive"
      ? "bg-brand-50 text-brand-600"
      : changeType === "negative"
        ? "bg-danger-light text-danger"
        : "bg-neutral-50 text-neutral-400";

  return (
    <div className="stat-card relative bg-neutral-0 rounded-xl p-5 md:p-6">
      {/* Icon */}
      {Icon && (
        <div className="absolute top-5 right-5 md:top-6 md:right-6 text-neutral-200">
          <Icon size={20} strokeWidth={1.5} />
        </div>
      )}

      {/* Label */}
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2.5">
        {label}
      </p>

      {/* Value */}
      <p className="text-3xl font-bold text-neutral-800 font-mono tracking-tight" data-stat>
        {value}
      </p>

      {/* Change badge */}
      {change && (
        <span
          className={`inline-flex items-center mt-2 px-2 py-0.5 text-xs font-medium rounded-full ${changeBg}`}
        >
          {change}
        </span>
      )}
    </div>
  );
}
