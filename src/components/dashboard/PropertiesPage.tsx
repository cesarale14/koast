"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Home, Plus, ExternalLink, X, Loader2, Activity } from "lucide-react";

// ---------- Types ----------

interface PropertyData {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  channex_property_id: string | null;
  cover_photo_url: string | null;
}

interface ChannelRecord {
  property_id: string;
  channel_code: string;
  channel_name: string;
  status: string;
}

interface PropertiesPageProps {
  properties: PropertyData[];
  channels: ChannelRecord[];
  bookingCounts: Record<string, number>;
  occupancy: Record<string, number>;
  nextCheckins: Record<string, { date: string; guest: string | null }>;
}

// ---------- Platform Configs ----------

const PLATFORMS = [
  { code: "ABB", name: "Airbnb", color: "bg-red-500", letter: "A", description: "Vacation rentals & experiences" },
  { code: "BDC", name: "Booking.com", color: "bg-blue-600", letter: "B", description: "Hotels & vacation rentals" },
  { code: "VRBO", name: "VRBO", color: "bg-purple-600", letter: "V", description: "Vacation rentals by owner" },
];

const CHANNEL_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ABB: { label: "Airbnb", bg: "bg-red-50", text: "text-red-700" },
  BDC: { label: "Booking.com", bg: "bg-blue-50", text: "text-blue-700" },
  VRBO: { label: "VRBO", bg: "bg-purple-50", text: "text-purple-700" },
  EXP: { label: "Expedia", bg: "bg-yellow-50", text: "text-yellow-700" },
  AGO: { label: "Agoda", bg: "bg-red-50", text: "text-red-700" },
  CTP: { label: "Trip.com", bg: "bg-blue-50", text: "text-blue-700" },
};

const TYPE_LABELS: Record<string, string> = {
  entire_home: "Entire Home",
  private_room: "Private Room",
  shared_room: "Shared Room",
};

// ---------- Connection Modal ----------

function ConnectionModal({
  platform,
  onClose,
}: {
  platform: { code: string; name: string; color: string; letter: string } | null;
  onClose: (success: boolean) => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = useState<"scaffolding" | "iframe" | "verifying" | "importing">("scaffolding");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ synced: number; channels: number } | null>(null);

  // Get group-level iframe token on mount (not scoped to a single property)
  useEffect(() => {
    if (!platform) return;
    const platformCode = platform.code;
    let cancelled = false;

    async function init() {
      try {
        // Step 1: Ensure user has at least one Channex property (for mapping after OAuth)
        const scaffoldRes = await fetch("/api/properties/auto-scaffold", { method: "POST" });
        if (!scaffoldRes.ok) {
          const data = await scaffoldRes.json();
          throw new Error(data.error ?? "Failed to set up property");
        }
        const scaffold = await scaffoldRes.json();
        if (cancelled) return;
        setPropertyId(scaffold.property_id);

        // Step 2: Get GROUP-LEVEL token (connects entire OTA account, not one property)
        const tokenRes = await fetch("/api/channels/group-token", { method: "POST" });
        if (!tokenRes.ok) {
          const data = await tokenRes.json();
          throw new Error(data.error ?? "Failed to get connection token");
        }
        const tokenData = await tokenRes.json();
        if (cancelled) return;

        // Channel filter shows only the selected OTA
        const url = `${tokenData.iframe_url}&channels=${platformCode}`;
        setIframeUrl(url);
        setStage("iframe");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Connection setup failed");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [platform]);

  // Listen for Channex iframe completion messages
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.origin.includes("channex.io")) return;
      const d = e.data;
      if (
        d?.type === "channex:channel_connected" ||
        d?.event === "connected" ||
        d?.type === "channel_created" ||
        d?.action === "channel_created"
      ) {
        handleComplete();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleComplete = useCallback(async () => {
    if (!propertyId) return;
    setStage("verifying");
    try {
      const res = await fetch(`/api/channels/${propertyId}/refresh`, { method: "POST" });
      const data = res.ok ? await res.json() : null;
      const channelCount = (data?.channels ?? []).length;
      const synced = (data?.room_types ?? []).length + (data?.rate_plans ?? []).length;
      setImportResult({ synced, channels: channelCount });
      setStage("importing");
      toast(`${platform?.name ?? "Channel"} connected successfully!`);
    } catch {
      toast("Connection saved. Channel may take a moment to activate.", "error");
      onClose(true);
    }
  }, [propertyId, platform, toast, onClose]);

  if (!platform) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onClose(false)}
      />

      {/* Modal */}
      <div className="relative bg-neutral-0 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${platform.color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
              {platform.letter}
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-800">
                Connect {platform.name}
              </h2>
              <p className="text-xs text-neutral-500">Complete the setup in the window below</p>
            </div>
          </div>
          <button
            onClick={() => onClose(false)}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden" style={{ minHeight: 500 }}>
          {error ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <X size={24} className="text-red-500" />
                </div>
                <p className="text-sm font-medium text-neutral-800 mb-1">Connection failed</p>
                <p className="text-xs text-neutral-500 mb-4">{error}</p>
                <button
                  onClick={() => onClose(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : stage === "scaffolding" ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin text-brand-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-neutral-600">Preparing secure connection...</p>
                <p className="text-xs text-neutral-400 mt-1">Setting up your property on Channex</p>
              </div>
            </div>
          ) : stage === "verifying" ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin text-emerald-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-neutral-600">Verifying connection...</p>
                <p className="text-xs text-neutral-400 mt-1">Syncing channel data</p>
              </div>
            </div>
          ) : stage === "importing" ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-neutral-800 mb-2">
                  {platform?.name} connected!
                </h3>
                <p className="text-sm text-neutral-500 mb-6">
                  {importResult?.channels
                    ? `${importResult.channels} channel${importResult.channels !== 1 ? "s" : ""} synced with ${importResult.synced} room types and rate plans.`
                    : "Your account is now connected. Listings will sync automatically."}
                </p>
                <p className="text-xs text-neutral-400 mb-6">
                  Your properties and bookings from {platform?.name} will now sync automatically to StayCommand.
                </p>
                <button
                  onClick={() => onClose(true)}
                  className="px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors"
                >
                  View Properties
                </button>
              </div>
            </div>
          ) : iframeUrl ? (
            <iframe
              src={iframeUrl}
              className="w-full border-0"
              style={{ height: 600 }}
              allow="camera; microphone"
              title={`Connect ${platform.name}`}
            />
          ) : null}
        </div>

        {/* Footer (only during iframe stage) */}
        {stage === "iframe" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-neutral-50">
            <p className="text-xs text-neutral-500">
              Complete the connection process in the window above
            </p>
            <button
              onClick={handleComplete}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
            >
              I&apos;ve completed the setup
              <ExternalLink size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Empty State (View A) ----------

function EmptyView({ onConnect }: { onConnect: (platform: typeof PLATFORMS[0]) => void }) {
  return (
    <div className="max-w-2xl mx-auto pt-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Home size={32} className="text-brand-500" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-bold text-neutral-800 mb-2">Connect your properties</h1>
        <p className="text-neutral-500 max-w-md mx-auto">
          Link your booking platforms to import and manage all your properties in one place
        </p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {PLATFORMS.map((p) => (
          <button
            key={p.code}
            onClick={() => onConnect(p)}
            className="bg-neutral-0 rounded-xl border border-[var(--border)] p-6 text-left hover:shadow-md hover:border-neutral-300 transition-all group"
          >
            <div className={`w-12 h-12 rounded-xl ${p.color} flex items-center justify-center text-white font-bold text-xl shadow-sm mb-4`}>
              {p.letter}
            </div>
            <h3 className="text-base font-semibold text-neutral-800 mb-1">{p.name}</h3>
            <p className="text-xs text-neutral-500 mb-4">{p.description}</p>
            <span className="inline-flex px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg group-hover:bg-brand-600 transition-colors">
              Connect
            </span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      {/* Manual options */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/properties/new"
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all"
        >
          <Plus size={16} />
          Add property manually
        </Link>
        <Link
          href="/properties/new"
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all"
        >
          <ExternalLink size={16} />
          Import via iCal
        </Link>
      </div>
    </div>
  );
}

// ---------- Property Card ----------

function PropertyCard({
  property,
  connectedChannels,
  bookingCount,
  occupancy,
  nextCheckin,
}: {
  property: PropertyData;
  connectedChannels: ChannelRecord[];
  bookingCount: number;
  occupancy: number;
  nextCheckin: { date: string; guest: string | null } | null;
}) {
  return (
    <Link
      href={`/properties/${property.id}`}
      className="bg-neutral-0 rounded-xl border border-[var(--border)] shadow-sm hover:shadow-md transition-all group"
    >
      {/* Cover photo */}
      {property.cover_photo_url ? (
        <div className="h-40 rounded-t-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={property.cover_photo_url}
            alt={property.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-brand-50 to-brand-100 rounded-t-xl flex items-center justify-center">
          <Home size={32} className="text-brand-300" strokeWidth={1.5} />
        </div>
      )}

      <div className="p-5">
        {/* Name & location */}
        <h3 className="text-lg font-semibold text-neutral-800 group-hover:text-brand-500 transition-colors">
          {property.name}
        </h3>
        {(property.city || property.state) && (
          <p className="text-sm text-neutral-500 mt-0.5">
            {[property.city, property.state].filter(Boolean).join(", ")}
          </p>
        )}

        {/* Property details */}
        <div className="flex items-center gap-3 mt-3 text-xs text-neutral-400">
          {property.property_type && (
            <span>{TYPE_LABELS[property.property_type] ?? property.property_type}</span>
          )}
          {property.bedrooms != null && <span>{property.bedrooms} bed</span>}
          {property.bathrooms != null && <span>{property.bathrooms} bath</span>}
          {property.max_guests != null && <span>{property.max_guests} guests</span>}
        </div>

        {/* Platform badges */}
        <div className="mt-3">
          {connectedChannels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {connectedChannels.map((ch) => {
                const badge = CHANNEL_BADGE[ch.channel_code];
                return (
                  <span
                    key={ch.channel_code}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      badge ? `${badge.bg} ${badge.text}` : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {badge?.label ?? ch.channel_name}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-neutral-400">No channels connected</span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
          <div>
            <p className="text-xs text-neutral-400">Bookings</p>
            <p className="text-sm font-semibold font-mono text-neutral-800">{bookingCount}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">Occupancy</p>
            <p className="text-sm font-semibold font-mono text-neutral-800">{occupancy}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-400">Next check-in</p>
            <p className="text-sm font-medium text-neutral-700">
              {nextCheckin
                ? new Date(nextCheckin.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "\u2014"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ---------- Main Component ----------

export default function PropertiesPage({
  properties,
  channels,
  bookingCounts,
  occupancy,
  nextCheckins,
}: PropertiesPageProps) {
  const router = useRouter();
  const [connectingPlatform, setConnectingPlatform] = useState<typeof PLATFORMS[0] | null>(null);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [, startTransition] = useTransition();

  // Build lookup: property_id -> active channels
  const channelsByProperty = new Map<string, ChannelRecord[]>();
  for (const ch of channels) {
    if (ch.status !== "active") continue;
    if (!channelsByProperty.has(ch.property_id)) channelsByProperty.set(ch.property_id, []);
    channelsByProperty.get(ch.property_id)!.push(ch);
  }

  const handleConnect = useCallback((platform: typeof PLATFORMS[0]) => {
    setShowPlatformPicker(false);
    setConnectingPlatform(platform);
  }, []);

  const handleModalClose = useCallback((success: boolean) => {
    setConnectingPlatform(null);
    if (success) {
      startTransition(() => {
        router.refresh();
      });
    }
  }, [router]);

  // ---------- View A: No properties ----------
  if (properties.length === 0) {
    return (
      <div>
        <EmptyView onConnect={handleConnect} />
        {connectingPlatform && (
          <ConnectionModal platform={connectingPlatform} onClose={handleModalClose} />
        )}
      </div>
    );
  }

  // ---------- View B: Property list ----------
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Properties</h1>
          <p className="text-sm text-neutral-500">
            {properties.length} propert{properties.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/channels/sync-log"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all"
          >
            <Activity size={15} strokeWidth={1.5} />
            Sync Log
          </Link>
          <div className="relative">
            <button
              onClick={() => setShowPlatformPicker(!showPlatformPicker)}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus size={16} />
              Connect Platform
            </button>

            {/* Platform dropdown */}
            {showPlatformPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPlatformPicker(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-neutral-0 border border-[var(--border)] rounded-xl shadow-lg z-20 py-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.code}
                      onClick={() => handleConnect(p)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg ${p.color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                        {p.letter}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-800">{p.name}</p>
                        <p className="text-xs text-neutral-400">{p.description}</p>
                      </div>
                    </button>
                  ))}
                  <div className="border-t border-[var(--border)] mt-2 pt-2">
                    <Link
                      href="/properties/new"
                      onClick={() => setShowPlatformPicker(false)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <Plus size={16} className="text-neutral-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-800">Add manually</p>
                        <p className="text-xs text-neutral-400">Or import via iCal</p>
                      </div>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Property grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {properties.map((prop) => (
          <PropertyCard
            key={prop.id}
            property={prop}
            connectedChannels={channelsByProperty.get(prop.id) ?? []}
            bookingCount={bookingCounts[prop.id] ?? 0}
            occupancy={occupancy[prop.id] ?? 0}
            nextCheckin={nextCheckins[prop.id] ?? null}
          />
        ))}
      </div>

      {/* Connection modal */}
      {connectingPlatform && (
        <ConnectionModal platform={connectingPlatform} onClose={handleModalClose} />
      )}
    </div>
  );
}
