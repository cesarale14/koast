"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Home,
  Settings,
  X,
  Minus,
  Plus,
  AlertTriangle,
  Check,
  Sparkles,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import BookingComConnect from "./BookingComConnect";
import { PLATFORMS, platformKeyFrom, type PlatformKey } from "@/lib/platforms";
import { useCountUp } from "@/hooks/useCountUp";

// ============ Types ============

interface Booking {
  id: string;
  guest_name: string | null;
  platform: string;
  check_in: string;
  check_out: string;
  total_price: number | null;
  num_guests: number | null;
  status: string;
}

interface PricingRecommendation {
  date: string;
  current_rate: number | null;
  suggested_rate: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
  reason_signals: Record<string, unknown> | null;
}

interface PropertyDetailProps {
  property: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    max_guests: number | null;
    property_type: string | null;
    channex_property_id: string | null;
    cover_photo_url: string | null;
  };
  listings: {
    id: string;
    platform: string;
    platform_listing_id: string | null;
    listing_url: string | null;
    status: string | null;
  }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allBookings: any[];
  stats: {
    occupancy: number;
    revenue: number;
    adr: number;
    totalBookings: number;
    rating: number;
    avgLOS: number;
  };
  channelRevenue: Record<string, number>;
  cleaningToday: { status: string; cleaner: string | null } | null;
  pricingRecommendations?: PricingRecommendation[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarBookings: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarRates: any[];
  channels?: { channel_code: string; status: string; settings?: Record<string, unknown> }[];
}

// ============ Helpers ============

function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function firstNameLastInitial(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw || /guest$/i.test(raw)) return "Guest";
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const lastInitial = parts[1]?.[0];
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

function initialsFor(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "G";
  const parts = raw.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "G";
}

const PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: "entire_home", label: "Entire Home" },
  { value: "private_room", label: "Private Room" },
  { value: "shared_room", label: "Shared Room" },
];

// ============ Main Component ============

export default function PropertyDetail({
  property,
  listings,
  allBookings,
  stats,
  channelRevenue,
  cleaningToday,
  pricingRecommendations = [],
  calendarBookings,
  calendarRates,
  channels = [],
}: PropertyDetailProps) {
  const [tab, setTab] = useState<"Overview" | "Calendar" | "Pricing">("Overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showBdcConnect, setShowBdcConnect] = useState(false);
  const router = useRouter();

  const bdcChannel = channels.find((c) => c.channel_code === "BDC");

  // Unique connected channel codes (active listings + property_channels)
  const connectedPlatforms = useMemo(() => {
    const set = new Set<PlatformKey>();
    for (const l of listings) {
      const k = platformKeyFrom(l.platform);
      if (k) set.add(k);
    }
    for (const c of channels) {
      if (c.status !== "active") continue;
      const k = platformKeyFrom(c.channel_code);
      if (k) set.add(k);
    }
    return Array.from(set);
  }, [listings, channels]);

  const todayStr = new Date().toISOString().split("T")[0];

  // Current active booking (for the status banner)
  const currentBooking = useMemo(
    () =>
      (allBookings as Booking[]).find(
        (b) => b.status !== "cancelled" && b.check_in <= todayStr && b.check_out > todayStr
      ) ?? null,
    [allBookings, todayStr]
  );

  // Next upcoming booking after today
  const upcomingBookings = useMemo(
    () =>
      (allBookings as Booking[])
        .filter((b) => b.status !== "cancelled" && b.check_in >= todayStr)
        .sort((a, b) => a.check_in.localeCompare(b.check_in)),
    [allBookings, todayStr]
  );
  const nextBooking = upcomingBookings[0] ?? null;

  return (
    <div className="pb-12">
      <style jsx global>{`
        @keyframes koast-fade-up-pd { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes koast-hero-in { from { opacity: 0; } to { opacity: 1; } }
        .pd-anim { opacity: 0; animation: koast-fade-up-pd 0.55s ease-out forwards; }
        .pd-hero { opacity: 0; animation: koast-hero-in 0.6s ease-out 200ms forwards; }
      `}</style>

      <HeroSection
        property={property}
        connectedPlatforms={connectedPlatforms}
        bdcConnected={!!bdcChannel}
        onConnectBdc={() => setShowBdcConnect(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="max-w-[1200px] mx-auto px-8">
        <TabBar tab={tab} onChange={setTab} />

        {tab === "Overview" && (
          <OverviewTab
            property={property}
            stats={stats}
            currentBooking={currentBooking}
            nextBooking={nextBooking}
            cleaningToday={cleaningToday}
            upcomingBookings={upcomingBookings.slice(0, 5)}
            channelRevenue={channelRevenue}
          />
        )}

        {tab === "Calendar" && (
          <div className="pd-anim mt-6 rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "var(--shadow-card)", animationDelay: "100ms" }}>
            <div className="h-[720px]">
              <CalendarGrid
                properties={[{ id: property.id, name: property.name, cover_photo_url: property.cover_photo_url }]}
                bookings={calendarBookings}
                rates={calendarRates}
                totalDays={730}
              />
            </div>
          </div>
        )}

        {tab === "Pricing" && (
          <PricingTab propertyId={property.id} recommendations={pricingRecommendations} />
        )}
      </div>

      {settingsOpen && (
        <PropertySettingsModal
          property={property}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {showBdcConnect && (
        <BookingComConnect
          propertyId={property.id}
          propertyName={property.name}
          onClose={() => setShowBdcConnect(false)}
          onConnected={() => {
            setShowBdcConnect(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ============ Hero ============

function HeroSection({
  property,
  connectedPlatforms,
  bdcConnected,
  onConnectBdc,
  onOpenSettings,
}: {
  property: PropertyDetailProps["property"];
  connectedPlatforms: PlatformKey[];
  bdcConnected: boolean;
  onConnectBdc: () => void;
  onOpenSettings: () => void;
}) {
  const locationLabel = [property.city, property.state].filter(Boolean).join(", ");

  return (
    <div
      className="relative w-full pd-hero"
      style={{ height: 280, backgroundColor: "var(--deep-sea)", marginBottom: 0 }}
    >
      {property.cover_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={property.cover_photo_url} alt={property.name} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, var(--deep-sea), #0a1c14 50%, #0e2218)",
            color: "rgba(196,154,90,0.25)",
          }}
        >
          <Home size={72} strokeWidth={1.2} />
        </div>
      )}
      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.7) 100%)" }}
      />

      {/* Back arrow + gear — both use the same frosted-glass pill style */}
      <div className="absolute top-6 left-8 right-8 flex items-center justify-between z-[2]">
        <Link
          href="/properties"
          className="flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 36,
            height: 36,
            backgroundColor: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.85)",
          }}
          title="Back to properties"
          aria-label="Back to properties"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </Link>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 36,
            height: 36,
            backgroundColor: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.85)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,1)";
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.85)";
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
          }}
          title="Property settings"
          aria-label="Property settings"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>

      {/* Bottom-left: name + location */}
      <div className="absolute left-8 bottom-7 z-[2] max-w-[60%]">
        <div
          className="text-[28px] font-bold text-white truncate"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)", letterSpacing: "-0.02em" }}
        >
          {property.name}
        </div>
        {locationLabel && (
          <div
            className="text-[14px] text-white/75 mt-0.5 truncate"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
          >
            {locationLabel}
          </div>
        )}
      </div>

      {/* Bottom-right: channel badges + Connect listing */}
      <div className="absolute right-8 bottom-7 flex items-center gap-2 z-[2]">
        {connectedPlatforms.map((key) => {
          const platform = PLATFORMS[key];
          return (
            <div
              key={key}
              className="flex items-center justify-center"
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                backgroundColor: `${platform.color}bf`,
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              title={platform.name}
            >
              <Image src={platform.iconWhite} alt={platform.name} width={14} height={14} />
            </div>
          );
        })}
        {!bdcConnected && (
          <button
            type="button"
            onClick={onConnectBdc}
            className="text-[11px] font-semibold transition-colors"
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              backgroundColor: "var(--coastal)",
              color: "var(--shore)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--mangrove)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--coastal)";
            }}
          >
            Connect listing
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Tab bar ============

function TabBar({
  tab,
  onChange,
}: {
  tab: "Overview" | "Calendar" | "Pricing";
  onChange: (t: "Overview" | "Calendar" | "Pricing") => void;
}) {
  const tabs: ("Overview" | "Calendar" | "Pricing")[] = ["Overview", "Calendar", "Pricing"];
  return (
    <div
      className="flex gap-6 pd-anim sticky z-[3]"
      style={{
        borderBottom: "1px solid var(--dry-sand)",
        top: 0,
        backgroundColor: "#fff",
        marginTop: 16,
        animationDelay: "200ms",
      }}
    >
      {tabs.map((t) => {
        const active = tab === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="pb-3 pt-2 text-[14px] font-semibold transition-colors"
            style={{
              color: active ? "var(--coastal)" : "var(--tideline)",
              borderBottom: active ? "2px solid var(--golden)" : "2px solid transparent",
              marginBottom: -1,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--coastal)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--tideline)";
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

// ============ Overview ============

function OverviewTab({
  property,
  stats,
  currentBooking,
  nextBooking,
  cleaningToday,
  upcomingBookings,
  channelRevenue,
}: {
  property: PropertyDetailProps["property"];
  stats: PropertyDetailProps["stats"];
  currentBooking: Booking | null;
  nextBooking: Booking | null;
  cleaningToday: { status: string; cleaner: string | null } | null;
  upcomingBookings: Booking[];
  channelRevenue: Record<string, number>;
}) {
  return (
    <div className="mt-6 space-y-6">
      <StatusBanner
        currentBooking={currentBooking}
        nextBooking={nextBooking}
        cleaningToday={cleaningToday}
      />

      <StatsGrid stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <UpcomingBookings bookings={upcomingBookings} />
        <ChannelPerformance
          channelRevenue={channelRevenue}
          totalRevenue={stats.revenue}
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          propertyId={property.id}
        />
      </div>
    </div>
  );
}

function StatusBanner({
  currentBooking,
  nextBooking,
  cleaningToday,
}: {
  currentBooking: Booking | null;
  nextBooking: Booking | null;
  cleaningToday: { status: string; cleaner: string | null } | null;
}) {
  const isTurnover = !!cleaningToday;
  const isOccupied = !!currentBooking && !isTurnover;

  let tone: "lagoon" | "golden" | "amber-tide" = "golden";
  let title = "Vacant";
  let subtitle: string | null = null;
  let icon: React.ReactNode = null;
  let guestName: string | null = null;
  let platformKey: PlatformKey | null = null;

  if (isTurnover && cleaningToday) {
    tone = "amber-tide";
    icon = <Sparkles size={18} strokeWidth={2} />;
    const statusLabel =
      cleaningToday.status === "completed"
        ? "Completed"
        : cleaningToday.status === "in_progress"
        ? "In progress"
        : cleaningToday.status === "assigned"
        ? "Notified"
        : "Pending";
    title = cleaningToday.cleaner
      ? `Turnover today — ${cleaningToday.cleaner} assigned`
      : "Turnover today — no cleaner assigned";
    subtitle = `Status: ${statusLabel}`;
  } else if (isOccupied && currentBooking) {
    tone = "lagoon";
    icon = <Check size={18} strokeWidth={2.5} />;
    guestName = currentBooking.guest_name ?? "Guest";
    platformKey = platformKeyFrom(currentBooking.platform);
    const days = Math.max(
      0,
      Math.round(
        (Date.UTC(
          +currentBooking.check_out.slice(0, 4),
          +currentBooking.check_out.slice(5, 7) - 1,
          +currentBooking.check_out.slice(8, 10)
        ) -
          new Date(new Date().setHours(0, 0, 0, 0)).getTime()) /
          86400000
      )
    );
    title = `${firstNameLastInitial(guestName)} is checked in`;
    subtitle = `${shortDate(currentBooking.check_in)} – ${shortDate(currentBooking.check_out)} · checkout in ${days} day${days === 1 ? "" : "s"}`;
  } else if (nextBooking) {
    tone = "golden";
    icon = <AlertTriangle size={18} strokeWidth={2} />;
    const days = Math.max(
      0,
      Math.round(
        (Date.UTC(
          +nextBooking.check_in.slice(0, 4),
          +nextBooking.check_in.slice(5, 7) - 1,
          +nextBooking.check_in.slice(8, 10)
        ) -
          new Date(new Date().setHours(0, 0, 0, 0)).getTime()) /
          86400000
      )
    );
    guestName = nextBooking.guest_name ?? null;
    platformKey = platformKeyFrom(nextBooking.platform);
    title = `Vacant — next check-in ${shortDate(nextBooking.check_in)}`;
    subtitle = `${firstNameLastInitial(guestName)} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`;
  } else {
    title = "Vacant";
    subtitle = "No upcoming bookings";
  }

  const toneColor = `var(--${tone})`;

  return (
    <div
      className="pd-anim flex items-center gap-4 p-4 rounded-[14px]"
      style={{
        backgroundColor: "#fff",
        borderLeft: `4px solid ${toneColor}`,
        boxShadow: "var(--shadow-card)",
        animationDelay: "400ms",
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          backgroundColor:
            tone === "lagoon"
              ? "rgba(26,122,90,0.12)"
              : tone === "amber-tide"
              ? "rgba(212,150,11,0.12)"
              : "rgba(196,154,90,0.12)",
          color: toneColor,
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-bold" style={{ color: "var(--coastal)" }}>
            {title}
          </span>
          {platformKey && (
            <span
              className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold"
              style={{
                height: 18,
                backgroundColor: PLATFORMS[platformKey].colorLight,
                color: PLATFORMS[platformKey].color,
              }}
            >
              <Image
                src={PLATFORMS[platformKey].icon}
                alt={PLATFORMS[platformKey].name}
                width={10}
                height={10}
              />
              {PLATFORMS[platformKey].name}
            </span>
          )}
        </div>
        {subtitle && (
          <div className="text-[12px] mt-0.5" style={{ color: "var(--tideline)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: PropertyDetailProps["stats"] }) {
  const cards = [
    { label: "Revenue", value: stats.revenue, kind: "currency" as const },
    { label: "Occupancy", value: stats.occupancy, kind: "percent" as const },
    { label: "Avg rate", value: stats.adr, kind: "currency-short" as const },
    { label: "Rating", value: stats.rating, kind: "rating" as const },
    { label: "Avg stay", value: stats.avgLOS, kind: "nights" as const },
  ];
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
    >
      {cards.map((c, i) => (
        <GlassStatCard key={c.label} index={i} {...c} />
      ))}
    </div>
  );
}

function GlassStatCard({
  index,
  label,
  value,
  kind,
}: {
  index: number;
  label: string;
  value: number;
  kind: "currency" | "currency-short" | "percent" | "rating" | "nights";
}) {
  const animated = useCountUp(value, 1000, 500 + index * 80);
  let display: string;
  if (kind === "currency") {
    display = animated >= 1000 ? `$${(animated / 1000).toFixed(1)}k` : `$${Math.round(animated).toLocaleString("en-US")}`;
  } else if (kind === "currency-short") {
    display = animated > 0 ? `$${Math.round(animated)}` : "—";
  } else if (kind === "percent") {
    display = `${Math.round(animated)}%`;
  } else if (kind === "rating") {
    display = animated > 0 ? animated.toFixed(1) : "—";
  } else {
    display = animated > 0 ? `${animated.toFixed(1)} nts` : "—";
  }
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 pd-anim"
      style={{
        background: "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "var(--shadow-glass)",
        animationDelay: `${500 + index * 80}ms`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 pointer-events-none rounded-t-2xl"
        style={{
          height: "50%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.35), transparent)",
        }}
      />
      <div
        className="text-[24px] font-bold relative z-[1]"
        style={{ color: "var(--coastal)", letterSpacing: "-0.03em" }}
      >
        {display}
      </div>
      <div
        className="text-[10px] font-bold uppercase mt-1 relative z-[1]"
        style={{ color: "var(--golden)", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
    </div>
  );
}

function UpcomingBookings({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="pd-anim" style={{ animationDelay: "700ms" }}>
      <SectionLabel label="Upcoming bookings" />
      <div
        className="rounded-2xl overflow-hidden bg-white"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {bookings.length === 0 ? (
          <div className="p-8 text-center text-[13px]" style={{ color: "var(--tideline)" }}>
            No upcoming bookings yet.
          </div>
        ) : (
          bookings.map((b, i) => {
            const platformKey = platformKeyFrom(b.platform);
            const platform = platformKey ? PLATFORMS[platformKey] : null;
            const nights = Math.max(
              1,
              Math.round(
                (Date.UTC(+b.check_out.slice(0, 4), +b.check_out.slice(5, 7) - 1, +b.check_out.slice(8, 10)) -
                  Date.UTC(+b.check_in.slice(0, 4), +b.check_in.slice(5, 7) - 1, +b.check_in.slice(8, 10))) /
                  86400000
              )
            );
            const payout = b.total_price ?? 0;
            return (
              <Link
                key={b.id}
                href={`/calendar?property=${b.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                style={{
                  borderBottom: i < bookings.length - 1 ? "1px solid rgba(237,231,219,0.5)" : "none",
                  backgroundColor: i % 2 === 0 ? "#fff" : "var(--shore)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(196,154,90,0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "var(--shore)";
                }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0 text-white font-bold"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--mangrove), var(--tideline))",
                    fontSize: 12,
                  }}
                >
                  {initialsFor(b.guest_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold truncate" style={{ color: "var(--coastal)" }}>
                      {firstNameLastInitial(b.guest_name)}
                    </span>
                    {platform && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold"
                        style={{ height: 16, backgroundColor: platform.colorLight, color: platform.color }}
                      >
                        <Image src={platform.icon} alt={platform.name} width={8} height={8} />
                        {platform.name}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--tideline)" }}>
                    {shortDate(b.check_in)} – {shortDate(b.check_out)} · {nights} night{nights !== 1 ? "s" : ""}
                  </div>
                </div>
                <div
                  className="text-[13px] font-bold tabular-nums flex-shrink-0"
                  style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}
                >
                  ${payout.toLocaleString("en-US")}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChannelPerformance({
  channelRevenue,
  totalRevenue,
}: {
  channelRevenue: Record<string, number>;
  totalRevenue: number;
  propertyId: string;
}) {
  const total = Object.values(channelRevenue).reduce((s, v) => s + v, 0) || totalRevenue;
  const entries = Object.entries(channelRevenue)
    .map(([platform, revenue]) => ({ platform, revenue }))
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="pd-anim" style={{ animationDelay: "700ms" }}>
      <SectionLabel label="Channel performance" />
      <div
        className="rounded-2xl p-5 bg-white"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {entries.length === 0 ? (
          <div className="text-[13px]" style={{ color: "var(--tideline)" }}>
            No channel revenue yet. Connect a channel to start syncing bookings.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const key = platformKeyFrom(entry.platform);
              const platform = key ? PLATFORMS[key] : null;
              const pct = total > 0 ? Math.round((entry.revenue / total) * 100) : 0;
              return (
                <div key={entry.platform}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {platform && (
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          backgroundColor: platform.color,
                        }}
                      >
                        <Image src={platform.iconWhite} alt={platform.name} width={12} height={12} />
                      </div>
                    )}
                    <span className="text-[13px] font-semibold flex-1" style={{ color: "var(--coastal)" }}>
                      {platform?.name ?? entry.platform}
                    </span>
                    <span
                      className="text-[13px] font-bold tabular-nums"
                      style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}
                    >
                      ${Math.round(entry.revenue).toLocaleString("en-US")}
                    </span>
                  </div>
                  <div
                    className="rounded-full overflow-hidden"
                    style={{ height: 6, backgroundColor: "var(--dry-sand)" }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        backgroundColor: platform?.color ?? "var(--coastal)",
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--tideline)" }}>
                    {pct}% of total
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="mb-3 text-[11px] font-bold tracking-[0.08em] uppercase"
      style={{ color: "var(--golden)" }}
    >
      {label}
    </div>
  );
}

// ============ Pricing tab ============

function PricingTab({
  propertyId,
  recommendations,
}: {
  propertyId: string;
  recommendations: PricingRecommendation[];
}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const sevenFromNow = new Date();
  sevenFromNow.setDate(sevenFromNow.getDate() + 7);
  const sevenStr = sevenFromNow.toISOString().split("T")[0];

  const scorecard = useMemo(() => {
    const rows = recommendations.filter(
      (r) => r.current_rate != null && r.suggested_rate != null
    );
    if (rows.length === 0) {
      return { avgCurrent: 0, avgSuggested: 0, upside: 0, captured: 0 };
    }
    const avgCurrent = Math.round(
      rows.reduce((s, r) => s + (r.current_rate ?? 0), 0) / rows.length
    );
    const avgSuggested = Math.round(
      rows.reduce((s, r) => s + (r.suggested_rate ?? 0), 0) / rows.length
    );
    const upside = Math.round(
      rows.reduce(
        (s, r) =>
          s + Math.max(0, (r.suggested_rate ?? 0) - (r.current_rate ?? 0)),
        0
      )
    );
    const currentTotal = rows.reduce((s, r) => s + (r.current_rate ?? 0), 0);
    const suggestedTotal = rows.reduce((s, r) => s + (r.suggested_rate ?? 0), 0);
    const captured = suggestedTotal > 0 ? Math.round((currentTotal / suggestedTotal) * 100) : 100;
    return { avgCurrent, avgSuggested, upside, captured };
  }, [recommendations]);

  const actionable = useMemo(
    () =>
      recommendations
        .filter(
          (r) =>
            r.current_rate != null &&
            r.suggested_rate != null &&
            r.delta_abs != null &&
            Math.abs(r.delta_abs) >= 1
        )
        .slice(0, 20),
    [recommendations]
  );

  const actNow = actionable.filter((r) => r.date >= todayStr && r.date <= sevenStr);
  const comingUp = actionable.filter((r) => r.date > sevenStr).slice(0, 8);

  const empty = recommendations.length === 0;

  return (
    <div className="mt-6 space-y-6">
      {empty ? (
        <div
          className="pd-anim p-10 text-center rounded-2xl bg-white"
          style={{ boxShadow: "var(--shadow-card)", animationDelay: "100ms" }}
        >
          <div
            className="inline-flex items-center justify-center mb-4"
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: "rgba(196,154,90,0.1)",
              color: "var(--golden)",
            }}
          >
            <Zap size={24} strokeWidth={1.8} />
          </div>
          <h3 className="text-[18px] font-bold mb-2" style={{ color: "var(--coastal)" }}>
            Pricing engine is collecting data
          </h3>
          <p className="text-[13px] max-w-[440px] mx-auto" style={{ color: "var(--tideline)" }}>
            First recommendations will appear after 14 days of daily analysis. Meanwhile
            the engine is building your baseline from AirROI, bookings, events, and weather.
          </p>
        </div>
      ) : (
        <>
          <ScorecardBlock scorecard={scorecard} />
          <RecommendationsBlock
            actNow={actNow}
            comingUp={comingUp}
            propertyId={propertyId}
          />
          <PricingRulesBlock baseRate={scorecard.avgSuggested} />
        </>
      )}
    </div>
  );
}

function ScorecardBlock({
  scorecard,
}: {
  scorecard: { avgCurrent: number; avgSuggested: number; upside: number; captured: number };
}) {
  return (
    <div>
      <SectionLabel label="How you're performing" />
      <div
        className="rounded-2xl p-6 bg-white pd-anim"
        style={{ boxShadow: "var(--shadow-card)", animationDelay: "100ms" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--golden)" }}>
              Your avg rate
            </div>
            <div
              className="text-[26px] font-bold mt-1 tabular-nums"
              style={{ color: "var(--coastal)", letterSpacing: "-0.03em" }}
            >
              ${scorecard.avgCurrent}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--tideline)" }}>
              Next 30 days
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--golden)" }}>
              Koast suggestion
            </div>
            <div
              className="text-[26px] font-bold mt-1 tabular-nums"
              style={{ color: "var(--coastal)", letterSpacing: "-0.03em" }}
            >
              ${scorecard.avgSuggested}
            </div>
            <div
              className="text-[11px] mt-0.5 font-semibold"
              style={{
                color:
                  scorecard.avgSuggested > scorecard.avgCurrent
                    ? "var(--lagoon)"
                    : scorecard.avgSuggested < scorecard.avgCurrent
                    ? "var(--coral-reef)"
                    : "var(--tideline)",
              }}
            >
              {scorecard.avgSuggested > scorecard.avgCurrent ? (
                <>
                  <TrendingUp size={11} strokeWidth={2.5} className="inline mr-1" />+
                  ${scorecard.avgSuggested - scorecard.avgCurrent}/night avg
                </>
              ) : scorecard.avgSuggested < scorecard.avgCurrent ? (
                <>
                  <TrendingDown size={11} strokeWidth={2.5} className="inline mr-1" />-
                  ${scorecard.avgCurrent - scorecard.avgSuggested}/night avg
                </>
              ) : (
                "At market"
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--golden)" }}>
              Upside this month
            </div>
            <div
              className="text-[26px] font-bold mt-1 tabular-nums"
              style={{
                color: scorecard.upside > 0 ? "var(--lagoon)" : "var(--tideline)",
                letterSpacing: "-0.03em",
              }}
            >
              ${scorecard.upside.toLocaleString("en-US")}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--tideline)" }}>
              Leaving on the table
            </div>
          </div>
        </div>
        {/* Revenue captured bar */}
        <div className="pt-4" style={{ borderTop: "1px solid var(--dry-sand)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold" style={{ color: "var(--tideline)" }}>
              Revenue captured vs Koast potential
            </span>
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: "var(--coastal)" }}
            >
              {scorecard.captured}%
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 8, backgroundColor: "var(--dry-sand)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min(100, scorecard.captured)}%`,
                background: "linear-gradient(90deg, var(--lagoon), var(--golden))",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RecommendationsBlock({
  actNow,
  comingUp,
  propertyId,
}: {
  actNow: PricingRecommendation[];
  comingUp: PricingRecommendation[];
  propertyId: string;
}) {
  return (
    <div>
      <SectionLabel label="What Koast recommends" />
      <div
        className="rounded-2xl bg-white pd-anim overflow-hidden"
        style={{ boxShadow: "var(--shadow-card)", animationDelay: "200ms" }}
      >
        <RecGroup label="Act now" sublabel="Next 7 days" rows={actNow} propertyId={propertyId} />
        {comingUp.length > 0 && (
          <RecGroup
            label="Coming up"
            sublabel="8 – 30 days"
            rows={comingUp}
            propertyId={propertyId}
            border
          />
        )}
      </div>
    </div>
  );
}

function RecGroup({
  label,
  sublabel,
  rows,
  propertyId,
  border = false,
}: {
  label: string;
  sublabel: string;
  rows: PricingRecommendation[];
  propertyId: string;
  border?: boolean;
}) {
  if (rows.length === 0 && label === "Act now") {
    return (
      <div
        className="px-5 py-5 flex items-center justify-between"
        style={border ? { borderTop: "1px solid var(--dry-sand)" } : {}}
      >
        <div>
          <div className="text-[12px] font-bold" style={{ color: "var(--coastal)" }}>
            {label}
          </div>
          <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
            {sublabel}
          </div>
        </div>
        <div className="text-[12px]" style={{ color: "var(--tideline)" }}>
          Nothing urgent — you&apos;re matched to Koast&apos;s suggestions this week.
        </div>
      </div>
    );
  }

  return (
    <div style={border ? { borderTop: "1px solid var(--dry-sand)" } : {}}>
      <div
        className="px-5 pt-4 pb-2 flex items-center justify-between"
        style={{ backgroundColor: label === "Act now" ? "rgba(26,122,90,0.04)" : "transparent" }}
      >
        <div>
          <div className="text-[12px] font-bold" style={{ color: "var(--coastal)" }}>
            {label}
          </div>
          <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
            {sublabel}
          </div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--tideline)" }}>
          {rows.length} recommendation{rows.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div>
        {rows.map((rec) => (
          <RecRow key={`${propertyId}-${rec.date}`} rec={rec} />
        ))}
      </div>
    </div>
  );
}

function RecRow({ rec }: { rec: PricingRecommendation }) {
  const delta = rec.delta_abs ?? 0;
  const positive = delta > 0;
  const dateLabel = new Date(rec.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Pull the first signal that looks like a driver reason for display
  const reasonText = extractReason(rec.reason_signals);

  return (
    <div
      className="grid items-center px-5 py-3"
      style={{
        gridTemplateColumns: "100px 1fr 120px 110px",
        borderTop: "1px solid rgba(237,231,219,0.5)",
        gap: 12,
      }}
    >
      <div>
        <div className="text-[12px] font-semibold" style={{ color: "var(--coastal)" }}>
          {dateLabel}
        </div>
      </div>
      <div className="min-w-0">
        <div
          className="text-[12px] truncate"
          style={{ color: "var(--tideline)" }}
          title={reasonText}
        >
          {reasonText}
        </div>
      </div>
      <div className="flex items-center gap-1.5 tabular-nums">
        <span className="text-[12px]" style={{ color: "var(--tideline)" }}>
          ${Math.round(rec.current_rate ?? 0)}
        </span>
        <span style={{ color: "var(--shell)" }}>→</span>
        <span
          className="text-[13px] font-bold"
          style={{ color: positive ? "var(--lagoon)" : "var(--coral-reef)" }}
        >
          ${Math.round(rec.suggested_rate ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: positive ? "var(--lagoon)" : "var(--coral-reef)" }}
        >
          {positive ? "+" : ""}
          {Math.round(delta)}
        </span>
        <button
          type="button"
          className="text-[11px] font-semibold transition-colors"
          style={{
            padding: "5px 10px",
            borderRadius: 8,
            backgroundColor: "var(--coastal)",
            color: "var(--shore)",
          }}
          title="Push this rate to all connected channels"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function extractReason(signals: Record<string, unknown> | null): string {
  if (!signals || typeof signals !== "object") return "Engine-driven adjustment";
  // Find the factor with the largest absolute dollar impact
  let best: { name: string; reason: string | null; delta: number } | null = null;
  for (const [name, raw] of Object.entries(signals)) {
    if (!raw || typeof raw !== "object") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val: any = raw;
    const deltaNum = Number(val.delta ?? val.impact ?? 0);
    if (!Number.isFinite(deltaNum) || Math.abs(deltaNum) < 1) continue;
    if (!best || Math.abs(deltaNum) > Math.abs(best.delta)) {
      best = { name, reason: typeof val.reason === "string" ? val.reason : null, delta: deltaNum };
    }
  }
  if (!best) return "Engine-driven adjustment";
  const label =
    best.name === "demand"
      ? "High demand"
      : best.name === "events"
      ? "Local event nearby"
      : best.name === "seasonality"
      ? "Seasonal peak"
      : best.name === "competitor"
      ? "Comp set shift"
      : best.name === "gap_night"
      ? "Gap night — lower to fill"
      : best.name === "booking_pace"
      ? "Booking pace shift"
      : best.name === "weather"
      ? "Weather forecast"
      : best.name.replace(/_/g, " ");
  const prefix = label.charAt(0).toUpperCase() + label.slice(1);
  return best.reason ? `${prefix} · ${best.reason}` : prefix;
}

function PricingRulesBlock({ baseRate }: { baseRate: number }) {
  return (
    <div>
      <SectionLabel label="Pricing rules" />
      <div
        className="rounded-2xl p-6 bg-white pd-anim"
        style={{ boxShadow: "var(--shadow-card)", animationDelay: "280ms" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <RuleField label="Base rate" value={baseRate > 0 ? `$${baseRate}` : "—"} />
          <RuleField label="Min rate" value="—" placeholder="Not set" />
          <RuleField label="Max rate" value="—" placeholder="Not set" />
        </div>
        <div
          className="pt-5 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--dry-sand)" }}
        >
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "var(--coastal)" }}>
              Auto-apply suggestions
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--tideline)" }}>
              Let Koast push recommended rates automatically within your guardrails.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ color: "var(--golden)" }}
            >
              Coming soon
            </span>
            <div
              className="relative"
              style={{
                width: 42,
                height: 22,
                borderRadius: 11,
                backgroundColor: "var(--shell)",
                opacity: 0.6,
                cursor: "not-allowed",
              }}
            >
              <div
                className="absolute top-[2px] left-[2px] bg-white rounded-full"
                style={{ width: 18, height: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleField({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ backgroundColor: "var(--shore)", border: "1px solid var(--dry-sand)" }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[0.06em]"
        style={{ color: "var(--golden)" }}
      >
        {label}
      </div>
      <div
        className="text-[18px] font-bold tabular-nums mt-0.5"
        style={{ color: value === "—" ? "var(--tideline)" : "var(--coastal)" }}
      >
        {value}
      </div>
      {placeholder && value === "—" && (
        <div className="text-[10px]" style={{ color: "var(--tideline)" }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}

// ============ Settings modal ============

function PropertySettingsModal({
  property,
  onClose,
  onSaved,
}: {
  property: PropertyDetailProps["property"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [form, setForm] = useState({
    name: property.name,
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    zip: property.zip ?? "",
    latitude: "",
    longitude: "",
    bedrooms: property.bedrooms ?? 1,
    bathrooms: property.bathrooms ?? 1,
    max_guests: property.max_guests ?? 2,
    property_type: property.property_type ?? "entire_home",
  });

  const handleSave = useCallback(async () => {
    setSaving(true);
    let lat: number | null = form.latitude ? parseFloat(form.latitude) : null;
    let lng: number | null = form.longitude ? parseFloat(form.longitude) : null;
    if (!lat && (form.address || form.city)) {
      try {
        const { geocodeAddress } = await import("@/lib/geocode");
        const result = await geocodeAddress(form.address, form.city, form.state);
        if (result) {
          lat = result.lat;
          lng = result.lng;
        }
      } catch {
        /* geocode failed — save without coords */
      }
    }

    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from("properties") as any;
    const { error } = await table
      .update({
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        latitude: lat,
        longitude: lng,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        max_guests: form.max_guests,
        property_type: form.property_type,
      })
      .eq("id", property.id);

    setSaving(false);
    if (error) {
      toast("Failed to update property", "error");
      return;
    }
    toast("Property updated");
    onSaved();
    onClose();
  }, [form, property.id, toast, onClose, onSaved]);

  const handleDelete = useCallback(async () => {
    if (deleteConfirmName !== property.name) {
      toast("Property name doesn't match — type the name exactly to confirm", "error");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/properties/${property.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast("Property deleted. Channel connections removed.", "success");
      router.push("/properties");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
      setDeleting(false);
    }
  }, [deleteConfirmName, property.id, property.name, router, toast]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white max-h-[88vh] overflow-hidden flex flex-col"
        style={{
          borderRadius: 16,
          width: 520,
          boxShadow: "0 8px 40px rgba(19,46,32,0.2), 0 2px 8px rgba(19,46,32,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--coastal)" }}>
            Property settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--tideline)" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Field label="Property name">
            <TextInput
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="e.g. Villa Jamaica"
            />
          </Field>

          <Field label="Address">
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => setForm({ ...form, address: v })}
              onSelect={(r) => {
                setForm((prev) => ({
                  ...prev,
                  address: r.address,
                  city: r.city,
                  state: r.state,
                  zip: r.zip,
                  latitude: String(r.latitude),
                  longitude: String(r.longitude),
                }));
              }}
              placeholder="Start typing an address..."
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="City">
              <TextInput value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            </Field>
            <Field label="State">
              <TextInput value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
            </Field>
            <Field label="ZIP">
              <TextInput value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
            </Field>
          </div>

          <Field label="Property type">
            <select
              value={form.property_type}
              onChange={(e) => setForm({ ...form, property_type: e.target.value })}
              className="w-full outline-none transition-all"
              style={{
                padding: "9px 12px",
                border: "1.5px solid var(--dry-sand)",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                color: "var(--coastal)",
                backgroundColor: "rgba(255,255,255,0.7)",
              }}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Bedrooms">
              <Stepper
                value={form.bedrooms}
                min={0}
                onChange={(v) => setForm({ ...form, bedrooms: v })}
              />
            </Field>
            <Field label="Bathrooms">
              <Stepper
                value={form.bathrooms}
                min={0}
                step={0.5}
                onChange={(v) => setForm({ ...form, bathrooms: v })}
              />
            </Field>
            <Field label="Max guests">
              <Stepper
                value={form.max_guests}
                min={1}
                onChange={(v) => setForm({ ...form, max_guests: v })}
              />
            </Field>
          </div>

          {/* Danger zone */}
          <div className="pt-5 mt-4" style={{ borderTop: "1px solid var(--dry-sand)" }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-2" style={{ color: "var(--coral-reef)" }}>
              Danger zone
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDelete(true);
                setDeleteConfirmName("");
              }}
              className="px-4 py-2 text-[12px] font-semibold transition-colors"
              style={{
                borderRadius: 10,
                backgroundColor: "rgba(196,64,64,0.08)",
                color: "var(--coral-reef)",
                border: "1px solid rgba(196,64,64,0.2)",
              }}
            >
              Delete property
            </button>
          </div>
        </div>

        <div className="p-6 pt-4 flex justify-end gap-2" style={{ borderTop: "1px solid var(--dry-sand)" }}>
          <button
            type="button"
            onClick={onClose}
            className="py-[9px] px-4 text-xs font-semibold transition-colors"
            style={{
              borderRadius: 10,
              backgroundColor: "#fff",
              border: "1px solid var(--dry-sand)",
              color: "var(--coastal)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="py-[9px] px-4 text-xs font-semibold transition-colors disabled:opacity-60"
            style={{
              borderRadius: 10,
              backgroundColor: "var(--coastal)",
              color: "var(--shore)",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowDelete(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6"
            style={{ boxShadow: "0 8px 40px rgba(19,46,32,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: "rgba(196,64,64,0.12)",
                  color: "var(--coral-reef)",
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-bold" style={{ color: "var(--coastal)" }}>
                  Delete {property.name}?
                </h3>
                <p className="text-[13px] mt-1" style={{ color: "var(--tideline)" }}>
                  This permanently deletes all bookings, calendar rates, and channel connections.
                  Channex channels and rate plans will be removed. This cannot be undone.
                </p>
              </div>
            </div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--tideline)" }}>
              Type{" "}
              <span className="font-mono font-bold" style={{ color: "var(--coral-reef)" }}>
                {property.name}
              </span>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              className="w-full outline-none transition-all mb-4"
              style={{
                padding: "9px 12px",
                border: "1.5px solid var(--dry-sand)",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                color: "var(--coastal)",
              }}
              placeholder={property.name}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="py-[9px] px-4 text-xs font-semibold"
                style={{
                  borderRadius: 10,
                  backgroundColor: "#fff",
                  border: "1px solid var(--dry-sand)",
                  color: "var(--coastal)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteConfirmName !== property.name}
                className="py-[9px] px-4 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 10,
                  backgroundColor: "var(--coral-reef)",
                  color: "#fff",
                }}
              >
                {deleting ? "Deleting…" : "Delete property"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block text-[10px] font-bold tracking-[0.06em] uppercase mb-1.5"
        style={{ color: "var(--tideline)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full outline-none transition-all"
      style={{
        padding: "9px 12px",
        border: "1.5px solid var(--dry-sand)",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 500,
        color: "var(--coastal)",
        backgroundColor: "rgba(255,255,255,0.7)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--golden)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--dry-sand)";
        e.currentTarget.style.boxShadow = "";
      }}
    />
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          border: "1px solid var(--dry-sand)",
          backgroundColor: "#fff",
          color: "var(--coastal)",
        }}
      >
        <Minus size={14} />
      </button>
      <div
        className="flex-1 text-center text-[14px] font-bold tabular-nums"
        style={{ color: "var(--coastal)" }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          border: "1px solid var(--dry-sand)",
          backgroundColor: "#fff",
          color: "var(--coastal)",
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
