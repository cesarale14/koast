export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Analytics</h1>
      <p className="text-gray-500 mb-8">Market analysis and performance metrics</p>

      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full mb-4">
          Phase 2
        </span>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Coming Soon</h3>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Revenue analytics, occupancy trends, competitor benchmarking,
          and market insights powered by AirROI data.
        </p>
      </div>
    </div>
  );
}
