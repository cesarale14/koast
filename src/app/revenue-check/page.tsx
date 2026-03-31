"use client";

import { useState } from "react";
import Link from "next/link";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import Logo from "@/components/ui/Logo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

export default function RevenueCheckPage() {
  const [step, setStep] = useState<"form" | "loading" | "results" | "captured">("form");
  const [form, setForm] = useState({ address: "", city: "", state: "", zip: "", bedrooms: "2", current_rate: "", property_type: "entire_home" });
  const [result, setResult] = useState<AnyData>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const analyze = async () => {
    setStep("loading");
    setError(null);
    setLoadingStep(0);

    const steps = ["Finding your location...", "Searching comparable properties...", "Analyzing market rates...", "Calculating revenue opportunity..."];
    const timer = setInterval(() => setLoadingStep((s) => Math.min(s + 1, steps.length - 1)), 1200);

    try {
      const res = await fetch("/api/revenue-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          bedrooms: parseInt(form.bedrooms),
          current_rate: parseFloat(form.current_rate),
        }),
      });
      clearInterval(timer);
      const data = await res.json();
      if (!res.ok) { setError(data.error); setStep("form"); return; }
      setResult(data);
      setStep("results");
    } catch {
      clearInterval(timer);
      setError("Something went wrong. Please try again.");
      setStep("form");
    }
  };

  const captureLead = async () => {
    if (!email) return;
    await fetch("/api/revenue-check/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        city: result?.location?.city,
        state: result?.location?.state,
        bedrooms: parseInt(form.bedrooms),
        current_rate: parseFloat(form.current_rate),
        estimated_opportunity: result?.annual_opportunity,
        market_adr: result?.market_adr,
      }),
    });
    setStep("captured");
  };

  const loadingSteps = ["Finding your location...", "Searching comparable properties...", "Analyzing market rates...", "Calculating revenue opportunity..."];

  return (
    <div className="min-h-screen bg-neutral-0">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Logo variant="full" size={32} />
        <Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors">
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      {step === "form" && (
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 leading-tight mb-4">
              How much revenue is your rental
              <span className="text-brand-500"> leaving on the table?</span>
            </h1>
            <p className="text-lg text-neutral-500 max-w-2xl mx-auto">
              Get a free 9-signal AI pricing analysis in 30 seconds. No signup required.
            </p>
          </div>

          <div className="max-w-lg mx-auto bg-neutral-0 border border-[var(--border)] rounded-lg shadow-xl p-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Property Address</label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                  onSelect={(r) => setForm({ ...form, address: r.address, city: r.city, state: r.state, zip: r.zip })}
                  placeholder="Start typing an address..."
                  className="w-full px-4 py-3 h-12 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">City</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-4 py-3 h-12 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Tampa" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">State</label>
                  <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-4 py-3 h-12 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="FL" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">ZIP</label>
                  <input type="text" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    className="w-full px-4 py-3 h-12 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="33602" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Bedrooms</label>
                  <select value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                    className="w-full px-4 py-3 h-12 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} BR</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Current Nightly Rate</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-neutral-400">$</span>
                    <input type="number" value={form.current_rate} onChange={(e) => setForm({ ...form, current_rate: e.target.value })}
                      className="w-full pl-8 pr-4 py-3 h-12 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      placeholder="150" />
                  </div>
                </div>
              </div>

              <button
                onClick={analyze}
                disabled={!form.current_rate || !form.city}
                className="revenue-check-cta w-full py-4 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-lg mt-2"
              >
                Analyze My Property
              </button>
              <p className="text-center text-xs text-neutral-400">Free. No signup required.</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div className="max-w-md mx-auto px-6 pt-32 text-center">
          <div className="w-16 h-16 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-8" />
          <div className="space-y-3">
            {loadingSteps.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 transition-opacity duration-500 ${i <= loadingStep ? "opacity-100" : "opacity-20"}`}>
                {i < loadingStep ? (
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i === loadingStep ? (
                  <div className="w-5 h-5 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-neutral-300" />
                )}
                <span className="text-sm text-neutral-600">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {step === "results" && result && (
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-20">
          <div className="text-center mb-10">
            <p className="text-sm text-neutral-500 mb-2">Your results for {result.location?.city}, {result.location?.state}</p>
            <h2 className="text-3xl font-bold text-neutral-900">Your Revenue Analysis</h2>
          </div>

          {/* Rate comparison */}
          <div className="bg-neutral-0 border border-[var(--border)] rounded-lg shadow-md p-8 mb-6">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-6">Your Rate vs Market</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl sm:text-4xl font-bold font-mono text-neutral-900">${result.your_rate}</div>
                <div className="text-xs sm:text-sm text-neutral-500 mt-1">Your Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-4xl font-bold font-mono text-brand-500">${result.market_adr}</div>
                <div className="text-xs sm:text-sm text-neutral-500 mt-1">Market Avg</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-4xl font-bold font-mono text-emerald-500">${result.top_performers}</div>
                <div className="text-xs sm:text-sm text-neutral-500 mt-1">Top Perf.</div>
              </div>
            </div>
            {/* Bar visualization */}
            <div className="relative h-4 bg-neutral-100 rounded-full overflow-hidden">
              <div className="absolute h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full" style={{ width: "100%" }} />
              <div className="absolute top-0 h-full w-0.5 bg-neutral-900" style={{ left: `${Math.min(95, Math.max(5, (result.your_rate / (result.top_performers * 1.2)) * 100))}%` }}>
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-neutral-900 font-bold whitespace-nowrap">You</div>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-neutral-400 mt-1">
              <span>Below Market</span>
              <span>Above Market</span>
            </div>
          </div>

          {/* Revenue opportunity */}
          {result.annual_opportunity > 0 && (
            <div className="card-elevated bg-brand-50 border border-brand-200 rounded-lg p-8 mb-6 text-center">
              <p className="text-sm text-brand-600 font-medium mb-2">ESTIMATED ANNUAL REVENUE OPPORTUNITY</p>
              <p className="text-4xl font-bold font-mono text-brand-500 mb-2">${result.annual_opportunity.toLocaleString()}</p>
              <p className="text-sm text-neutral-500">
                Based on ${result.suggested_rate}/night suggested rate x {Math.round(365 * (result.market_occupancy / 100))} booked nights
              </p>
            </div>
          )}

          {/* Market stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Market ADR", value: `$${result.market_adr}` },
              { label: "Occupancy", value: `${result.market_occupancy}%` },
              { label: "Your Percentile", value: result.percentile <= 10 ? "Below avg" : result.percentile >= 75 ? "Top 25%" : `${result.percentile}th` },
              { label: "Active Listings", value: result.active_listings?.toLocaleString() ?? "---" },
            ].map((s) => (
              <div key={s.label} className="stat-card relative bg-neutral-0 border border-[var(--border)] rounded-lg p-4 text-center">
                <p className="text-2xl font-bold font-mono text-neutral-900">{s.value}</p>
                <p className="text-xs text-neutral-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Comp preview */}
          {result.comp_preview?.length > 0 && (
            <div className="bg-neutral-0 border border-[var(--border)] rounded-lg p-6 mb-6">
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-4">
                Top Comparable Properties (out of {result.comp_count})
              </h3>
              <div className="space-y-0">
                {result.comp_preview.map((c: AnyData) => (
                  <div key={c.rank} className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0 hover:bg-neutral-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-xs text-neutral-500">
                        {c.rank}
                      </span>
                      <div>
                        <p className="text-sm text-neutral-900">{c.name}</p>
                        <p className="text-xs text-neutral-400">{c.bedrooms} BR</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold font-mono text-neutral-900">${c.adr}/night</p>
                      <p className="text-xs text-neutral-500">{c.occupancy}% occ</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 30-day rate preview */}
          <div className="bg-neutral-0 border border-[var(--border)] rounded-lg p-6 mb-8">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-4">
              Your Optimal Rate — Next 30 Days
            </h3>
            <div className="grid grid-cols-10 gap-1">
              {result.rate_preview?.map((r: AnyData) => {
                const color = r.status === "good" ? "bg-brand-100" : r.status === "close" ? "bg-amber-100" : "bg-red-100";
                const d = new Date(r.date + "T00:00:00");
                return (
                  <div key={r.date} className={`${color} rounded p-1 text-center`}
                    title={`${r.date}: Suggested $${r.suggested}`}>
                    <div className="text-[9px] text-neutral-500">{d.getDate()}</div>
                    <div className="text-[10px] font-semibold font-mono text-neutral-900">${r.suggested}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-[10px] text-neutral-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-brand-100" /> Priced right</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-100" /> Close</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-100" /> Leaving money</span>
            </div>
          </div>

          {/* Email capture */}
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-8 text-center mb-12">
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Get your full report + weekly market updates</h3>
            <p className="text-sm text-neutral-500 mb-4">We&apos;ll send a detailed PDF breakdown and weekly pricing insights for your market.</p>
            <div className="flex gap-2 max-w-md mx-auto">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 py-3 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="you@email.com" />
              <button onClick={captureLead} disabled={!email}
                className="btn-primary-3d px-6 py-3 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-40">
                Send Report
              </button>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h3 className="text-2xl font-bold text-neutral-900 mb-3">Ready to stop leaving money on the table?</h3>
            <p className="text-neutral-500 max-w-xl mx-auto mb-6">
              StayCommand automatically optimizes your pricing using AI, market data, and local events — so you earn more on every booking.
            </p>
            <Link href="/signup"
              className="revenue-check-cta inline-flex px-8 py-4 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 text-lg">
              Start Free
            </Link>
            <div className="flex justify-center gap-8 mt-8 text-sm text-neutral-500">
              {["AI Pricing Engine", "Guest Messaging", "Turnover Ops", "Market Analytics"].map((f) => (
                <span key={f} className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Email captured confirmation */}
      {step === "captured" && (
        <div className="max-w-md mx-auto px-6 pt-32 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-lg flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Check your email!</h2>
          <p className="text-neutral-500 mb-8">We&apos;ll send your full revenue report shortly.</p>
          <Link href="/signup" className="btn-primary-3d inline-flex px-8 py-3 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600">
            Create Your Free Account
          </Link>
        </div>
      )}
    </div>
  );
}
