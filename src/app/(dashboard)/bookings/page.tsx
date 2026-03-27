export default function BookingsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 mb-1">Bookings</h1>
          <p className="text-neutral-500">All reservations across your properties</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-600">
            <option>All Properties</option>
          </select>
          <select className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-600">
            <option>All Statuses</option>
            <option>Confirmed</option>
            <option>Pending</option>
            <option>Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-neutral-0 rounded-lg border border-[var(--border)]">
        <div className="px-6 py-4 border-b border-neutral-100">
          <div className="grid grid-cols-6 text-xs font-medium text-neutral-400 uppercase tracking-wider">
            <span>Guest</span>
            <span>Property</span>
            <span>Check-in</span>
            <span>Check-out</span>
            <span>Source</span>
            <span>Status</span>
          </div>
        </div>
        <div className="p-12 text-center">
          <p className="text-neutral-400 text-sm">
            No bookings yet. They will appear here once synced from Channex.
          </p>
        </div>
      </div>
    </div>
  );
}
