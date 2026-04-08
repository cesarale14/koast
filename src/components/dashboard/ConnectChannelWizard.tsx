"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import {
  Cable, ArrowLeft, ArrowRight, Check, ChevronDown,
  ExternalLink, Shield, Loader2, CheckCircle2, X,
} from "lucide-react";

// ---------- Types ----------

interface PropertyInfo {
  id: string;
  name: string;
  channexPropertyId: string | null;
}

interface ConnectChannelWizardProps {
  properties: PropertyInfo[];
  existingChannels: Record<string, unknown>[];
}

// ---------- Channel Config ----------

const CHANNELS: Record<string, { name: string; color: string; textColor: string; bgLight: string; letter: string; code: string }> = {
  ABB: { name: "Airbnb", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50", letter: "A", code: "ABB" },
  BDC: { name: "Booking.com", color: "bg-blue-600", textColor: "text-blue-700", bgLight: "bg-blue-50", letter: "B", code: "BDC" },
  VRBO: { name: "VRBO", color: "bg-purple-600", textColor: "text-purple-700", bgLight: "bg-purple-50", letter: "V", code: "VRBO" },
  EXP: { name: "Expedia", color: "bg-yellow-500", textColor: "text-yellow-700", bgLight: "bg-yellow-50", letter: "E", code: "EXP" },
  AGO: { name: "Agoda", color: "bg-red-600", textColor: "text-red-700", bgLight: "bg-red-50", letter: "A", code: "AGO" },
  CTP: { name: "Trip.com", color: "bg-blue-500", textColor: "text-blue-700", bgLight: "bg-blue-50", letter: "T", code: "CTP" },
};

const CHANNEL_PREREQUISITES: Record<string, { title: string; steps: string[]; cta: string }> = {
  ABB: {
    title: "Connect Airbnb",
    steps: [
      "Make sure you have an active Airbnb host account with at least one listing",
      "You'll be redirected to Airbnb to authorize Channex as a connectivity partner",
      "Once authorized, your listings and calendar will sync automatically",
      "Rates and availability will be managed through StayCommand",
    ],
    cta: "You'll be redirected to Airbnb to authorize access",
  },
  BDC: {
    title: "Connect Booking.com",
    steps: [
      "Log in to your Booking.com extranet at admin.booking.com",
      "Navigate to Account > Connectivity Provider",
      "Search for \"Channex\" in the provider search",
      "Accept the connection request from Channex",
      "Return here and complete the setup in the connection window",
    ],
    cta: "Go to Booking.com extranet to authorize the connection",
  },
  VRBO: {
    title: "Connect VRBO",
    steps: [
      "Make sure you have an active VRBO/Vrbo host account",
      "You'll enter your VRBO credentials to establish the connection",
      "Once connected, your listings and calendar will sync automatically",
      "StayCommand will manage your rates and availability across platforms",
    ],
    cta: "Enter your VRBO credentials to connect",
  },
  EXP: {
    title: "Connect Expedia",
    steps: [
      "Contact Expedia Partner Central to enable API connectivity",
      "Request Channex as your connectivity provider",
      "Complete the onboarding process in the connection window",
    ],
    cta: "Complete Expedia connection setup",
  },
  AGO: {
    title: "Connect Agoda",
    steps: [
      "Log in to Agoda YCS (Your Channel Settings)",
      "Navigate to Connectivity and search for Channex",
      "Accept the connection request",
      "Return here to finalize the setup",
    ],
    cta: "Complete Agoda connection setup",
  },
  CTP: {
    title: "Connect Trip.com",
    steps: [
      "Contact Trip.com Partner Support for API access",
      "Request Channex as your channel manager",
      "Complete the onboarding in the connection window",
    ],
    cta: "Complete Trip.com connection setup",
  },
};

// ---------- Step Indicator ----------

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`h-px w-8 sm:w-12 ${isComplete ? "bg-brand-400" : "bg-neutral-200"}`} />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isComplete
                    ? "bg-brand-500 text-white"
                    : isActive
                      ? "bg-brand-500 text-white ring-4 ring-brand-100"
                      : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {isComplete ? <Check size={14} strokeWidth={2.5} /> : stepNum}
              </div>
              <span
                className={`hidden sm:inline text-xs font-medium ${
                  isActive ? "text-neutral-800" : isComplete ? "text-brand-600" : "text-neutral-400"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Main Component ----------

export default function ConnectChannelWizard({
  properties,
  existingChannels,
}: ConnectChannelWizardProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Initialize from URL params
  const initialProperty = searchParams.get("property") ?? properties[0]?.id ?? "";
  const initialChannel = searchParams.get("channel") ?? "";

  const [step, setStep] = useState(initialChannel ? 2 : 1);
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialProperty);
  const [selectedChannel, setSelectedChannel] = useState(initialChannel);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const channelConfig = selectedChannel ? CHANNELS[selectedChannel] : null;
  const prereqs = selectedChannel ? CHANNEL_PREREQUISITES[selectedChannel] : null;

  // Check if channel is already connected
  const isAlreadyConnected = existingChannels.some(
    (ch) =>
      (ch as Record<string, unknown>).property_id === selectedPropertyId &&
      (ch as Record<string, unknown>).channel_code === selectedChannel &&
      (ch as Record<string, unknown>).status === "active"
  );

  const stepLabels = ["Select Channel", "Prerequisites", "Connect", "Complete"];

  // Load iframe for step 3
  const loadConnectionIframe = useCallback(async () => {
    if (!selectedPropertyId || !selectedChannel) return;
    setIsLoadingToken(true);
    try {
      const res = await fetch(`/api/channels/token/${selectedPropertyId}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to get connection token");
      }
      const data = await res.json();
      // Use the pre-built iframe_url from the API, append channel filter
      const baseIframeUrl = data.iframe_url ?? `https://app.channex.io/auth/exchange?oauth_session_key=${data.token}&app_mode=headless&redirect_to=/channels&property_id=${data.channex_property_id ?? selectedProperty?.channexPropertyId}`;
      const url = `${baseIframeUrl}&channels=${selectedChannel}`;
      setIframeUrl(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to start connection", "error");
    } finally {
      setIsLoadingToken(false);
    }
  }, [selectedPropertyId, selectedChannel, selectedProperty, toast]);

  const [isVerifying, setIsVerifying] = useState(false);

  // Complete connection: refresh channel data from Channex then go to step 4
  const completeConnection = useCallback(async () => {
    if (!selectedPropertyId) return;
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/channels/${selectedPropertyId}/refresh`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const found = (data.channels ?? []).length > 0;
        if (found) {
          toast("Channel connected successfully!");
        } else {
          toast("Connection saved — channel may take a moment to activate", "error");
        }
      }
    } catch {
      // Non-critical — still proceed to step 4
    }
    setIsVerifying(false);
    setStep(4);
  }, [selectedPropertyId, toast]);

  // Listen for iframe messages
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      // Accept messages from Channex domains
      if (!e.origin.includes("channex.io")) return;
      console.log("[channex-iframe] Message:", e.data);
      // Auto-detect connection completion from various possible event formats
      const d = e.data;
      if (d?.type === "channex:channel_connected" || d?.event === "connected" ||
          d?.type === "channel_created" || d?.action === "channel_created") {
        completeConnection();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [completeConnection]);

  // No properties
  if (properties.length === 0) {
    return (
      <div>
        <Link href="/channels" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-6">
          <ArrowLeft size={14} /> Back to Channels
        </Link>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <h2 className="text-xl font-bold text-neutral-800 mb-2">No properties found</h2>
          <p className="text-sm text-neutral-500 mb-6">Add a property first to connect channels.</p>
          <Link href="/properties" className="inline-flex px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors">
            Add Property
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link href="/channels" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to Channels
      </Link>

      {/* Title */}
      <h1 className="text-xl font-bold text-neutral-800 mb-1">
        {step === 4 ? "Connection Complete" : "Connect Channel"}
      </h1>
      <p className="text-sm text-neutral-500 mb-6">
        {step === 4
          ? "Your channel has been connected successfully"
          : "Set up a new OTA channel connection for your property"
        }
      </p>

      {/* Step indicator */}
      <StepIndicator currentStep={step} steps={stepLabels} />

      {/* Property selector (always visible in steps 1-3) */}
      {step < 4 && properties.length > 1 && (
        <div className="relative mb-6">
          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Property</label>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-0 border border-[var(--border)] rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium text-neutral-700 w-full sm:w-auto"
          >
            <span>{selectedProperty?.name ?? "Select property"}</span>
            {selectedProperty?.channexPropertyId && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
            <ChevronDown size={14} className={`text-neutral-400 ml-auto transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-neutral-0 border border-[var(--border)] rounded-lg shadow-lg z-20 py-1">
              {properties.filter((p) => p.channexPropertyId).map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPropertyId(p.id); setDropdownOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50 transition-colors text-left ${
                    p.id === selectedPropertyId ? "bg-brand-50 text-brand-700" : "text-neutral-700"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-medium truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No Channex warning */}
      {step < 4 && !selectedProperty?.channexPropertyId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Property not connected to Channex</p>
              <p className="text-xs text-amber-600 mt-1">
                This property needs to be connected to Channex before you can add OTA channels.
              </p>
              <Link href={`/properties/${selectedPropertyId}`} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 mt-2">
                Go to property settings <ExternalLink size={11} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Channel Selection */}
      {step === 1 && (
        <div>
          <h2 className="text-base font-semibold text-neutral-800 mb-4">Select a channel to connect</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(CHANNELS).map(([code, config]) => {
              const connected = existingChannels.some(
                (ch) =>
                  (ch as Record<string, unknown>).property_id === selectedPropertyId &&
                  (ch as Record<string, unknown>).channel_code === code &&
                  (ch as Record<string, unknown>).status === "active"
              );
              return (
                <button
                  key={code}
                  onClick={() => {
                    if (!selectedProperty?.channexPropertyId) return;
                    setSelectedChannel(code);
                    setStep(2);
                  }}
                  disabled={!selectedProperty?.channexPropertyId}
                  className={`relative bg-neutral-0 rounded-lg border p-5 text-left transition-all ${
                    selectedChannel === code
                      ? "border-brand-400 ring-2 ring-brand-100"
                      : "border-[var(--border)] hover:border-neutral-300 hover:shadow-sm"
                  } ${!selectedProperty?.channexPropertyId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${config.color} flex items-center justify-center text-white font-bold text-base shadow-sm`}>
                      {config.letter}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-800">{config.name}</h3>
                      <span className="text-xs text-neutral-400">Channel code: {code}</span>
                    </div>
                  </div>
                  {connected && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-md w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium text-emerald-600">Already connected</span>
                    </div>
                  )}
                  {!connected && (
                    <div className="flex items-center gap-1 text-xs text-neutral-400">
                      <span>Click to connect</span>
                      <ArrowRight size={11} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: Prerequisites */}
      {step === 2 && prereqs && channelConfig && (
        <div>
          <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-11 h-11 rounded-xl ${channelConfig.color} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                {channelConfig.letter}
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-800">{prereqs.title}</h2>
                <p className="text-xs text-neutral-500">Follow these steps to prepare your connection</p>
              </div>
            </div>

            {isAlreadyConnected && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700">This channel is already connected</span>
                </div>
                <p className="text-xs text-emerald-600 mt-1 ml-6">You can reconnect if you need to update credentials.</p>
              </div>
            )}

            <ol className="space-y-3">
              {prereqs.steps.map((stepText, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-bold text-neutral-500">
                    {i + 1}
                  </span>
                  <span className="text-sm text-neutral-600 pt-0.5">{stepText}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 pt-5 border-t border-neutral-100">
              <div className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
                <Shield size={13} />
                <span>{prereqs.cta}</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep(1); setSelectedChannel(""); }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <button
              onClick={() => { setStep(3); loadConnectionIframe(); }}
              disabled={!selectedProperty?.channexPropertyId}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-50"
            >
              Continue to Connect
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Connection iframe */}
      {step === 3 && (
        <div>
          <div className="bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden mb-6">
            {/* Iframe header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-neutral-50">
              <div className="flex items-center gap-2">
                {channelConfig && (
                  <div className={`w-6 h-6 rounded-md ${channelConfig.color} flex items-center justify-center text-white font-bold text-xs`}>
                    {channelConfig.letter}
                  </div>
                )}
                <span className="text-sm font-medium text-neutral-700">
                  Connecting to {channelConfig?.name ?? "Channel"}
                </span>
              </div>
              <button
                onClick={() => {
                  setStep(2);
                  setIframeUrl(null);
                }}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Iframe content */}
            <div className="relative" style={{ minHeight: 500 }}>
              {isLoadingToken ? (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-0">
                  <div className="text-center">
                    <Loader2 size={32} className="animate-spin text-brand-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-neutral-600">Preparing secure connection...</p>
                    <p className="text-xs text-neutral-400 mt-1">This may take a few seconds</p>
                  </div>
                </div>
              ) : iframeUrl ? (
                <iframe
                  src={iframeUrl}
                  className="w-full border-0"
                  style={{ height: 600 }}
                  allow="camera; microphone"
                  title={`Connect ${channelConfig?.name ?? "Channel"}`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-0">
                  <div className="text-center">
                    <p className="text-sm font-medium text-neutral-600">Failed to load connection window</p>
                    <button
                      onClick={loadConnectionIframe}
                      className="mt-3 px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep(2); setIframeUrl(null); }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <button
              onClick={completeConnection}
              disabled={isVerifying}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Verifying connection...
                </>
              ) : (
                <>
                  I&apos;ve completed the setup
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Success */}
      {step === 4 && (
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-12 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-800 mb-2">Channel Connected!</h2>
          <p className="text-sm text-neutral-500 mb-2 max-w-md mx-auto">
            {channelConfig?.name ?? "Your channel"} has been connected to{" "}
            <span className="font-medium text-neutral-700">{selectedProperty?.name}</span>.
          </p>
          <p className="text-xs text-neutral-400 mb-8 max-w-md mx-auto">
            Bookings, rates, and availability will now sync automatically. You can view sync activity in the Sync Log.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/channels"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors shadow-sm"
            >
              <Cable size={15} strokeWidth={1.5} />
              View Channels
            </Link>
            <Link
              href="/channels/sync-log"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
            >
              View Sync Log
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
