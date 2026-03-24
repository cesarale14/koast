export default function PricingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dynamic Pricing</h1>
      <p className="text-gray-500 mb-8">AI-powered pricing recommendations</p>

      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full mb-4">
          Phase 2
        </span>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Coming Soon</h3>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Dynamic pricing engine using AirROI market data, competitor analysis,
          and demand forecasting to optimize your nightly rates.
        </p>
      </div>
    </div>
  );
}
