"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  Cable, RefreshCcw, Settings2, ExternalLink,
  ChevronDown, Clock, ArrowRight, Zap, Activity,
} from "lucide-react";

// ---------- Types ----------

interface PropertyInfo {
  id: string;
  name: string;
  channexPropertyId: string | null;
}

interface ChannelRecord {
  id: string;
  property_id: string;
  channex_channel_id: string;
  channel_code: string;
  channel_name: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  settings: Record<string, unknown>;
}

interface RoomTypeRecord {
  id: string;
  property_id: string;
  title: string;
  occ_adults: number;
  count_of_rooms: number;
}

interface RatePlanRecord {
  id: string;
  property_id: string;
  room_type_id: string;
  title: string;
  sell_mode: string;
  currency: string;
}

interface ChannelsOverviewProps {
  properties: PropertyInfo[];
  channels: Record<string, unknown>[];
  roomTypes: RoomTypeRecord[];
  ratePlans: RatePlanRecord[];
  bookingCounts: Record<string, Record<string, number>>;
}

// ---------- Channel Config ----------

const CHANNELS: Record<string, { name: string; color: string; textColor: string; bgLight: string; letter: string }> = {
  ABB: { name: "Airbnb", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50", letter: "A" },
  BDC: { name: "Booking.com", color: "bg-blue-600", textColor: "text-blue-700", bgLight: "bg-blue-50", letter: "B" },
  VRBO: { name: "VRBO", color: "bg-purple-600", textColor: "text-purple-700", bgLight: "bg-purple-50", letter: "V" },
  EXP: { name: "Expedia", color: "bg-yellow-500", textColor: "text-yellow-700", bgLight: "bg-yellow-50", letter: "E" },
  AGO: { name: "Agoda", color: "bg-red-600", textColor: "text-red-700", bgLight: "bg-red-50", letter: "A" },
  CTP: { name: "Trip.com", color: "bg-blue-500", textColor: "text-blue-700", bgLight: "bg-blue-50", letter: "T" },
};

const PLATFORM_TO_CODE: Record<string, string> = {
  airbnb: "ABB",
  booking_com: "BDC",
  vrbo: "VRBO",
};

const TOP_CHANNELS = ["ABB", "BDC", "VRBO"];
const MORE_CHANNELS = ["EXP", "AGO", "CTP"];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------- Channel Card ----------

function ChannelCard({
  code,
  channel,
  bookingCount,
  propertyId,
}: {
  code: string;
  channel: ChannelRecord | null;
  bookingCount: number;
  propertyId: string;
}) {
  const config = CHANNELS[code];
  if (!config) return null;

  const isConnected = channel?.status === "active";
  const hasError = channel?.last_error;

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl ${config.color} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
            {config.letter}
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-800">{config.name}</h3>
            {isConnected ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-600">Connected</span>
              </div>
            ) : hasError ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs font-medium text-red-600">Error</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-neutral-300" />
                <span className="text-xs font-medium text-neutral-400">Not connected</span>
              </div>
            )}
          </div>
        </div>
        {isConnected && (
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${config.bgLight} ${config.textColor}`}>
            Live
          </div>
        )}
      </div>

      {/* Stats (only when connected) */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-neutral-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity size={12} className="text-neutral-400" />
              <span className="text-[11px] text-neutral-500 font-medium">Bookings</span>
            </div>
            <span className="text-lg font-bold text-neutral-800 font-mono">{bookingCount}</span>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-neutral-400" />
              <span className="text-[11px] text-neutral-500 font-medium">Last sync</span>
            </div>
            <span className="text-sm font-semibold text-neutral-700">{timeAgo(channel?.last_sync_at ?? null)}</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {hasError && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-xs text-red-600 line-clamp-2">{channel.last_error}</p>
        </div>
      )}

      {/* Action */}
      <div className="mt-auto">
        {isConnected ? (
          <Link
            href={`/channels/connect?property=${propertyId}&channel=${code}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-50 border border-[var(--border)] rounded-lg hover:bg-neutral-100 hover:border-neutral-300 transition-all"
          >
            <Settings2 size={15} strokeWidth={1.5} />
            Manage
          </Link>
        ) : (
          <Link
            href={`/channels/connect?property=${propertyId}&channel=${code}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Zap size={15} strokeWidth={1.5} />
            Connect
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------- Compact Channel Card ----------

function CompactChannelCard({
  code,
  propertyId,
}: {
  code: string;
  propertyId: string;
}) {
  const config = CHANNELS[code];
  if (!config) return null;

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 hover:shadow-md transition-shadow flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${config.color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
          {config.letter}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-neutral-800">{config.name}</h4>
          <span className="text-xs text-neutral-400">Available to connect</span>
        </div>
      </div>
      <Link
        href={`/channels/connect?property=${propertyId}&channel=${code}`}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
      >
        Connect
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

// ---------- Main Component ----------

export default function ChannelsOverview({
  properties,
  channels: rawChannels,
  roomTypes: allRoomTypes,
  ratePlans: allRatePlans,
  bookingCounts,
}: ChannelsOverviewProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const [isRefreshing, startRefresh] = useTransition();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const hasChannex = !!selectedProperty?.channexPropertyId;

  // Parse channels for selected property
  const channels = useMemo(() => {
    return (rawChannels as unknown as ChannelRecord[]).filter(
      (ch) => ch.property_id === selectedPropertyId
    );
  }, [rawChannels, selectedPropertyId]);

  // Map channel code -> ChannelRecord
  const channelMap = useMemo(() => {
    const map: Record<string, ChannelRecord> = {};
    for (const ch of channels) {
      map[ch.channel_code] = ch;
    }
    return map;
  }, [channels]);

  // Get booking count for a channel code
  const getBookingCount = useCallback(
    (code: string): number => {
      const propCounts = bookingCounts[selectedPropertyId] ?? {};
      // Reverse lookup: code -> platform
      for (const [platform, channelCode] of Object.entries(PLATFORM_TO_CODE)) {
        if (channelCode === code) return propCounts[platform] ?? 0;
      }
      return 0;
    },
    [bookingCounts, selectedPropertyId]
  );

  const connectedCount = channels.filter((ch) => ch.status === "active").length;

  // Room types and rate plans for selected property
  const propertyRoomTypes = useMemo(
    () => allRoomTypes.filter((rt) => rt.property_id === selectedPropertyId),
    [allRoomTypes, selectedPropertyId]
  );
  const propertyRatePlans = useMemo(
    () => allRatePlans.filter((rp) => rp.property_id === selectedPropertyId),
    [allRatePlans, selectedPropertyId]
  );

  const handleRefresh = useCallback(() => {
    if (!selectedPropertyId) return;
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/channels/${selectedPropertyId}/refresh`, { method: "POST" });
        if (!res.ok) throw new Error("Refresh failed");
        toast("Channels refreshed from Channex");
        router.refresh();
      } catch {
        toast("Failed to refresh channels", "error");
      }
    });
  }, [selectedPropertyId, toast, router]);

  // No properties at all
  if (properties.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Channels</h1>
        <p className="text-sm text-neutral-500 mb-8">Manage your distribution across booking platforms</p>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Cable size={32} className="text-brand-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">No properties yet</h2>
          <p className="text-sm text-neutral-500 mb-6">Add a property to start managing your channels.</p>
          <Link
            href="/properties"
            className="inline-flex px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
          >
            Add Property
          </Link>
        </div>
      </div>
    );
  }

  // Property not connected to Channex
  if (!hasChannex) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Channels</h1>
        <p className="text-sm text-neutral-500 mb-8">Manage your distribution across booking platforms</p>

        {/* Property selector */}
        {properties.length > 1 && (
          <PropertySelector
            properties={properties}
            selectedId={selectedPropertyId}
            onSelect={setSelectedPropertyId}
            open={dropdownOpen}
            onToggle={() => setDropdownOpen(!dropdownOpen)}
          />
        )}

        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center mt-6">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Cable size={32} className="text-amber-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Connect to Channex first</h2>
          <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">
            This property needs to be connected to Channex before you can manage OTA channels.
            Go to property settings to set up the connection.
          </p>
          <Link
            href={`/properties/${selectedPropertyId}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
          >
            <ExternalLink size={15} strokeWidth={1.5} />
            Property Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Channels</h1>
          <p className="text-sm text-neutral-500">Manage your distribution across booking platforms</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/channels/sync-log"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all"
          >
            <Activity size={15} strokeWidth={1.5} />
            Sync Log
          </Link>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-all disabled:opacity-50"
          >
            <RefreshCcw size={15} strokeWidth={1.5} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Property selector */}
      {properties.length > 1 && (
        <PropertySelector
          properties={properties}
          selectedId={selectedPropertyId}
          onSelect={(id) => { setSelectedPropertyId(id); setDropdownOpen(false); }}
          open={dropdownOpen}
          onToggle={() => setDropdownOpen(!dropdownOpen)}
        />
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-6 mt-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-lg">
          <Cable size={14} className="text-brand-500" />
          <span className="text-sm font-medium text-brand-700">
            {connectedCount} channel{connectedCount !== 1 ? "s" : ""} connected
          </span>
        </div>
        <span className="text-xs text-neutral-400 font-mono">
          Property ID: {selectedProperty?.channexPropertyId?.slice(0, 8)}...
        </span>
      </div>

      {/* Channex Setup Info */}
      {hasChannex && propertyRoomTypes.length > 0 && (
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Cable size={20} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-800">Channex Connected</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {propertyRoomTypes.length} room type{propertyRoomTypes.length !== 1 ? "s" : ""} &middot; {propertyRatePlans.length} rate plan{propertyRatePlans.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex flex-wrap gap-1.5">
                  {propertyRoomTypes.map((rt) => (
                    <span key={rt.id} className="px-2 py-0.5 text-[10px] font-medium bg-brand-50 text-brand-700 rounded-full">
                      {rt.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top 3 OTA channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {TOP_CHANNELS.map((code) => (
          <ChannelCard
            key={code}
            code={code}
            channel={channelMap[code] ?? null}
            bookingCount={getBookingCount(code)}
            propertyId={selectedPropertyId}
          />
        ))}
      </div>

      {/* More Channels */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">More Channels</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MORE_CHANNELS.map((code) => (
            <CompactChannelCard key={code} code={code} propertyId={selectedPropertyId} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Property Selector ----------

function PropertySelector({
  properties,
  selectedId,
  onSelect,
  open,
  onToggle,
}: {
  properties: PropertyInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const selected = properties.find((p) => p.id === selectedId);
  return (
    <div className="relative mb-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-2.5 bg-neutral-0 border border-[var(--border)] rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium text-neutral-700"
      >
        <span>{selected?.name ?? "Select property"}</span>
        {selected?.channexPropertyId && (
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        )}
        <ChevronDown size={14} className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-neutral-0 border border-[var(--border)] rounded-lg shadow-lg z-20 py-1">
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50 transition-colors text-left ${
                p.id === selectedId ? "bg-brand-50 text-brand-700" : "text-neutral-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${p.channexPropertyId ? "bg-emerald-500" : "bg-neutral-300"}`} />
              <span className="font-medium truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
