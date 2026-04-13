"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

interface ChannexPreview {
  channex_id: string;
  name: string;
  city: string;
  country: string;
  currency: string;
  is_active: boolean;
}

interface ImportResult {
  channex_id: string;
  property_id?: string;
  name?: string;
  status: "imported" | "imported_with_errors" | "error" | "unmatched";
  rooms?: number;
  bookings?: number;
  bookings_failed?: number;
  booking_errors?: string[];
  rates?: number;
  error?: string;
  reason?: "multiple_candidates" | string;
  candidates?: Array<{ id: string; name: string }>;
}

export default function ImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<ChannexPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);

  // Step 1: Test connection and fetch properties
  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/channex/import");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to connect to Channex");
        setLoading(false);
        return;
      }
      setProperties(data.properties);
      setSelected(new Set(data.properties.filter((p: ChannexPreview) => p.is_active).map((p: ChannexPreview) => p.channex_id)));
      setStep(1);
    } catch {
      setError("Failed to connect to Channex. Check your API key.");
    }
    setLoading(false);
  };

  // Step 2: Import selected properties
  const handleImport = async () => {
    setImporting(true);
    setStep(2);
    try {
      const res = await fetch("/api/channex/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channex_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setImporting(false);
        return;
      }
      setResults(data.results);
      setStep(3);
      toast("Import completed!");
    } catch {
      setError("Import failed. Please try again.");
    }
    setImporting(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === properties.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(properties.map((p) => p.channex_id)));
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/properties" className="text-sm text-neutral-400 hover:text-neutral-600">
          Properties
        </Link>
        <span className="text-neutral-300">/</span>
      </div>
      <h1 className="text-xl font-bold text-neutral-800 mb-1">Import from Channex</h1>
      <p className="text-neutral-500 mb-8">
        Import your properties, bookings, and rates from Channex
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {["Connect", "Select", "Import", "Done"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i < step
                  ? "bg-brand-500 text-white"
                  : i === step
                  ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500"
                  : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {i < step ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-sm ${i === step ? "text-neutral-800 font-medium" : "text-neutral-400"}`}>
              {label}
            </span>
            {i < 3 && <div className="w-6 h-px bg-neutral-200" />}
          </div>
        ))}
      </div>

      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
        {/* Step 0: Connect */}
        {step === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-neutral-800 mb-2">Connect to Channex</h2>
            <p className="text-neutral-500 text-sm mb-6 max-w-md mx-auto">
              We&apos;ll fetch your properties from Channex. Make sure your API key is configured
              in the environment variables.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-6 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Connecting..." : "Connect & Fetch Properties"}
            </button>
          </div>
        )}

        {/* Step 1: Select properties */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-800">
                {properties.length} properties found
              </h2>
              <button onClick={toggleAll} className="text-sm text-brand-500 hover:underline">
                {selected.size === properties.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            {properties.length === 0 ? (
              <p className="text-neutral-400 text-sm py-8 text-center">
                No properties found in your Channex account.
              </p>
            ) : (
              <div className="space-y-2 mb-6">
                {properties.map((p) => (
                  <label
                    key={p.channex_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(p.channex_id) ? "border-brand-200 bg-brand-50/30" : "border-[var(--border)] hover:border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.channex_id)}
                      onChange={() => toggleSelect(p.channex_id)}
                      className="w-4 h-4 rounded border-neutral-300 text-brand-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-800">{p.name}</p>
                      <p className="text-xs text-neutral-400">
                        {[p.city, p.country].filter(Boolean).join(", ")} · {p.currency}
                      </p>
                    </div>
                    {!p.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 text-neutral-500">
                        Inactive
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-neutral-100">
              <button onClick={() => setStep(0)} className="text-sm text-neutral-500 hover:text-neutral-700">
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selected.size === 0}
                className="px-6 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                Import {selected.size} {selected.size === 1 ? "Property" : "Properties"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Importing */}
        {step === 2 && importing && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-600 font-medium">Importing properties...</p>
            <p className="text-sm text-neutral-400 mt-1">
              Fetching properties, bookings, and rates from Channex
            </p>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-neutral-800 mb-4">Import Complete</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
            )}

            <div className="space-y-3 mb-6">
              {results.map((r) => (
                <ResultRow key={r.channex_id} result={r} />
              ))}
            </div>

            <button
              onClick={() => router.push("/properties")}
              className="w-full px-6 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
            >
              Go to Properties
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Per-result rendering
// ===========================================================================

function ResultRow({ result: r }: { result: ImportResult }) {
  const [expanded, setExpanded] = useState(false);
  const isQuotaError =
    typeof r.error === "string" &&
    (r.error.includes("property_quota_exceeded") || r.error.includes("free_tier_limit_exceeded"));

  // Status-specific color and label
  let pillClass = "bg-neutral-100 text-neutral-600";
  let pillLabel: string = r.status;
  if (r.status === "imported") { pillClass = "bg-[#eef5f0] text-[#1a3a2a]"; pillLabel = "Imported"; }
  else if (r.status === "imported_with_errors") { pillClass = "bg-[#fff4d6] text-[#b8860b]"; pillLabel = "Imported with warnings"; }
  else if (r.status === "error") { pillClass = isQuotaError ? "bg-[#fff4d6] text-[#b8860b]" : "bg-[#c44040]/10 text-[#c44040]"; pillLabel = isQuotaError ? "Plan limit" : "Failed"; }
  else if (r.status === "unmatched") { pillClass = "bg-[#eef5f0] text-[#3d6b52]"; pillLabel = "Needs your input"; }

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="flex items-start justify-between p-3 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 truncate">{r.name ?? r.channex_id}</p>

          {/* Clean success */}
          {r.status === "imported" && (
            <p className="text-xs text-neutral-400 mt-0.5">
              {r.rooms ?? 0} rooms · {r.bookings ?? 0} bookings · {r.rates ?? 0} rate entries
            </p>
          )}

          {/* Imported but with booking failures */}
          {r.status === "imported_with_errors" && (
            <>
              <p className="text-xs text-[#b8860b] mt-0.5">
                {r.bookings ?? 0} of {(r.bookings ?? 0) + (r.bookings_failed ?? 0)} bookings imported
                {r.bookings_failed ? ` — ${r.bookings_failed} failed` : ""}
              </p>
              {r.booking_errors && r.booking_errors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="text-[11px] text-[#b8860b] underline hover:no-underline mt-1"
                >
                  {expanded ? "Hide" : "Show"} {r.booking_errors.length} error{r.booking_errors.length === 1 ? "" : "s"}
                </button>
              )}
            </>
          )}

          {/* Quota-exceeded error gets an upgrade CTA */}
          {r.status === "error" && isQuotaError && (
            <>
              <p className="text-xs text-[#b8860b] mt-0.5">
                Your plan doesn&apos;t allow more properties.
              </p>
              <Link
                href="/settings"
                className="inline-block text-[11px] font-semibold text-white bg-[#c9a96e] hover:bg-[#d4bc8a] rounded px-2 py-1 mt-1.5"
              >
                Upgrade to Pro
              </Link>
            </>
          )}

          {/* Generic error */}
          {r.status === "error" && !isQuotaError && r.error && (
            <p className="text-xs text-[#c44040] mt-0.5 break-all">{r.error}</p>
          )}

          {/* Unmatched / multiple candidates — user needs to pick */}
          {r.status === "unmatched" && (
            <>
              <p className="text-xs text-[#3d6b52] mt-0.5">
                {r.reason === "multiple_candidates"
                  ? "Multiple Moora properties match this name. Pick the right one or import as a new property."
                  : "This property couldn't be auto-matched."}
              </p>
              {r.candidates && r.candidates.length > 0 && (
                <div className="mt-2">
                  <label className="block text-[10px] text-[#3d6b52] mb-1">Link to:</label>
                  <select
                    className="text-xs border border-[#efe9dd] rounded px-2 py-1 bg-white"
                    defaultValue=""
                  >
                    <option value="" disabled>Choose a property…</option>
                    {r.candidates.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-[#999] mt-1">
                    (Manual linking is coming soon — for now, rename one of the conflicting properties and re-import.)
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${pillClass}`}>
          {pillLabel}
        </span>
      </div>

      {/* Expanded booking errors list */}
      {expanded && r.booking_errors && (
        <div className="border-t border-[#efe9dd] bg-[#fff4d6]/30 px-3 py-2">
          <ul className="list-disc list-inside space-y-0.5">
            {r.booking_errors.map((err, i) => (
              <li key={i} className="text-[11px] text-[#b8860b] break-all">{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
