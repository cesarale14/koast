"use client";

import { useState } from "react";
import { Globe, CreditCard, Users, CheckCircle } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Custom branded website for your property",
    description: "Beautiful, mobile-optimized booking pages that match your brand. No coding required.",
  },
  {
    icon: CreditCard,
    title: "Built-in booking engine with Stripe payments",
    description: "Accept reservations and collect payments directly. No OTA commissions on direct bookings.",
  },
  {
    icon: Users,
    title: "Guest CRM with automated remarketing emails",
    description: "Build guest relationships. Send pre-arrival info, post-stay reviews, and return-visit offers automatically.",
  },
];

export default function FrontdeskPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/frontdesk/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 md:py-16">
      {/* Badge */}
      <div className="flex justify-center mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-light text-deep-sea text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-lagoon animate-pulse" />
          Coming Soon
        </span>
      </div>

      {/* Headline */}
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
          Frontdesk
          <span className="text-coastal"> — Your Direct Booking Website</span>
        </h1>
        <p className="text-lg text-neutral-500 max-w-xl mx-auto">
          Accept bookings directly from guests. Skip OTA commissions. Own your guest relationships.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="bg-neutral-0 border border-[var(--border)] rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-success-light flex items-center justify-center mx-auto mb-4">
                <Icon size={24} className="text-coastal" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-bold text-neutral-800 mb-2">{f.title}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">{f.description}</p>
            </div>
          );
        })}
      </div>

      {/* Savings callout */}
      <div className="bg-success-light border border-success-light rounded-xl p-8 text-center mb-12">
        <p className="text-3xl font-bold font-mono text-deep-sea mb-2">Save 15-20%</p>
        <p className="text-sm text-neutral-600">
          on every direct booking by eliminating OTA commission fees. Typical Airbnb host fees are 3-5%, and guest fees add another 12-14%.
        </p>
      </div>

      {/* Email capture */}
      <div className="bg-neutral-0 border border-[var(--border)] rounded-xl p-8 text-center">
        {submitted ? (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-success-light flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={24} className="text-tideline" />
            </div>
            <h3 className="text-lg font-bold text-neutral-800 mb-2">You&apos;re on the list!</h3>
            <p className="text-sm text-neutral-500">We&apos;ll notify you as soon as Frontdesk is ready to launch.</p>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-bold text-neutral-800 mb-2">Get notified when Frontdesk launches</h3>
            <p className="text-sm text-neutral-500 mb-6">Be the first to create your direct booking website.</p>
            <div className="flex gap-2 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="you@email.com"
                className="flex-1 px-4 py-3 bg-neutral-0 border border-[var(--border)] rounded-lg text-neutral-900 placeholder-neutral-400 outline-none focus:border-coastal focus:ring-1 focus:ring-coastal"
              />
              <button
                onClick={handleSubmit}
                disabled={!email || submitting}
                className="px-6 py-3 bg-coastal text-white font-semibold rounded-lg hover:bg-deep-sea disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "..." : "Notify Me"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
