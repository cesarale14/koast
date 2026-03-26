"use client";

import { useState } from "react";
import Link from "next/link";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <span className="text-xl font-bold text-white">StayCommand</span>
        <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      {step === "form" && (
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
              How much revenue is your rental
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400"> leaving on the table?</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Get a free AI-powered pricing analysis in 30 seconds. No signup required.
            </p>
          </div>

          <div className="max-w-lg mx-auto bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Property Address</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="123 Main Street" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">City</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500" placeholder="Tampa" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">State</label>
                  <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500" placeholder="FL" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">ZIP</label>
                  <input type="text" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500" placeholder="33602" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Bedrooms</label>
                  <select value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n} className="bg-slate-900">{n} BR</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Current Nightly Rate</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-500">$</span>
                    <input type="number" value={form.current_rate} onChange={(e) => setForm({ ...form, current_rate: e.target.value })}
                      className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500"
                      placeholder="150" />
                  </div>
                </div>
              </div>

              <button
                onClick={analyze}
                disabled={!form.current_rate || !form.city}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg mt-2"
              >
                Analyze My Property
              </button>
              <p className="text-center text-xs text-slate-500">Free. No signup required.</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div className="max-w-md mx-auto px-6 pt-32 text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
          <div className="space-y-3">
            {loadingSteps.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 transition-opacity duration-500 ${i <= loadingStep ? "opacity-100" : "opacity-20"}`}>
                {i < loadingStep ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i === loadingStep ? (
                  <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-slate-700" />
                )}
                <span className="text-sm text-slate-300">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {step === "results" && result && (
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-20">
          <div className="text-center mb-10">
            <p className="text-sm text-slate-400 mb-2">Your results for {result.location?.city}, {result.location?.state}</p>
            <h2 className="text-3xl font-bold text-white">Your Revenue Analysis</h2>
          </div>

          {/* Rate comparison */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 mb-6">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-6">Your Rate vs Market</h3>
            <div className="flex items-end justify-center gap-8 mb-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-white">${result.your_rate}</div>
                <div className="text-sm text-slate-400 mt-1">Your Rate</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-400">${result.market_adr}</div>
                <div className="text-sm text-slate-400 mt-1">Market Average</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-emerald-400">${result.top_performers}</div>
                <div className="text-sm text-slate-400 mt-1">Top Performers</div>
              </div>
            </div>
            {/* Bar visualization */}
            <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden">
              <div className="absolute h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full" style={{ width: "100%" }} />
              <div className="absolute top-0 h-full w-0.5 bg-white" style={{ left: `${Math.min(95, Math.max(5, (result.your_rate / (result.top_performers * 1.2)) * 100))}%` }}>
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-white font-bold whitespace-nowrap">You</div>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>Below Market</span>
              <span>Above Market</span>
            </div>
          </div>

          {/* Revenue opportunity */}
          {result.annual_opportunity > 0 && (
            <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-8 mb-6 text-center">
              <p className="text-sm text-emerald-400 font-medium mb-2">ESTIMATED ANNUAL REVENUE OPPORTUNITY</p>
              <p className="text-5xl font-bold text-white mb-2">${result.annual_opportunity.toLocaleString()}</p>
              <p className="text-sm text-slate-400">
                Based on ${result.suggested_rate}/night suggested rate × {Math.round(365 * (result.market_occupancy / 100))} booked nights
              </p>
            </div>
          )}

          {/* Market stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Market ADR", value: `$${result.market_adr}` },
              { label: "Occupancy", value: `${result.market_occupancy}%` },
              { label: "Your Percentile", value: result.percentile <= 10 ? "Below avg" : result.percentile >= 75 ? "Top 25%" : `${result.percentile}th` },
              { label: "Active Listings", value: result.active_listings?.toLocaleString() ?? "—" },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Comp preview */}
          {result.comp_preview?.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                Top Comparable Properties (out of {result.comp_count})
              </h3>
              <div className="space-y-2">
                {result.comp_preview.map((c: AnyData) => (
                  <div key={c.rank} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-400">
                        {c.rank}
                      </span>
                      <div>
                        <p className="text-sm text-white">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.bedrooms} BR</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">${c.adr}/night</p>
                      <p className="text-xs text-slate-400">{c.occupancy}% occ</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 30-day rate preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
              Your Optimal Rate — Next 30 Days
            </h3>
            <div className="grid grid-cols-10 gap-1">
              {result.rate_preview?.map((r: AnyData) => {
                const color = r.status === "good" ? "bg-emerald-500/40" : r.status === "close" ? "bg-amber-500/40" : "bg-red-500/40";
                const d = new Date(r.date + "T00:00:00");
                return (
                  <div key={r.date} className={`${color} rounded p-1 text-center`}
                    title={`${r.date}: Suggested $${r.suggested}`}>
                    <div className="text-[9px] text-slate-400">{d.getDate()}</div>
                    <div className="text-[10px] font-semibold text-white">${r.suggested}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/40" /> Priced right</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/40" /> Close</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/40" /> Leaving money</span>
            </div>
          </div>

          {/* Email capture */}
          <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-2xl p-8 text-center mb-12">
            <h3 className="text-xl font-bold text-white mb-2">Get your full report + weekly market updates</h3>
            <p className="text-sm text-slate-400 mb-4">We&apos;ll send a detailed PDF breakdown and weekly pricing insights for your market.</p>
            <div className="flex gap-2 max-w-md mx-auto">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-400"
                placeholder="you@email.com" />
              <button onClick={captureLead} disabled={!email}
                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 disabled:opacity-40 transition-colors">
                Send Report
              </button>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white mb-3">Ready to stop leaving money on the table?</h3>
            <p className="text-slate-400 max-w-xl mx-auto mb-6">
              StayCommand automatically optimizes your pricing using AI, market data, and local events — so you earn more on every booking.
            </p>
            <Link href="/signup"
              className="inline-flex px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all text-lg">
              Start Free
            </Link>
            <div className="flex justify-center gap-8 mt-8 text-sm text-slate-400">
              {["AI Pricing Engine", "Guest Messaging", "Turnover Ops", "Market Analytics"].map((f) => (
                <span key={f} className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Check your email!</h2>
          <p className="text-slate-400 mb-8">We&apos;ll send your full revenue report shortly.</p>
          <Link href="/signup" className="inline-flex px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors">
            Create Your Free Account
          </Link>
        </div>
      )}
    </div>
  );
}
