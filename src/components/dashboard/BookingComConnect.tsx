"use client";

import { useState, useCallback } from "react";

type Step = "form" | "connecting" | "authorization" | "activating" | "success" | "ical" | "error";

interface BookingComConnectProps {
  propertyId: string;
  propertyName: string;
  onClose: () => void;
  onConnected: () => void;
}

const PROGRESS_STEPS = [
  "Creating channel connection",
  "Testing Booking.com authorization",
  "Syncing availability",
  "Setting up webhooks",
  "Activating channel",
];

export default function BookingComConnect({ propertyId, propertyName, onClose, onConnected }: BookingComConnectProps) {
  const [step, setStep] = useState<Step>("form");
  const [hotelId, setHotelId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [progressIdx, setProgressIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalResult, setIcalResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [rateDiscovery, setRateDiscovery] = useState<"not_needed" | "in_progress" | "complete" | "failed">("not_needed");
  const [parentRateCode, setParentRateCode] = useState<number | null>(null);

  // Poll the BDC status endpoint while the background parent-rate
  // discovery is running, so Sarah sees progress instead of a dead modal.
  // Stops on complete/failed/not_needed, or after 2 minutes as a safety
  // net in case the background task crashes.
  const pollRateDiscovery = useCallback(async () => {
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      try {
        const res = await fetch(`/api/channels/connect-booking-com/status/${propertyId}`);
        if (res.ok) {
          const data = await res.json();
          setRateDiscovery(data.rate_discovery);
          setParentRateCode(data.parent_rate_plan_code);
          if (data.rate_discovery === "complete" || data.rate_discovery === "failed" || data.rate_discovery === "not_needed") {
            return;
          }
        }
      } catch { /* keep polling */ }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }, [propertyId]);

  const doActivate = useCallback(async (chId: string) => {
    setStep("activating");
    setProgressIdx(2);

    const actRes = await fetch("/api/channels/connect-booking-com/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, channelId: chId }),
    });
    const actData = await actRes.json();
    if (!actRes.ok) throw new Error(actData.error || "Failed to activate");

    // /activate returns immediately now. If the server kicked off an
    // async parent-rate probe, start polling the status endpoint. Don't
    // block the ical step on this — the poll runs alongside.
    setRateDiscovery(actData.rate_discovery ?? "not_needed");
    setParentRateCode(actData.parent_rate_plan_code ?? null);
    if (actData.rate_discovery === "in_progress") {
      pollRateDiscovery().catch(() => { /* swallow */ });
    }

    setProgressIdx(4);
    setStep("ical");
  }, [propertyId, pollRateDiscovery]);

  const handleConnect = useCallback(async () => {
    if (!hotelId.trim()) return;
    setStep("connecting");
    setProgressIdx(0);

    try {
      const res = await fetch("/api/channels/connect-booking-com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, hotelId: hotelId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create channel");

      setChannelId(data.channelId);
      setProgressIdx(1);

      const testRes = await fetch("/api/channels/connect-booking-com/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: data.channelId, propertyId }),
      });
      const testData = await testRes.json();

      if (!testData.connected) {
        setStep("authorization");
        return;
      }

      await doActivate(data.channelId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStep("error");
    }
  }, [hotelId, propertyId, doActivate]);

  const handleRetryTest = useCallback(async () => {
    setStep("connecting");
    setProgressIdx(1);

    try {
      const testRes = await fetch("/api/channels/connect-booking-com/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, propertyId }),
      });
      const testData = await testRes.json();

      if (!testData.connected) {
        setStep("authorization");
        return;
      }

      await doActivate(channelId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStep("error");
    }
  }, [channelId, propertyId, doActivate]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#003580] flex items-center justify-center">
                <span className="text-white text-xs font-bold">B.</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#222]">Connect Booking.com</h2>
                <p className="text-[11px] text-[#999]">{propertyName}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5">
            {/* ---- FORM ---- */}
            {step === "form" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#333] mb-1.5">Hotel ID</label>
                  <input
                    type="text"
                    value={hotelId}
                    onChange={(e) => setHotelId(e.target.value)}
                    placeholder="e.g. 1234567"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003580]/30 focus:border-[#003580] transition-colors"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#999] mt-1.5">
                    Find this in your Booking.com Extranet under Property → General Info → Property ID
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={!hotelId.trim()}
                  className="w-full py-2.5 text-sm font-medium text-white bg-[#003580] rounded-lg hover:bg-[#00265c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Connect
                </button>
              </div>
            )}

            {/* ---- CONNECTING / ACTIVATING ---- */}
            {(step === "connecting" || step === "activating") && (
              <div className="space-y-3">
                {PROGRESS_STEPS.map((label, i) => {
                  const isDone = i < progressIdx;
                  const isCurrent = i === progressIdx;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      {isDone ? (
                        <div className="w-5 h-5 rounded-full bg-[#1a3a2a] flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isCurrent ? (
                        <div className="w-5 h-5 rounded-full border-2 border-[#003580] border-t-transparent animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${isDone ? "text-[#1a3a2a]" : isCurrent ? "text-[#222] font-medium" : "text-[#ccc]"}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ---- AUTHORIZATION REQUIRED ---- */}
            {step === "authorization" && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="text-amber-500 text-lg flex-shrink-0">⚠</span>
                    <div>
                      <h3 className="text-sm font-semibold text-amber-800 mb-1.5">Authorize Channex.io in Booking.com</h3>
                      <p className="text-[13px] text-amber-700 leading-relaxed">
                        Booking.com requires one-time authorization before we can sync rates, availability, and reservations for hotel ID <strong>{hotelId}</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#3d6b52] mb-3">
                    Step-by-step
                  </h4>
                  <ol className="space-y-3 text-[13px] text-[#555]">
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0 w-5">1.</span>
                      <div className="flex-1">
                        <a
                          href="https://admin.booking.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#003580] font-semibold underline hover:no-underline"
                        >
                          Open admin.booking.com
                        </a>{" "}
                        in a new tab and log in to the account for hotel <strong>{hotelId}</strong>.
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0 w-5">2.</span>
                      <div className="flex-1">
                        Click your profile icon (top right) → <strong>Account</strong> → <strong>Connectivity provider</strong>.
                        <p className="text-[11px] text-[#999] mt-0.5">
                          On some accounts the path is <strong>Inbox → Connectivity</strong> or <strong>Settings → Connectivity provider</strong>.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0 w-5">3.</span>
                      <div className="flex-1">
                        Search for <strong>&ldquo;Channex.io&rdquo;</strong> (or <strong>&ldquo;Channex&rdquo;</strong>) in the provider list.
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0 w-5">4.</span>
                      <div className="flex-1">
                        Click <strong>Select</strong> → agree to the terms → confirm. Booking.com will show{" "}
                        <strong>&ldquo;You currently have an active connection with: Channex.io&rdquo;</strong> when done.
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0 w-5">5.</span>
                      <div className="flex-1">
                        Return to this tab and click <strong>Retry connection</strong> below.
                        <p className="text-[11px] text-[#999] mt-0.5">
                          Booking.com may take up to 60 seconds to propagate the authorization.
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>

                {/* MFA / access-blocked fallback — the situation that happened
                    with Modern House. If the user can't complete BDC's
                    connectivity provider flow because of MFA or missing
                    permissions, they can still sync availability via iCal
                    to prevent overbookings. */}
                <details className="bg-[#f8f6f1] border border-[#efe9dd] rounded-lg p-3">
                  <summary className="text-[12px] font-semibold text-[#3d6b52] cursor-pointer hover:text-[#1a3a2a]">
                    Can&apos;t complete authorization? (MFA, missing permissions, or blocked account)
                  </summary>
                  <div className="mt-3 text-[12px] text-[#555] leading-relaxed space-y-2">
                    <p>
                      If Booking.com&apos;s connectivity provider page is blocked by MFA, or
                      your admin account doesn&apos;t have permission to change connectivity
                      providers, you have two options:
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-2">
                      <li>
                        Ask the primary hotel owner or account admin (whoever set up the
                        Booking.com listing) to complete steps 1–4 above on your behalf.
                      </li>
                      <li>
                        In the meantime, use the <strong>Booking.com iCal feed</strong> to
                        import reservations and prevent overbookings. From
                        admin.booking.com: <strong>Rates & Availability → Sync calendars →
                        Export calendar</strong>, copy the URL, and paste it in Koast&apos;s
                        property settings → Calendar Connections. Koast will pull BDC
                        bookings every 15 minutes and automatically block those dates on
                        Airbnb and Vrbo.
                      </li>
                    </ol>
                    <p className="text-[11px] text-[#999]">
                      Note: iCal is one-way (Koast reads BDC bookings) and doesn&apos;t
                      push rates to Booking.com — you&apos;ll still need to manage pricing
                      from the Booking.com extranet until the Channex connection is
                      authorized.
                    </p>
                  </div>
                </details>

                <button
                  onClick={handleRetryTest}
                  className="w-full py-2.5 text-sm font-medium text-white bg-[#003580] rounded-lg hover:bg-[#00265c] transition-colors"
                >
                  Retry connection
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 text-[12px] font-medium text-[#666] hover:text-[#222] transition-colors"
                >
                  I&apos;ll finish this later
                </button>
              </div>
            )}

            {/* ---- ICAL — import existing bookings ---- */}
            {step === "ical" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#eef5f0] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#1a3a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#222]">Channel Connected</h3>
                    <p className="text-[11px] text-[#999]">Hotel ID: {hotelId}</p>
                  </div>
                </div>

                <div className="bg-[#f8f6f1] rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-[#222] mb-1.5">Import existing bookings</h4>
                  <p className="text-[12px] text-[#666] leading-relaxed mb-3">
                    Paste your Booking.com iCal URL to import existing reservations into your calendar.
                  </p>
                  <ol className="space-y-1.5 text-[12px] text-[#555] mb-3">
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">1.</span>
                      <span>Log into <strong>admin.booking.com</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">2.</span>
                      <span>Go to <strong>Rates &amp; Availability → Sync calendars</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">3.</span>
                      <span>Click <strong>Export</strong> and copy the iCal URL</span>
                    </li>
                  </ol>
                  <input
                    type="url"
                    value={icalUrl}
                    onChange={(e) => { setIcalUrl(e.target.value); setIcalResult(null); }}
                    placeholder="https://admin.booking.com/...ics"
                    className="w-full px-3 py-2 text-sm border border-[#efe9dd] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a2a]/20 focus:border-[#1a3a2a] bg-white"
                  />
                  {icalResult && (
                    <p className={`text-xs mt-1.5 ${icalResult.ok ? "text-[#3d6b52]" : "text-[#c44040]"}`}>
                      {icalResult.message}
                    </p>
                  )}
                </div>

                <button
                  onClick={async () => {
                    if (!icalUrl.trim()) { setStep("success"); return; }
                    setIcalLoading(true);
                    try {
                      const res = await fetch("/api/ical/add", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ propertyId, url: icalUrl.trim(), platform: "booking_com" }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setIcalResult({ ok: true, message: `Imported ${data.bookings_found ?? 0} bookings` });
                        setTimeout(() => setStep("success"), 1200);
                      } else {
                        setIcalResult({ ok: false, message: data.error || "Failed to import" });
                      }
                    } catch {
                      setIcalResult({ ok: false, message: "Network error" });
                    } finally {
                      setIcalLoading(false);
                    }
                  }}
                  disabled={icalLoading}
                  className="w-full py-2.5 text-sm font-medium text-white bg-[#003580] rounded-lg hover:bg-[#00265c] disabled:opacity-50 transition-colors"
                >
                  {icalLoading ? "Importing..." : icalUrl.trim() ? "Import Bookings" : "Skip for now"}
                </button>

                <button
                  onClick={() => setStep("success")}
                  className="w-full py-2 text-sm font-medium text-[#999] hover:text-[#666] transition-colors"
                >
                  Skip — I&apos;ll do this later
                </button>
              </div>
            )}

            {/* ---- SUCCESS ---- */}
            {step === "success" && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-[#eef5f0] flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-[#1a3a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#222]">Booking.com Connected</h3>
                  <p className="text-sm text-[#999] mt-1">Hotel ID: {hotelId}</p>
                </div>
                <p className="text-[13px] text-[#666] leading-relaxed">
                  New bookings will sync automatically via Channex. Calendar availability is managed by Koast.
                </p>

                {/* Parent rate discovery progress — runs in the background
                    after /activate. Shows a small live status so Sarah
                    knows what's happening without blocking the modal. */}
                {rateDiscovery === "in_progress" && (
                  <div className="rounded-lg border border-[#efe9dd] bg-[#f8f6f1] px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-[#3d6b52] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[12px] font-semibold text-[#1a3a2a]">Discovering rate configuration…</span>
                    </div>
                    <p className="text-[11px] text-[#3d6b52] mt-1 leading-snug">
                      Finding the right Booking.com rate plan code. This takes up to 90 seconds and runs in the background — you can close this modal and keep working.
                    </p>
                  </div>
                )}
                {rateDiscovery === "complete" && parentRateCode != null && (
                  <div className="rounded-lg border border-[#eef5f0] bg-[#eef5f0]/40 px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-[#1a3a2a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[12px] font-semibold text-[#1a3a2a]">Rate configuration ready</span>
                    </div>
                    <p className="text-[11px] text-[#3d6b52] mt-1">
                      Using parent rate plan {parentRateCode}. Pushes will sync to Booking.com.
                    </p>
                  </div>
                )}
                {rateDiscovery === "failed" && (
                  <div className="rounded-lg border border-[#b8860b]/30 bg-[#b8860b]/5 px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-[#b8860b]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.515 2.625H3.72c-1.345 0-2.188-1.458-1.515-2.625L8.485 2.495zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z" />
                      </svg>
                      <span className="text-[12px] font-semibold text-[#b8860b]">Rate plan setup needs attention</span>
                    </div>
                    <p className="text-[11px] text-[#b8860b]/90 mt-1">
                      We couldn&apos;t automatically find the right parent rate code. Rates won&apos;t sync to Booking.com until this is resolved — please contact support.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => { onConnected(); onClose(); }}
                  className="w-full py-2.5 text-sm font-medium text-white bg-[#1a3a2a] rounded-lg hover:bg-[#264d38] transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* ---- ERROR ---- */}
            {step === "error" && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">Connection Failed</h3>
                  <p className="text-[13px] text-red-600">{errorMsg}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep("form"); setErrorMsg(""); }}
                    className="flex-1 py-2 text-sm font-medium text-[#666] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
