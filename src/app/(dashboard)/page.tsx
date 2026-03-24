export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-8">Overview of your properties and bookings</p>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: "Total Properties", value: "—", sub: "Connect via Channex" },
          { label: "Active Bookings", value: "—", sub: "Sync pending" },
          { label: "Occupancy Rate", value: "—%", sub: "This month" },
          { label: "Revenue (MTD)", value: "$—", sub: "This month" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upcoming Check-ins
          </h2>
          <p className="text-gray-400 text-sm">
            No bookings synced yet. Connect your Channex account to get started.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Today&apos;s Activity
          </h2>
          <p className="text-gray-400 text-sm">
            Activity feed will appear here once properties are connected.
          </p>
        </div>
      </div>
    </div>
  );
}
