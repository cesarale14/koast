"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface RevenueChartProps {
  data: { month: string; revenue: number }[];
}

export default function RevenueChart({ data }: RevenueChartProps) {
  const hasRevenue = data.length > 0 && data.some((d) => d.revenue > 0);
  if (!hasRevenue) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-neutral-500">Revenue data will appear once bookings sync</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#78716c" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#78716c" }}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-md)",
          }}
        />
        <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
