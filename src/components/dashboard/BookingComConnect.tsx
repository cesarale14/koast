"use client";

import { useState, useCallback } from "react";

type Step = "form" | "connecting" | "authorization" | "activating" | "success" | "error";

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

    setProgressIdx(4);
    setStep("success");
  }, [propertyId]);

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
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isCurrent ? (
                        <div className="w-5 h-5 rounded-full border-2 border-[#003580] border-t-transparent animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${isDone ? "text-emerald-700" : isCurrent ? "text-[#222] font-medium" : "text-[#ccc]"}`}>
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
                      <h3 className="text-sm font-semibold text-amber-800 mb-1.5">Authorization Required</h3>
                      <p className="text-[13px] text-amber-700 leading-relaxed">
                        Booking.com requires you to authorize Channex as your connectivity provider.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <ol className="space-y-2.5 text-[13px] text-[#555]">
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">1.</span>
                      <span>Log into <strong className="text-[#003580]">admin.booking.com</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">2.</span>
                      <span>Go to <strong>Account → Connectivity Provider</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">3.</span>
                      <span>Search for <strong>&quot;Channex&quot;</strong> and confirm the connection</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-[#222] flex-shrink-0">4.</span>
                      <span>Come back here and click <strong>Retry Connection</strong></span>
                    </li>
                  </ol>
                </div>

                <button
                  onClick={handleRetryTest}
                  className="w-full py-2.5 text-sm font-medium text-white bg-[#003580] rounded-lg hover:bg-[#00265c] transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            )}

            {/* ---- SUCCESS ---- */}
            {step === "success" && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#222]">Booking.com Connected</h3>
                  <p className="text-sm text-[#999] mt-1">Hotel ID: {hotelId}</p>
                </div>
                <p className="text-[13px] text-[#666] leading-relaxed">
                  Bookings from Booking.com will now sync automatically. Calendar availability is being managed by StayCommand.
                </p>
                <button
                  onClick={() => { onConnected(); onClose(); }}
                  className="w-full py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
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
