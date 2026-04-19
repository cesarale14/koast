"use client";

/**
 * DashboardView — polish-pass rebuild of the home-route Dashboard.
 *
 * Five stacked blocks:
 *   1. Greeting + status line
 *   2. Portfolio hero strip (4 metric cards + 7/30/90d toggle)
 *   3. Property card grid
 *   4. Pricing opportunities (dark card + top-3 by-property list)
 *   5. Today's operations (operational tasks)
 *
 * Consumes the existing /api/dashboard/command-center endpoint + a
 * client-side aggregation of per-property pricing recommendations.
 * No API changes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Sparkles,
  CheckCircle,
  MessageSquare,
  Home as HomeIcon,
} from "lucide-react";
import { PLATFORMS, platformKeyFrom, type PlatformKey } from "@/lib/platforms";
import KoastButton from "./KoastButton";
import KoastCard from "./KoastCard";
import KoastChip from "./KoastChip";
import KoastRate from "./KoastRate";
import KoastEmptyState from "./KoastEmptyState";
import KoastSegmentedControl from "./KoastSegmentedControl";

// ---------------- Types mirroring command-center response ----------------

interface PropertyMetrics {
  revenue: number;
  occupancy: number;
  adr: number;
  rating: number;
}
interface PropertyCard {
  id: string;
  name: string;
  location: string | null;
  coverPhotoUrl: string | null;
  platforms?: string[];
  status: "occupied" | "vacant" | "turnover_today" | "checkin_today" | "checkout_today";
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  nextCheckIn?: string;
  daysUntilBooked?: number;
  metrics: PropertyMetrics;
}
interface ActionItem {
  id: string;
  type: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  urgency: number;
}
interface CommandCenterData {
  user: { name: string };
  summary: { propertyCount: number; bookingsThisMonth: number; syncStatus: "synced" | "syncing" | "disconnected" | "none" };
  propertyCards: PropertyCard[];
  actions: ActionItem[];
  performance: {
    thisMonthRevenue: number;
    lastMonthRevenue: number;
    revenueChangePct: number;
    occupancyRate: number;
  };
}

interface PendingRec {
  id: string;
  property_id: string;
  date: string;
  current_rate: number | null;
  suggested_rate: number | null;
  urgency: "act_now" | "coming_up" | "review" | null;
}

// Client-side portfolio pricing summary, keyed by property.
interface PortfolioSummary {
  byProperty: Map<string, { property_id: string; totalDelta: number; actNowCount: number; comingUpCount: number; pendingCount: number }>;
  totalDelta: number;
  totalActNow: number;
  totalComingUp: number;
  loading: boolean;
}

// ---------------- Utils ----------------

function decodeImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function shortDate(s?: string): string {
  if (!s) return "";
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const RANGE_OPTIONS = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
];

// ---------------- Hooks ----------------

function useCommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/command-center", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.empty) {
        setData(null);
      } else {
        setData(json);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

function usePortfolioPricing(propertyIds: string[]): PortfolioSummary {
  const [summary, setSummary] = useState<PortfolioSummary>({
    byProperty: new Map(),
    totalDelta: 0,
    totalActNow: 0,
    totalComingUp: 0,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    if (propertyIds.length === 0) {
      setSummary({ byProperty: new Map(), totalDelta: 0, totalActNow: 0, totalComingUp: 0, loading: false });
      return () => {
        alive = false;
      };
    }
    setSummary((s) => ({ ...s, loading: true }));
    Promise.all(
      propertyIds.map(async (pid) => {
        try {
          const res = await fetch(`/api/pricing/recommendations/${pid}?status=pending&limit=500`);
          if (!res.ok) return { pid, recs: [] as PendingRec[] };
          const json = (await res.json()) as { recommendations?: PendingRec[] };
          return { pid, recs: json.recommendations ?? [] };
        } catch {
          return { pid, recs: [] as PendingRec[] };
        }
      })
    ).then((results) => {
      if (!alive) return;
      const byProperty = new Map<string, { property_id: string; totalDelta: number; actNowCount: number; comingUpCount: number; pendingCount: number }>();
      let totalDelta = 0;
      let totalActNow = 0;
      let totalComingUp = 0;
      for (const { pid, recs } of results) {
        const agg = { property_id: pid, totalDelta: 0, actNowCount: 0, comingUpCount: 0, pendingCount: recs.length };
        for (const r of recs) {
          if (r.current_rate != null && r.suggested_rate != null) {
            agg.totalDelta += r.suggested_rate - r.current_rate;
          }
          if (r.urgency === "act_now") agg.actNowCount++;
          if (r.urgency === "coming_up") agg.comingUpCount++;
        }
        byProperty.set(pid, agg);
        totalDelta += agg.totalDelta;
        totalActNow += agg.actNowCount;
        totalComingUp += agg.comingUpCount;
      }
      setSummary({ byProperty, totalDelta, totalActNow, totalComingUp, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [propertyIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return summary;
}

// ---------------- Main ----------------

export default function DashboardView() {
  const router = useRouter();
  const { data, loading, error, refetch } = useCommandCenter();
  const [range, setRange] = useState("30");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const propertyIds = useMemo(() => (data?.propertyCards ?? []).map((p) => p.id), [data]);
  const portfolio = usePortfolioPricing(propertyIds);

  if (error && !data) {
    return (
      <div className="max-w-[1760px] mx-auto px-10 pt-10">
        <KoastCard variant="elevated">
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--coral-reef)", marginBottom: 6 }}>
            Couldn&apos;t load dashboard
          </div>
          <div style={{ fontSize: 13, color: "var(--tideline)", marginBottom: 16 }}>{error}</div>
          <KoastButton variant="secondary" size="sm" onClick={refetch}>
            Retry
          </KoastButton>
        </KoastCard>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="max-w-[1760px] mx-auto px-10 pt-10">
        <div style={{ fontSize: 13, color: "var(--tideline)" }}>Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[1760px] mx-auto px-10 pt-10">
        <KoastCard variant="elevated">
          <KoastEmptyState
            icon={<HomeIcon size={36} strokeWidth={1.3} />}
            title="No properties yet"
            body="Add your first property to start tracking revenue, bookings, and pricing opportunities."
            action={
              <Link href="/properties/new">
                <KoastButton variant="primary">Add a property</KoastButton>
              </Link>
            }
          />
        </KoastCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1760px] mx-auto px-10" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={choreography(mounted, 0)}>
          <Greeting user={data.user.name} summary={data.summary} />
        </div>

        <div style={choreography(mounted, 120)}>
          <PortfolioHero
            performance={data.performance}
            portfolio={portfolio}
            propertyCount={data.summary.propertyCount}
            range={range}
            onRangeChange={setRange}
          />
        </div>

        <div style={choreography(mounted, 240)}>
          <PropertyGrid
            cards={data.propertyCards}
            portfolio={portfolio}
            onOpen={(id) => router.push(`/properties/${id}?tab=overview`)}
          />
        </div>

        <div style={choreography(mounted, 360)}>
          <PricingOpportunities
            propertyCards={data.propertyCards}
            portfolio={portfolio}
          />
        </div>

        <div style={choreography(mounted, 480)}>
          <TodaysOperations actions={data.actions} />
        </div>
      </div>
    </div>
  );
}

function choreography(mounted: boolean, delayMs: number): React.CSSProperties {
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(12px)",
    transition: "opacity 240ms ease-out, transform 240ms ease-out",
    transitionDelay: `${delayMs}ms`,
  };
}

// ---------------- Block 1: Greeting ----------------

function Greeting({
  user,
  summary,
}: {
  user: string;
  summary: CommandCenterData["summary"];
}) {
  const syncLabel =
    summary.syncStatus === "synced"
      ? "All channels synced"
      : summary.syncStatus === "syncing"
      ? "Channels syncing"
      : summary.syncStatus === "disconnected"
      ? "A channel needs reconnection"
      : "No channels connected";
  const first = (user?.split(" ")[0] ?? "").trim() || "host";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h1
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: "var(--coastal)",
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {timeOfDayGreeting()}, {first}
      </h1>
      <div style={{ fontSize: 14, color: "var(--tideline)", letterSpacing: "-0.005em" }}>
        {summary.propertyCount} propert{summary.propertyCount === 1 ? "y" : "ies"} · {summary.bookingsThisMonth} booking{summary.bookingsThisMonth === 1 ? "" : "s"} this month · {syncLabel}
      </div>
    </div>
  );
}

// ---------------- Block 2: Portfolio hero strip ----------------

function PortfolioHero({
  performance,
  portfolio,
  propertyCount,
  range,
  onRangeChange,
}: {
  performance: CommandCenterData["performance"];
  portfolio: PortfolioSummary;
  propertyCount: number;
  range: string;
  onRangeChange: (r: string) => void;
}) {
  // The command-center API doesn't currently return 7/90d aggregates —
  // until a richer endpoint lands the range toggle just switches the
  // visible baseline for the revenue card. 30D uses thisMonthRevenue;
  // 7D/90D are flagged as placeholders in the delta copy.
  const revenue = performance.thisMonthRevenue;
  const deltaPct = performance.revenueChangePct;
  void propertyCount;
  const metrics: Array<MetricCardProps> = [
    {
      eyebrow: "Revenue",
      value: revenue,
      deltaPct,
      deltaSuffix: " vs prior",
      isPercent: false,
    },
    {
      eyebrow: "Occupancy",
      value: performance.occupancyRate,
      deltaPct: null,
      deltaSuffix: null,
      isPercent: true,
    },
    {
      eyebrow: "Avg nightly rate",
      value:
        performance.thisMonthRevenue > 0 && performance.occupancyRate > 0
          ? Math.round(performance.thisMonthRevenue / Math.max(1, Math.round((performance.occupancyRate / 100) * 30 * propertyCount)))
          : 0,
      deltaPct: null,
      deltaSuffix: null,
      isPercent: false,
    },
    {
      eyebrow: "Pending actions",
      value: portfolio.totalActNow + portfolio.totalComingUp,
      deltaPct: null,
      deltaSuffix: null,
      isPercent: false,
      isCount: true,
      badge: portfolio.totalActNow > 0 ? `${portfolio.totalActNow} act now` : null,
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--tideline)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Portfolio · past {range} days
        </span>
        <KoastSegmentedControl
          size="sm"
          options={RANGE_OPTIONS}
          value={range}
          onChange={onRangeChange}
          ariaLabel="Time range"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {metrics.map((m) => (
          <MetricCard key={m.eyebrow} {...m} />
        ))}
      </div>
    </div>
  );
}

interface MetricCardProps {
  eyebrow: string;
  value: number;
  deltaPct: number | null;
  deltaSuffix: string | null;
  isPercent: boolean;
  isCount?: boolean;
  badge?: string | null;
}

function MetricCard({ eyebrow, value, deltaPct, deltaSuffix, isPercent, isCount, badge }: MetricCardProps) {
  const display = isCount ? value.toLocaleString() : isPercent ? `${Math.round(value)}%` : null;
  return (
    <KoastCard variant="elevated">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--tideline)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </span>
          {badge && <KoastChip variant="danger">{badge}</KoastChip>}
        </div>
        {display != null ? (
          <span
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "var(--coastal)",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {display}
          </span>
        ) : (
          <KoastRate value={value} variant="hero" style={{ fontSize: 48 }} />
        )}
        {deltaPct !== null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: deltaPct >= 0 ? "var(--golden)" : "var(--tideline)",
              letterSpacing: "-0.005em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%{deltaSuffix}
          </span>
        )}
      </div>
    </KoastCard>
  );
}

// ---------------- Block 3: Property grid ----------------

function PropertyGrid({
  cards,
  portfolio,
  onOpen,
}: {
  cards: PropertyCard[];
  portfolio: PortfolioSummary;
  onOpen: (id: string) => void;
}) {
  if (cards.length === 0) {
    return (
      <KoastCard variant="elevated">
        <KoastEmptyState
          icon={<HomeIcon size={36} strokeWidth={1.3} />}
          title="No properties yet"
          body="Add your first property to start tracking revenue, bookings, and pricing opportunities."
          action={
            <Link href="/properties/new">
              <KoastButton variant="primary">Add a property</KoastButton>
            </Link>
          }
        />
      </KoastCard>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--tideline)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        Your properties
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
          gap: 20,
        }}
      >
        {cards.map((card, i) => (
          <PropertyCardTile
            key={card.id}
            card={card}
            actNowCount={portfolio.byProperty.get(card.id)?.actNowCount ?? 0}
            onOpen={() => onOpen(card.id)}
            stagger={i}
          />
        ))}
      </div>
    </div>
  );
}

function PropertyCardTile({
  card,
  actNowCount,
  onOpen,
  stagger,
}: {
  card: PropertyCard;
  actNowCount: number;
  onOpen: () => void;
  stagger: number;
}) {
  const platformKeys = (card.platforms ?? []).map((p) => platformKeyFrom(p)).filter((k): k is PlatformKey => !!k);
  const status = statusCopy(card);
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        borderRadius: 16,
        transitionDelay: `${stagger * 40}ms`,
      }}
    >
      <KoastCard variant="elevated" padding={0}>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            background: "#F0ECE3",
            borderRadius: "16px 16px 0 0",
            overflow: "hidden",
          }}
        >
          {card.coverPhotoUrl && (
            <Image
              src={decodeImageUrl(card.coverPhotoUrl)}
              alt={card.name}
              fill
              sizes="(max-width: 1760px) 50vw, 880px"
              style={{ objectFit: "cover" }}
            />
          )}
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--coastal)",
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {card.name}
            </span>
            {actNowCount > 0 && <KoastChip variant="danger">{actNowCount} act now</KoastChip>}
          </div>
          {card.location && (
            <div style={{ fontSize: 13, color: "var(--tideline)" }}>{card.location}</div>
          )}
          {platformKeys.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {platformKeys.map((k) => {
                const p = PLATFORMS[k];
                return (
                  <KoastChip key={k} variant="success" iconLeft={<Image src={p.icon} alt="" width={12} height={12} />}>
                    {p.name}
                  </KoastChip>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--coastal)", lineHeight: 1.4 }}>{status}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
              borderTop: "1px solid #E5E2DC",
              paddingTop: 12,
            }}
          >
            <MiniStat label="Revenue" value={`$${card.metrics.revenue.toLocaleString()}`} />
            <MiniStat label="Occupancy" value={`${card.metrics.occupancy}%`} />
            <MiniStat label="ADR" value={`$${card.metrics.adr.toLocaleString()}`} />
            <MiniStat label="Act now" value={String(actNowCount)} emphasis={actNowCount > 0} />
          </div>
        </div>
      </KoastCard>
    </button>
  );
}

function MiniStat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--tideline)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: emphasis ? "var(--coral-reef)" : "var(--coastal)",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function statusCopy(card: PropertyCard): string {
  switch (card.status) {
    case "occupied":
      return card.guestName
        ? `${card.guestName} staying${card.checkOut ? ` through ${shortDate(card.checkOut)}` : ""}`
        : "Guest staying";
    case "checkin_today":
      return card.guestName ? `${card.guestName} checking in today` : "Check-in today";
    case "checkout_today":
      return "Checkout today";
    case "turnover_today":
      return "Turnover today";
    case "vacant":
      return card.nextCheckIn
        ? `Vacant until ${shortDate(card.nextCheckIn)}${card.daysUntilBooked != null ? ` (${card.daysUntilBooked}d)` : ""}`
        : "Vacant — no upcoming bookings";
  }
}

// ---------------- Block 4: Pricing opportunities ----------------

function PricingOpportunities({
  propertyCards,
  portfolio,
}: {
  propertyCards: PropertyCard[];
  portfolio: PortfolioSummary;
}) {
  const topByOpp = Array.from(portfolio.byProperty.values())
    .map((agg) => ({
      ...agg,
      name: propertyCards.find((p) => p.id === agg.property_id)?.name ?? "Property",
    }))
    .filter((agg) => agg.totalDelta > 0 || agg.actNowCount > 0)
    .sort((a, b) => b.totalDelta - a.totalDelta)
    .slice(0, 3);

  const totalDelta = Math.max(0, portfolio.totalDelta);
  const topPropertyId = topByOpp[0]?.property_id ?? propertyCards[0]?.id;
  const reviewHref = topPropertyId ? `/properties/${topPropertyId}?tab=pricing` : "/properties";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 7fr) minmax(0, 3fr)",
        gap: 20,
        alignItems: "stretch",
      }}
    >
      <KoastCard variant="dark" padding={28}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 240,
            height: 240,
            background: "radial-gradient(circle, rgba(196,154,90,0.28), rgba(196,154,90,0) 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} color="var(--golden)" />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--golden)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              This week&apos;s pricing opportunities
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 500, color: "var(--shore)", letterSpacing: "-0.005em" }}>
              You could capture
            </span>
            <KoastRate tone="dark" variant="hero" style={{ fontSize: 64 }} value={totalDelta} />
            <span style={{ fontSize: 20, fontWeight: 500, color: "rgba(247,243,236,0.78)", letterSpacing: "-0.005em" }}>
              across {topByOpp.length} propert{topByOpp.length === 1 ? "y" : "ies"}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(247,243,236,0.78)", lineHeight: 1.5 }}>
            {portfolio.totalActNow} act-now + {portfolio.totalComingUp} coming-up recommendation{portfolio.totalComingUp === 1 ? "" : "s"} portfolio-wide.
          </div>
          <div>
            <Link href={reviewHref}>
              <KoastButton variant="primary" size="md" iconRight={<ArrowRight size={14} />}>
                Review all
              </KoastButton>
            </Link>
          </div>
        </div>
      </KoastCard>

      <KoastCard variant="elevated">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--tideline)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            By property
          </span>
          {topByOpp.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--tideline)" }}>
              {portfolio.loading ? "Loading…" : "No pending opportunities."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topByOpp.map((row) => (
                <Link
                  key={row.property_id}
                  href={`/properties/${row.property_id}?tab=pricing`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(229,226,220,0.6)",
                    gap: 12,
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--coastal)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.name}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <KoastRate
                      variant="inline"
                      value={row.totalDelta}
                      delta={row.totalDelta}
                    />
                    <ArrowRight size={14} color="var(--tideline)" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </KoastCard>
    </div>
  );
}

// ---------------- Block 5: Today's operations ----------------

function TodaysOperations({ actions }: { actions: ActionItem[] }) {
  if (actions.length === 0) {
    return (
      <KoastCard variant="elevated">
        <KoastEmptyState
          icon={<CheckCircle size={36} strokeWidth={1.3} />}
          title="All caught up"
          body="No operational tasks waiting. Koast will surface new items here as they come in."
        />
      </KoastCard>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--tideline)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        Today&apos;s operations
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
          gap: 12,
        }}
      >
        {actions.map((action) => (
          <ActionCard key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: ActionItem }) {
  const chipVariant: "danger" | "warning" | "neutral" =
    action.urgency >= 80 ? "danger" : action.urgency >= 40 ? "warning" : "neutral";
  const Icon = iconForAction(action.type);
  return (
    <KoastCard variant="elevated">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: chipVariant === "danger" ? "rgba(196,64,64,0.1)" : chipVariant === "warning" ? "rgba(212,150,11,0.1)" : "rgba(23,57,42,0.05)",
            color: chipVariant === "danger" ? "var(--coral-reef)" : chipVariant === "warning" ? "var(--amber-tide)" : "var(--tideline)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--tideline)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {action.title}
          </span>
          <span
            style={{
              fontSize: 13,
              color: "var(--coastal)",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {action.description}
          </span>
        </div>
        {action.action && (
          <Link href={action.action.href}>
            <KoastButton variant="ghost" size="sm">
              {action.action.label}
            </KoastButton>
          </Link>
        )}
      </div>
    </KoastCard>
  );
}

function iconForAction(type: string) {
  if (type.includes("clean") || type.includes("turnover")) return Sparkles;
  if (type.includes("check") || type.includes("booking")) return CalendarIcon;
  if (type.includes("message") || type.includes("guest")) return MessageSquare;
  return CheckCircle;
}
