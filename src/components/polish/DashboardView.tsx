"use client";

/**
 * DashboardView — Session 3.7 rebuild against the "Quiet" design
 * direction.
 *
 * Five sections, restraint-first visual language:
 *   1. Greeting + critical alert (conditional)
 *   2. Your properties (3-col grid + ghost add-card)
 *   3. Today's focus (dark pricing intel + action cards)
 *   4. Portfolio pulse (hairline-only metric strip)
 *   5. Footer
 *
 * Principles: flat containment, status via colored dots, single
 * focal card (the dark pricing-intelligence moment), no competing
 * shadows / gradients. See master plan Principles 8–10.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Command as CommandIcon,
  Plus,
} from "lucide-react";
import KoastSegmentedControl from "./KoastSegmentedControl";
import KoastEmptyState from "./KoastEmptyState";
import StatusDot from "./StatusDot";
import HandwrittenGreeting from "./HandwrittenGreeting";
import PlatformPills, { type ConnectedPlatform } from "./PlatformPills";

// ---------------- Types ----------------

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
  connectedPlatforms?: ConnectedPlatform[];
  status: "occupied" | "vacant" | "turnover_today" | "checkin_today" | "checkout_today";
  primaryStatus: string;
  secondaryStatus: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  nextCheckIn?: string;
  daysUntilBooked?: number;
  metrics: PropertyMetrics;
}
interface Alert {
  id: string;
  type: "cleaning" | "sync" | "pricing" | "message";
  subject: string;
  message: string;
  cta: { label: string; href: string };
}
interface FocusAction {
  id: string;
  priority: "urgent" | "warn" | "normal";
  title: string;
  sub: string;
  cta: { label: string; href: string };
}
interface PulseMetric {
  label: string;
  value: number;
  valueDisplay: string;
  deltaDirection: "up" | "down" | "flat";
  deltaText: string;
  prior: number;
}
interface CommandCenterData {
  user: { name: string };
  summary: { propertyCount: number; bookingsThisMonth: number; syncStatus: "synced" | "syncing" | "disconnected" | "none" };
  greetingStatus: string;
  criticalAlerts: Alert[];
  propertyCards: PropertyCard[];
  focusActions: FocusAction[];
  pulseMetrics: PulseMetric[];
  performance: { thisMonthRevenue: number; revenueChangePct: number; occupancyRate: number };
}

interface PendingRec {
  id: string;
  property_id: string;
  date: string;
  urgency: "act_now" | "coming_up" | "review" | null;
  current_rate: number | null;
  suggested_rate: number | null;
}

// ---------------- Helpers ----------------

function decodeImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function timeOfDayKey(): "morning" | "afternoon" | "evening" {
  // Mirrors the handoff's windows: morning 4am–12pm, afternoon
  // 12pm–6pm, evening 6pm–4am. Client-side so we respect the host's
  // local timezone (the server runs UTC).
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

// Mock a 7-point series from current + prior values. Linear
// interpolation with a hint of jitter so the sparkline doesn't look
// like a straight line. Replace when a real time-series endpoint
// lands (tracked in CLAUDE.md Known Gaps).
function mockSeries(current: number, prior: number): number[] | null {
  if (current === 0 && prior === 0) return null;
  const pts = 7;
  const out: number[] = [];
  for (let i = 0; i < pts; i++) {
    const t = i / (pts - 1);
    const base = prior + (current - prior) * t;
    const wobble = (Math.sin(i * 1.6) * Math.max(current, prior)) * 0.03;
    out.push(Math.max(0, base + wobble));
  }
  return out;
}

function renderWithBold(text: string): React.ReactNode {
  // Lightweight **bold** Markdown handling — primaryStatus uses it.
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

const SYNC_DOT_TONE: Record<CommandCenterData["summary"]["syncStatus"], "ok" | "warn" | "alert" | "muted"> = {
  synced: "ok",
  syncing: "warn",
  disconnected: "alert",
  none: "muted",
};

function syncLabel(status: CommandCenterData["summary"]["syncStatus"]): string {
  if (status === "synced") return "All channels synced";
  if (status === "syncing") return "Channels syncing";
  if (status === "disconnected") return "A channel needs reconnection";
  return "No channels connected";
}

function propertyStatusTone(status: PropertyCard["status"]): "ok" | "warn" | "alert" | "muted" {
  if (status === "checkout_today" || status === "turnover_today") return "warn";
  return "ok";
}

// ---------------- Hooks ----------------

// Viewport breakpoints shared across Dashboard sections. Matches the
// Session 3.7 spec (< 720 collapses to single-column, < 1100 collapses
// multi-column grids to 2-col) and stacks vertical layouts on mobile.
function useViewport() {
  const [vp, setVp] = useState<{ isMobile: boolean; isNarrow: boolean }>(
    { isMobile: false, isNarrow: false }
  );
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      setVp({ isMobile: w < 720, isNarrow: w < 1100 });
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return vp;
}

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
      setData(json.empty ? null : json);
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

function usePendingPerProperty(propertyIds: string[]): Map<string, number> {
  const [byId, setById] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let alive = true;
    if (propertyIds.length === 0) {
      setById(new Map());
      return () => {
        alive = false;
      };
    }
    Promise.all(
      propertyIds.map(async (pid) => {
        try {
          const res = await fetch(`/api/pricing/recommendations/${pid}?status=pending&limit=500`);
          if (!res.ok) return { pid, count: 0 };
          const json = (await res.json()) as { recommendations?: PendingRec[] };
          return { pid, count: json.recommendations?.length ?? 0 };
        } catch {
          return { pid, count: 0 };
        }
      })
    ).then((results) => {
      if (!alive) return;
      const m = new Map<string, number>();
      for (const { pid, count } of results) m.set(pid, count);
      setById(m);
    });
    return () => {
      alive = false;
    };
  }, [propertyIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return byId;
}

// ---------------- Main ----------------

export default function DashboardView() {
  const { data, loading, error, refetch } = useCommandCenter();
  const vp = useViewport();
  const [pulseRange, setPulseRange] = useState("30d");
  const propertyIds = useMemo(() => (data?.propertyCards ?? []).map((p) => p.id), [data]);
  const pendingByProperty = usePendingPerProperty(propertyIds);
  const containerPaddingClass = vp.isMobile ? "px-5" : "px-12";

  if (error && !data) {
    return (
      <div className={`max-w-[1760px] mx-auto ${containerPaddingClass} pt-14`}>
        <p style={{ fontSize: 14, color: "var(--coral-reef)" }}>
          Couldn&apos;t load dashboard: {error}
        </p>
        <button
          onClick={refetch}
          style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "var(--coastal)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className={`max-w-[1760px] mx-auto ${containerPaddingClass} pt-14`}>
        <p style={{ fontSize: 13, color: "var(--tideline)" }}>Loading…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={`max-w-[1760px] mx-auto ${containerPaddingClass} pt-14`}>
        <KoastEmptyState
          title="No properties yet"
          body="Add your first property to see your Dashboard."
          action={
            <Link href="/properties/new" style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)" }}>
              Add a property →
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div
      className={`max-w-[1760px] mx-auto ${containerPaddingClass}`}
      style={{ paddingTop: vp.isMobile ? 32 : 56, paddingBottom: vp.isMobile ? 64 : 96 }}
    >
      <GreetingBlock user={data.user.name} summary={data.summary} greetingStatus={data.greetingStatus} criticalAlerts={data.criticalAlerts} vp={vp} />
      <PropertiesBlock cards={data.propertyCards} pendingByProperty={pendingByProperty} vp={vp} />
      <TodaysFocusBlock performance={data.performance} summary={data.summary} focusActions={data.focusActions} vp={vp} />
      <PortfolioPulseBlock metrics={data.pulseMetrics} range={pulseRange} onRangeChange={setPulseRange} vp={vp} />
      <FooterBlock syncStatus={data.summary.syncStatus} vp={vp} />
    </div>
  );
}

// ---------------- Section 1: Greeting + critical alert ----------------

function GreetingBlock({
  user,
  summary,
  greetingStatus,
  criticalAlerts,
  vp,
}: {
  user: string;
  summary: CommandCenterData["summary"];
  greetingStatus: string;
  criticalAlerts: Alert[];
  vp: { isMobile: boolean; isNarrow: boolean };
}) {
  const first = (user?.split(" ")[0] ?? "").trim() || "host";
  const alert = criticalAlerts[0] ?? null;
  const tone = SYNC_DOT_TONE[summary.syncStatus];
  const tod = timeOfDayKey();
  return (
    <section>
      <HandwrittenGreeting
        timeOfDay={tod}
        name={first}
        status={greetingStatus}
        compact={vp.isMobile}
      />
      <div
        style={{
          marginTop: 12,
          fontSize: vp.isMobile ? 12 : 13,
          color: "var(--tideline)",
          display: "flex",
          alignItems: "center",
          gap: vp.isMobile ? 8 : 12,
          flexWrap: "wrap",
        }}
      >
        <span>{summary.propertyCount} {summary.propertyCount === 1 ? "property" : "properties"}</span>
        <span style={{ color: "var(--shell)" }}>·</span>
        <span>{summary.bookingsThisMonth} {summary.bookingsThisMonth === 1 ? "booking" : "bookings"} this month</span>
        <span style={{ color: "var(--shell)" }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <StatusDot tone={tone} />
          {syncLabel(summary.syncStatus)}
        </span>
      </div>
      {alert && <CriticalAlertRow alert={alert} vp={vp} />}
    </section>
  );
}

function CriticalAlertRow({ alert, vp }: { alert: Alert; vp: { isMobile: boolean } }) {
  return (
    <div
      style={{
        marginTop: vp.isMobile ? 20 : 28,
        paddingTop: 14,
        paddingBottom: 14,
        borderTop: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
        display: "flex",
        alignItems: vp.isMobile ? "flex-start" : "center",
        flexDirection: vp.isMobile ? "column" : "row",
        gap: vp.isMobile ? 8 : 14,
      }}
    >
      <div style={{ display: "flex", alignItems: vp.isMobile ? "flex-start" : "center", gap: 14, flex: 1, minWidth: 0 }}>
        <StatusDot tone="alert" halo size={8} style={{ marginTop: vp.isMobile ? 6 : 0 }} />
        <span style={{ flex: 1, fontSize: 13, color: "var(--coastal)", lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 600 }}>{alert.subject}</strong> {alert.message}
        </span>
      </div>
      <Link
        href={alert.cta.href}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--coastal)",
          textDecoration: "none",
          flexShrink: 0,
          alignSelf: vp.isMobile ? "flex-start" : "center",
          paddingLeft: vp.isMobile ? 22 : 0,
          transition: "color 160ms cubic-bezier(0.4,0,0.2,1)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color = "var(--golden)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color = "var(--coastal)";
        }}
      >
        {alert.cta.label} →
      </Link>
    </div>
  );
}

// ---------------- Section 2: Your properties ----------------

function PropertiesBlock({
  cards,
  pendingByProperty,
  vp,
}: {
  cards: PropertyCard[];
  pendingByProperty: Map<string, number>;
  vp: { isMobile: boolean; isNarrow: boolean };
}) {
  const showGhost = cards.length <= 2;
  const maxShown = Math.min(cards.length, showGhost ? cards.length : 6);
  const visible = cards.slice(0, maxShown);
  const columns = vp.isMobile ? 1 : vp.isNarrow ? 2 : 3;
  return (
    <section style={{ marginTop: vp.isMobile ? 40 : 72 }}>
      <SectionHeader title="Your properties" action={<Link href="/properties" style={headerLinkStyle}>Manage all →</Link>} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: vp.isMobile ? 12 : 20,
        }}
      >
        {visible.map((card) => (
          <PropertyCardTile key={card.id} card={card} pending={pendingByProperty.get(card.id) ?? 0} vp={vp} />
        ))}
        {showGhost && <GhostAddCard />}
      </div>
    </section>
  );
}

function PropertyCardTile({ card, pending, vp }: { card: PropertyCard; pending: number; vp: { isMobile: boolean } }) {
  const [hover, setHover] = useState(false);
  const tone = propertyStatusTone(card.status);
  return (
    <Link
      href={`/properties/${card.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
        borderRadius: 16,
        background: "#fff",
        boxShadow: hover
          ? "0 10px 30px rgba(19,46,32,0.08), 0 0 0 1px var(--shell)"
          : "0 0 0 1px var(--hairline)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "box-shadow 300ms cubic-bezier(0.4,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: vp.isMobile ? 160 : 200,
          background: "linear-gradient(135deg, var(--driftwood), var(--coastal))",
        }}
      >
        {card.coverPhotoUrl && (
          <Image
            src={decodeImageUrl(card.coverPhotoUrl)}
            alt={card.name}
            fill
            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
            style={{ objectFit: "cover" }}
          />
        )}
      </div>
      <div style={{ padding: vp.isMobile ? 18 : 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot tone={tone} size={7} halo={tone === "alert" || tone === "warn"} />
          <h3
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: "var(--coastal)",
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {card.name}
          </h3>
        </div>
        {card.location && (
          <div style={{ marginTop: 4, marginLeft: 15, fontSize: 13, color: "var(--tideline)" }}>
            {card.location}
          </div>
        )}
        <div style={{ marginTop: 10, marginBottom: 0 }}>
          <PlatformPills platforms={card.connectedPlatforms ?? []} />
        </div>
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ color: "var(--coastal)" }}>{renderWithBold(card.primaryStatus)}</div>
          {card.secondaryStatus && (
            <div style={{ color: "var(--tideline)", marginTop: 2 }}>{card.secondaryStatus}</div>
          )}
        </div>
        <div
          style={{
            marginTop: 22,
            paddingTop: 20,
            borderTop: "1px solid var(--hairline)",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          <StatCell label="Revenue 30d" value={`$${card.metrics.revenue.toLocaleString()}`} />
          <StatCell label="Occupancy" value={`${card.metrics.occupancy}%`} divider />
          <StatCell label="ADR" value={`$${card.metrics.adr.toLocaleString()}`} divider />
        </div>
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px dashed var(--hairline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          {pending > 0 ? (
            <>
              <span style={{ fontSize: 12, color: "var(--tideline)" }}>
                <span style={{ fontWeight: 600, color: "var(--coral-reef)" }}>{pending} pending</span> pricing recs
              </span>
              <PendingLink href={`/properties/${card.id}?tab=pricing`} />
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--tideline)" }}>All caught up</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function PendingLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      style={{
        fontSize: 12,
        color: "var(--tideline)",
        textDecoration: "none",
        fontWeight: 500,
        transition: "color 160ms cubic-bezier(0.4,0,0.2,1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = "var(--coastal)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = "var(--tideline)";
      }}
    >
      Review →
    </Link>
  );
}

function StatCell({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <div
      style={{
        padding: divider ? "0 0 0 20px" : "0 20px 0 0",
        borderLeft: divider ? "1px solid var(--hairline)" : undefined,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--tideline)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 20,
          fontWeight: 600,
          color: "var(--coastal)",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function GhostAddCard() {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href="/properties/new"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 16,
        border: `1.5px dashed ${hover ? "var(--driftwood)" : "var(--hairline)"}`,
        background: hover ? "rgba(196,154,90,0.03)" : "transparent",
        color: hover ? "var(--coastal)" : "var(--tideline)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "40px 24px",
        textDecoration: "none",
        transition: "border-color 200ms cubic-bezier(0.4,0,0.2,1), background-color 200ms cubic-bezier(0.4,0,0.2,1), color 200ms cubic-bezier(0.4,0,0.2,1)",
        minHeight: 380,
      }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1.5px solid currentColor",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plus size={22} strokeWidth={1.3} />
      </span>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Add a property</span>
      <span style={{ fontSize: 12, color: "var(--tideline)", maxWidth: 220, textAlign: "center", lineHeight: 1.5 }}>
        Connect Airbnb, Booking.com, or set up direct
      </span>
    </Link>
  );
}

// ---------------- Section 3: Today's focus ----------------

function TodaysFocusBlock({
  performance,
  summary,
  focusActions,
  vp,
}: {
  performance: CommandCenterData["performance"];
  summary: CommandCenterData["summary"];
  focusActions: FocusAction[];
  vp: { isMobile: boolean; isNarrow: boolean };
}) {
  return (
    <section style={{ marginTop: vp.isMobile ? 40 : 72 }}>
      <SectionHeader title="Today's focus" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: vp.isNarrow ? "minmax(0, 1fr)" : "minmax(0, 1.5fr) minmax(0, 1fr)",
          gap: vp.isMobile ? 16 : 24,
          alignItems: "stretch",
        }}
      >
        <PricingIntelligenceCard performance={performance} propertyCount={summary.propertyCount} vp={vp} />
        <ActionCardStack actions={focusActions} />
      </div>
    </section>
  );
}

function PricingIntelligenceCard({ performance, propertyCount, vp }: { performance: CommandCenterData["performance"]; propertyCount: number; vp: { isMobile: boolean } }) {
  // Dynamic copy: when real opportunities exist, hero switches to
  // revenue framing. Absent that, the learning copy carries.
  const hasUpside = false; // TODO: wire from portfolio pricing hook when the property-level upside data is aggregated server-side
  const title = hasUpside
    ? "$0 across your portfolio."
    : "Measuring your rates, quietly.";
  const sub = hasUpside
    ? `Act-now + coming-up recommendations are surfaced per property. Acceptance: — (30d).`
    : `Koast is learning your rate patterns across ${propertyCount} propert${propertyCount === 1 ? "y" : "ies"} and 90 forward dates. Once we've captured more channel rates, we'll surface real opportunities here.`;
  void performance;

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 20,
        padding: vp.isMobile ? "28px 24px" : "44px 48px",
        color: "var(--shore)",
        background: "linear-gradient(150deg, var(--coastal) 0%, var(--deep-sea) 55%, #0e2419 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: vp.isMobile ? 240 : 320,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-30%",
          right: "-15%",
          width: 500,
          height: 500,
          background: "radial-gradient(circle, rgba(196,154,90,0.2) 0%, rgba(196,154,90,0) 55%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 28 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--driftwood)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Pricing intelligence
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
            fontWeight: 400,
            fontSize: vp.isMobile ? 24 : 36,
            color: "var(--shore)",
            letterSpacing: "-0.02em",
            maxWidth: 540,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--sandbar)",
            lineHeight: 1.6,
            maxWidth: 560,
          }}
        >
          {sub}
        </p>
      </div>
      <div style={{ position: "relative", display: "flex", gap: 10, marginTop: 32 }}>
        <Link
          href="/properties"
          style={{
            background: "var(--golden)",
            color: "var(--deep-sea)",
            fontWeight: 600,
            fontSize: 13,
            padding: "11px 18px",
            borderRadius: 8,
            textDecoration: "none",
            letterSpacing: "-0.005em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {hasUpside ? "Review recommendations" : "Review rules"}
        </Link>
        <Link
          href="/pricing"
          style={{
            background: "transparent",
            color: "var(--sandbar)",
            fontWeight: 500,
            fontSize: 13,
            padding: "11px 18px",
            borderRadius: 8,
            border: "1px solid rgba(232,213,176,0.22)",
            textDecoration: "none",
            letterSpacing: "-0.005em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          What we&apos;re learning
        </Link>
      </div>
    </article>
  );
}

function ActionCardStack({ actions }: { actions: FocusAction[] }) {
  if (actions.length === 0) {
    return (
      <article
        style={{
          borderRadius: 12,
          border: "1px solid var(--hairline)",
          padding: 24,
          background: "#fff",
        }}
      >
        <KoastEmptyState title="You're all caught up" body="Nothing needs your attention right now." />
      </article>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {actions.slice(0, 4).map((action) => (
        <ActionCard key={action.id} action={action} />
      ))}
    </div>
  );
}

function ActionCard({ action }: { action: FocusAction }) {
  const [hover, setHover] = useState(false);
  const tone = action.priority === "urgent" ? "alert" : action.priority === "warn" ? "warn" : "muted";
  return (
    <Link
      href={action.cta.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 20px",
        border: `1px solid ${hover ? "var(--shell)" : "var(--hairline)"}`,
        borderRadius: 12,
        background: "#fff",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 180ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <StatusDot tone={tone} size={8} halo={tone === "alert"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--deep-sea)", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {action.title}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "var(--tideline)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {action.sub}
        </div>
      </div>
      <ArrowRight
        size={16}
        style={{
          color: hover ? "var(--coastal)" : "rgba(61,107,82,0.4)",
          transition: "color 180ms cubic-bezier(0.4,0,0.2,1)",
          flexShrink: 0,
        }}
      />
    </Link>
  );
}

// ---------------- Section 4: Portfolio pulse ----------------

const PULSE_RANGE_OPTIONS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
];

function PortfolioPulseBlock({
  metrics,
  range,
  onRangeChange,
  vp,
}: {
  metrics: PulseMetric[];
  range: string;
  onRangeChange: (r: string) => void;
  vp: { isMobile: boolean; isNarrow: boolean };
}) {
  const cols = vp.isMobile ? 2 : metrics.length || 4;
  return (
    <section style={{ marginTop: vp.isMobile ? 40 : 72 }}>
      <SectionHeader
        title="Portfolio pulse"
        action={
          <KoastSegmentedControl
            size="sm"
            options={PULSE_RANGE_OPTIONS}
            value={range}
            onChange={onRangeChange}
            ariaLabel="Portfolio pulse range"
          />
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          columnGap: vp.isMobile ? 16 : 0,
          rowGap: vp.isMobile ? 24 : 0,
          paddingTop: vp.isMobile ? 20 : 28,
          borderTop: "1px solid var(--hairline)",
        }}
      >
        {metrics.map((m, i) => (
          <PulseMetricCell
            key={m.label}
            metric={m}
            isFirst={vp.isMobile ? i % 2 === 0 : i === 0}
            isLast={vp.isMobile ? i % 2 === 1 : i === metrics.length - 1}
            vp={vp}
          />
        ))}
      </div>
    </section>
  );
}

function PulseMetricCell({ metric, isFirst, isLast, vp }: { metric: PulseMetric; isFirst: boolean; isLast: boolean; vp: { isMobile: boolean } }) {
  const series = mockSeries(metric.value, metric.prior);
  const deltaColor = metric.deltaDirection === "up" ? "var(--lagoon)" : metric.deltaDirection === "down" ? "var(--coral-reef)" : "var(--tideline)";
  const deltaPrefix = metric.deltaDirection === "up" ? "▲ " : metric.deltaDirection === "down" ? "▼ " : "— ";
  const padX = vp.isMobile ? 0 : 32;
  return (
    <div
      style={{
        padding: `0 ${isLast ? 0 : padX}px 0 ${isFirst ? 0 : padX}px`,
        borderLeft: isFirst ? undefined : "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--tideline)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: vp.isMobile ? 8 : 12,
        }}
      >
        {metric.label}
      </div>
      <div
        style={{
          fontSize: vp.isMobile ? 24 : 32,
          fontWeight: 600,
          color: "var(--deep-sea)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.025em",
          lineHeight: 1,
        }}
      >
        {metric.valueDisplay}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: 500,
          color: deltaColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {deltaPrefix}{metric.deltaText.replace(/^[+\-]?\d+%?\s*/, "")}
      </div>
      {series && series.length >= 3 && (
        <Sparkline series={series} direction={metric.deltaDirection} />
      )}
    </div>
  );
}

function Sparkline({ series, direction }: { series: number[]; direction: "up" | "down" | "flat" }) {
  const w = 120;
  const h = 32;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(0.001, max - min);
  const step = w / Math.max(1, series.length - 1);
  const points = series.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
  const stroke = direction === "up" ? "#1a7a5a" : direction === "down" ? "#c44040" : "#c49a5a";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={32}
      style={{ marginTop: 14, display: "block" }}
    >
      <path d={areaPath} fill={stroke} fillOpacity={0.06} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------- Section 5: Footer ----------------

function FooterBlock({ syncStatus, vp }: { syncStatus: CommandCenterData["summary"]["syncStatus"]; vp: { isMobile: boolean } }) {
  const syncText = syncStatus === "synced" ? "just now" : syncStatus === "syncing" ? "syncing now" : "unknown";
  return (
    <footer
      style={{
        marginTop: vp.isMobile ? 40 : 64,
        paddingTop: vp.isMobile ? 20 : 32,
        borderTop: "1px solid var(--hairline)",
        display: "flex",
        alignItems: vp.isMobile ? "flex-start" : "center",
        justifyContent: vp.isMobile ? "flex-start" : "space-between",
        flexDirection: vp.isMobile ? "column" : "row",
        gap: vp.isMobile ? 10 : 0,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--tideline)" }}>
        Last sync {syncText}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 12, color: "var(--tideline)" }}>
        <Link href="/docs" style={{ color: "inherit", textDecoration: "none" }}>Docs</Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <CommandIcon size={12} />?
        </span>
        <Link href="/settings" style={{ color: "inherit", textDecoration: "none" }}>Settings</Link>
      </div>
    </footer>
  );
}

// ---------------- Shared ----------------

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        gap: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--tideline)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>
      {action}
    </div>
  );
}

const headerLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--tideline)",
  textDecoration: "none",
  fontWeight: 500,
};
