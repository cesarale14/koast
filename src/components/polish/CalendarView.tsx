"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Upload,
  ArrowLeftRight,
  Calendar as CalendarIcon,
  Sparkles,
} from "lucide-react";
import { usePricingTab, type PricingRecommendation } from "@/hooks/usePricingTab";
import { PLATFORMS, platformKeyFrom, type PlatformKey } from "@/lib/platforms";
import KoastButton from "./KoastButton";
import KoastCard from "./KoastCard";
import KoastChip from "./KoastChip";
import KoastRate from "./KoastRate";
import KoastBookingBar from "./KoastBookingBar";
import KoastRail from "./KoastRail";
import KoastSelectedCell from "./KoastSelectedCell";
import KoastSignalBar from "./KoastSignalBar";
import KoastEmptyState from "./KoastEmptyState";

interface Property {
  id: string;
  name: string;
  cover_photo_url: string | null;
}
interface Booking {
  id: string;
  property_id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  total_price: number | null;
  num_guests: number | null;
  status: string;
}
interface Rate {
  property_id: string;
  date: string;
  base_rate: number | null;
  suggested_rate: number | null;
  applied_rate: number | null;
  min_stay: number;
  is_available: boolean;
  rate_source: string;
}

interface Props {
  properties: Property[];
  bookings: Booking[];
  rates: Rate[];
}

const MONTHS_VISIBLE = 4;
const CELL_MIN_HEIGHT_DESKTOP = 132;
const CELL_MIN_HEIGHT_MOBILE = 64;
const CELL_MIN_WIDTH_DESKTOP = 168;
const CELL_MIN_WIDTH_MOBILE = 44;
const MOBILE_BREAKPOINT = 768;
const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s: string): Date {
  return new Date(s + "T00:00:00");
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

interface WeekGrid {
  start: Date;
  days: Array<{ date: string; dayNum: number; inMonth: boolean; isToday: boolean; isPast: boolean }>;
}

function buildMonthWeeks(year: number, month: number, todayStr: string): WeekGrid[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = first.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const weeks: WeekGrid[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= lastDay || cursor.getDay() !== 0) {
    const week: WeekGrid = { start: new Date(cursor), days: [] };
    for (let i = 0; i < 7; i++) {
      const ds = toISO(cursor);
      week.days.push({
        date: ds,
        dayNum: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        isToday: ds === todayStr,
        isPast: ds < todayStr,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor > lastDay && cursor.getDay() === 0) break;
  }
  return weeks;
}

interface BarSegment {
  booking: Booking;
  weekIdx: number;
  startCol: number;
  span: number;
  position: "standalone" | "start" | "middle" | "end";
}

function computeBarSegments(bookings: Booking[], weeks: WeekGrid[]): BarSegment[] {
  const segs: BarSegment[] = [];
  if (weeks.length === 0) return segs;
  const firstDate = weeks[0].days[0].date;
  const lastDate = weeks[weeks.length - 1].days[6].date;
  for (const b of bookings) {
    if (b.check_out <= firstDate || b.check_in > lastDate) continue;
    const start = b.check_in < firstDate ? firstDate : b.check_in;
    const endExclusive = b.check_out > lastDate ? new Date(parseISO(lastDate).getTime() + 86_400_000).toISOString().slice(0, 10) : b.check_out;
    const startIdx = daysBetween(firstDate, start);
    const endIdx = daysBetween(firstDate, endExclusive) - 1; // inclusive last night
    if (endIdx < startIdx) continue;
    let cur = startIdx;
    while (cur <= endIdx) {
      const weekIdx = Math.floor(cur / 7);
      const colInWeek = cur % 7;
      const lastInWeek = Math.min(endIdx, (weekIdx + 1) * 7 - 1);
      const span = lastInWeek - cur + 1;
      const startsHere = b.check_in >= firstDate && cur === startIdx;
      const endsHere = b.check_out <= lastDate && lastInWeek === endIdx;
      const position: BarSegment["position"] =
        startsHere && endsHere ? "standalone" : startsHere ? "start" : endsHere ? "end" : "middle";
      segs.push({ booking: b, weekIdx, startCol: colInWeek, span, position });
      cur = lastInWeek + 1;
    }
  }
  return segs;
}

export default function CalendarView({ properties, bookings: allBookings, rates: allRates }: Props) {
  const todayStr = toISO(new Date());
  const [activePropertyId, setActivePropertyId] = useState(properties[0]?.id ?? "");
  const [propertyMenuOpen, setPropertyMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [isMobile, setIsMobile] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  useEffect(() => {
    setMounted(true);
    const apply = () => {
      const mob = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mob);
      setRailOpen(!mob);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const activeProperty = useMemo(
    () => properties.find((p) => p.id === activePropertyId) ?? properties[0],
    [properties, activePropertyId]
  );

  const { rules, recommendations, performance, refetch } = usePricingTab(activePropertyId, { performanceWindow: 30 });

  const bookings = useMemo(
    () => allBookings.filter((b) => b.property_id === activePropertyId),
    [allBookings, activePropertyId]
  );
  const rateByDate = useMemo(() => {
    const m = new Map<string, Rate>();
    for (const r of allRates) if (r.property_id === activePropertyId) m.set(r.date, r);
    return m;
  }, [allRates, activePropertyId]);

  const connectedPlatforms = useMemo(() => {
    const set = new Set<PlatformKey>();
    for (const b of bookings) {
      const k = platformKeyFrom(b.platform);
      if (k) set.add(k);
    }
    return Array.from(set);
  }, [bookings]);

  const months = useMemo(() => {
    const arr: { year: number; month: number; weeks: WeekGrid[] }[] = [];
    for (let i = 0; i < MONTHS_VISIBLE; i++) {
      const m = (startMonth.month + i) % 12;
      const y = startMonth.year + Math.floor((startMonth.month + i) / 12);
      arr.push({ year: y, month: m, weeks: buildMonthWeeks(y, m, todayStr) });
    }
    return arr;
  }, [startMonth, todayStr]);

  const recByDate = useMemo(() => {
    const m = new Map<string, PricingRecommendation>();
    for (const r of recommendations.pending) m.set(r.date, r);
    return m;
  }, [recommendations.pending]);

  const selectedRec = recByDate.get(selectedDate) ?? null;
  const selectedRate = rateByDate.get(selectedDate) ?? null;

  const goPrev = useCallback(() => {
    setStartMonth((s) => ({
      year: s.month === 0 ? s.year - 1 : s.year,
      month: s.month === 0 ? 11 : s.month - 1,
    }));
  }, []);
  const goNext = useCallback(() => {
    setStartMonth((s) => ({
      year: s.month === 11 ? s.year + 1 : s.year,
      month: s.month === 11 ? 0 : s.month + 1,
    }));
  }, []);
  const goToday = useCallback(() => {
    const d = new Date();
    setStartMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(toISO(d));
  }, []);

  const handleApply = useCallback(async () => {
    if (!selectedRec) return;
    setBusy("apply");
    try {
      const res = await fetch(`/api/pricing/apply/${activePropertyId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recommendation_ids: [selectedRec.id],
          idempotency_key: `apply-${selectedRec.id}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setToast({ text: `Applied: ${data.applied_count ?? 1} date(s)`, tone: "ok" });
      await refetch();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Apply failed", tone: "err" });
    } finally {
      setBusy(null);
    }
  }, [activePropertyId, selectedRec, refetch]);

  const handleDismiss = useCallback(async () => {
    if (!selectedRec) return;
    setBusy("dismiss");
    try {
      const res = await fetch(`/api/pricing/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recommendation_id: selectedRec.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setToast({ text: "Dismissed", tone: "ok" });
      await refetch();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Dismiss failed", tone: "err" });
    } finally {
      setBusy(null);
    }
  }, [selectedRec, refetch]);

  const handlePushAll = useCallback(async () => {
    if (!activePropertyId) return;
    setBusy("push");
    try {
      const res = await fetch(`/api/pricing/push/${activePropertyId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setToast({ text: "Rates pushed to channels", tone: "ok" });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Push failed", tone: "err" });
    } finally {
      setBusy(null);
    }
  }, [activePropertyId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <TopChrome
        propertyName={activeProperty?.name ?? "Select a property"}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        label={`${MONTH_NAMES[startMonth.month]} ${startMonth.year}`}
        properties={properties}
        activeId={activePropertyId}
        menuOpen={propertyMenuOpen}
        onMenuToggle={() => setPropertyMenuOpen((o) => !o)}
        onPropertyPick={(id) => {
          setActivePropertyId(id);
          setPropertyMenuOpen(false);
        }}
        onSyncNow={async () => {
          setBusy("sync");
          try {
            await fetch(`/api/channex/sync/property/${activePropertyId}`, { method: "POST" });
            setToast({ text: "Sync requested", tone: "ok" });
          } finally {
            setBusy(null);
          }
        }}
        onPushAll={handlePushAll}
        busy={busy}
        isMobile={isMobile}
        onOpenRail={() => setRailOpen(true)}
      />

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
          }}
        >
          <div
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 240ms ease-out, transform 240ms ease-out",
            }}
          >
            <PropertyHero
              property={activeProperty}
              connectedPlatforms={connectedPlatforms}
              performance={performance}
              mounted={mounted}
              isMobile={isMobile}
            />
          </div>
          <div
            style={{
              padding: isMobile ? "0 12px 48px" : "0 24px 48px",
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 240ms ease-out, transform 240ms ease-out",
              transitionDelay: "120ms",
            }}
          >
            {months.map((m, i) => (
              <MonthBlock
                key={`${m.year}-${m.month}`}
                year={m.year}
                month={m.month}
                weeks={m.weeks}
                bookings={bookings}
                rateByDate={rateByDate}
                recByDate={recByDate}
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  if (isMobile) setRailOpen(true);
                }}
                index={i}
                isMobile={isMobile}
              />
            ))}
          </div>
        </main>

        {isMobile && railOpen && (
          <button
            type="button"
            aria-label="Close rail"
            onClick={() => setRailOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(19,46,32,0.3)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              zIndex: 39,
            }}
          />
        )}

        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateX(0)" : "translateX(16px)",
            transition: "opacity 240ms ease-out, transform 240ms ease-out",
            transitionDelay: "240ms",
            ...(isMobile
              ? {
                  position: "fixed",
                  right: 0,
                  top: 56,
                  bottom: 0,
                  zIndex: 40,
                  boxShadow: railOpen ? "-12px 0 32px rgba(19,46,32,0.18)" : "none",
                }
              : {}),
          }}
        >
          <KoastRail
            open={railOpen}
            onToggle={() => setRailOpen((o) => !o)}
            width={isMobile ? Math.min(360, typeof window !== "undefined" ? window.innerWidth - 48 : 360) : 360}
            header={
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tideline)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Selected
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)", letterSpacing: "-0.005em" }}>
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            }
          >
            <RailBody
              selectedDate={selectedDate}
              rate={selectedRate}
              rec={selectedRec}
              rules={rules}
              onApply={handleApply}
              onDismiss={handleDismiss}
              busy={busy}
              lastSyncedText={performance ? "live" : "—"}
            />
          </KoastRail>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.tone === "err" ? "var(--coral-reef)" : "var(--coastal)",
            color: "var(--shore)",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(19,46,32,0.25)",
            zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------------- Top chrome ----------------

function TopChrome({
  propertyName,
  onPrev,
  onNext,
  onToday,
  label,
  properties,
  activeId,
  menuOpen,
  onMenuToggle,
  onPropertyPick,
  onSyncNow,
  onPushAll,
  busy,
  isMobile,
  onOpenRail,
}: {
  propertyName: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  label: string;
  properties: Property[];
  activeId: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onPropertyPick: (id: string) => void;
  onSyncNow: () => void;
  onPushAll: () => void;
  busy: string | null;
  isMobile: boolean;
  onOpenRail: () => void;
}) {
  return (
    <div
      style={{
        height: 56,
        flexShrink: 0,
        borderBottom: "1px solid #E5E2DC",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "0 12px" : "0 24px",
        background: "#fff",
        position: "relative",
        gap: 8,
      }}
    >
      {!isMobile && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--tideline)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            letterSpacing: "-0.005em",
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--coastal)", fontWeight: 600 }}>Koast</span>
          <span style={{ color: "#C8C4BC" }}>›</span>
          <span>Properties</span>
          <span style={{ color: "#C8C4BC" }}>›</span>
          <span style={{ color: "var(--coastal)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{propertyName}</span>
          <span style={{ color: "#C8C4BC" }}>›</span>
          <span>Calendar</span>
        </div>
      )}

      {isMobile && (
        <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
          <button
            type="button"
            onClick={onMenuToggle}
            aria-label="Switch property"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "transparent",
              border: "none",
              padding: "0 4px",
              color: "var(--coastal)",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              cursor: "pointer",
              width: "100%",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{propertyName}</span>
            <ArrowLeftRight size={14} color="var(--tideline)" style={{ flexShrink: 0 }} />
          </button>
          {menuOpen && (
            <PropertyMenu properties={properties} activeId={activeId} onPick={onPropertyPick} />
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 2 : 6 }}>
          <button onClick={onPrev} aria-label="Previous month" style={iconBtnStyle}>
            <ChevronLeft size={16} />
          </button>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--coastal)",
              minWidth: isMobile ? 68 : 120,
              textAlign: "center",
              letterSpacing: "-0.005em",
            }}
          >
            {isMobile ? label.split(" ")[0] : label}
          </div>
          <button onClick={onNext} aria-label="Next month" style={iconBtnStyle}>
            <ChevronRight size={16} />
          </button>
          {!isMobile && (
            <button
              onClick={onToday}
              style={{ ...iconBtnStyle, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600, color: "var(--coastal)" }}
            >
              Today
            </button>
          )}
        </div>

        {!isMobile && <div style={{ width: 1, height: 24, background: "#E5E2DC" }} />}

        {!isMobile && (
          <div style={{ position: "relative" }}>
            <KoastButton size="sm" variant="secondary" iconLeft={<ArrowLeftRight size={14} />} onClick={onMenuToggle}>
              Switch
            </KoastButton>
            {menuOpen && (
              <PropertyMenu properties={properties} activeId={activeId} onPick={onPropertyPick} />
            )}
          </div>
        )}

        {isMobile ? (
          <>
            <button onClick={onSyncNow} aria-label="Sync now" style={iconBtnStyle} disabled={busy === "sync"}>
              <RefreshCw size={16} />
            </button>
            <button onClick={onPushAll} aria-label="Push to channels" style={{ ...iconBtnStyle, color: "var(--coastal)" }} disabled={busy === "push"}>
              <Upload size={16} />
            </button>
            <button onClick={onOpenRail} aria-label="Open details" style={iconBtnStyle}>
              <CalendarIcon size={16} />
            </button>
          </>
        ) : (
          <>
            <KoastButton size="sm" variant="ghost" iconLeft={<RefreshCw size={14} />} onClick={onSyncNow} loading={busy === "sync"}>
              Sync
            </KoastButton>
            <KoastButton size="sm" variant="primary" iconLeft={<Upload size={14} />} onClick={onPushAll} loading={busy === "push"}>
              Push to channels
            </KoastButton>
          </>
        )}
      </div>
    </div>
  );
}

function PropertyMenu({
  properties,
  activeId,
  onPick,
}: {
  properties: Property[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        left: 0,
        right: 0,
        background: "#fff",
        border: "1px solid #E5E2DC",
        borderRadius: 12,
        padding: 6,
        minWidth: 240,
        maxWidth: 320,
        zIndex: 20,
        boxShadow: "0 8px 24px rgba(19,46,32,0.12)",
      }}
    >
      {properties.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p.id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: p.id === activeId ? "#FAFAF7" : "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: p.id === activeId ? 600 : 500,
            color: "var(--coastal)",
            textAlign: "left",
            letterSpacing: "-0.005em",
          }}
        >
          {p.cover_photo_url && (
            <div style={{ width: 28, height: 28, borderRadius: 6, overflow: "hidden", position: "relative", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.cover_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
        </button>
      ))}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--tideline)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background-color 180ms cubic-bezier(0.4,0,0.2,1), color 180ms cubic-bezier(0.4,0,0.2,1)",
};

// ---------------- Property hero ----------------

function PropertyHero({
  property,
  connectedPlatforms,
  performance,
  mounted,
  isMobile,
}: {
  property: Property | undefined;
  connectedPlatforms: PlatformKey[];
  performance: { applied_count: number; booked_count: number; dismissed_count: number; acceptance_rate: number | null } | null;
  mounted: boolean;
  isMobile: boolean;
}) {
  if (!property) return null;
  const accept = performance?.acceptance_rate;
  const lastSynced = mounted ? "just now" : "—";
  const thumb = isMobile ? 64 : 132;
  const title = isMobile ? 24 : 48;
  return (
    <div
      style={{
        display: "flex",
        gap: isMobile ? 12 : 20,
        padding: isMobile ? "16px 12px" : "24px",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: thumb,
          height: thumb,
          borderRadius: isMobile ? 12 : 16,
          overflow: "hidden",
          flexShrink: 0,
          background: "#F0ECE3",
        }}
      >
        {property.cover_photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={property.cover_photo_url} alt={property.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: isMobile ? 6 : 10 }}>
        <div
          style={{
            fontSize: title,
            fontWeight: 700,
            color: "var(--coastal)",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {property.name}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--tideline)",
            letterSpacing: "-0.005em",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Synced {lastSynced}</span>
          <span style={{ color: "#C8C4BC" }}>·</span>
          <span>{accept != null ? `${Math.round(accept * 100)}% acceptance` : "Accepting data"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {connectedPlatforms.length === 0 ? (
            <KoastChip variant="neutral">No channels yet</KoastChip>
          ) : (
            connectedPlatforms.map((k) => {
              const p = PLATFORMS[k];
              return (
                <KoastChip
                  key={k}
                  variant="success"
                  iconLeft={<Image src={p.icon} alt="" width={12} height={12} />}
                >
                  {p.name}
                </KoastChip>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Month block ----------------

function MonthBlock({
  year,
  month,
  weeks,
  bookings,
  rateByDate,
  recByDate,
  selectedDate,
  onSelectDate,
  index,
  isMobile,
}: {
  year: number;
  month: number;
  weeks: WeekGrid[];
  bookings: Booking[];
  rateByDate: Map<string, Rate>;
  recByDate: Map<string, PricingRecommendation>;
  selectedDate: string;
  onSelectDate: (d: string) => void;
  index: number;
  isMobile: boolean;
}) {
  const segments = useMemo(() => computeBarSegments(bookings, weeks), [bookings, weeks]);

  const stats = useMemo(() => {
    const monthDates = weeks.flatMap((w) => w.days).filter((d) => d.inMonth);
    let booked = 0;
    let revenue = 0;
    let actNow = 0;
    for (const d of monthDates) {
      if (bookings.some((b) => d.date >= b.check_in && d.date < b.check_out)) booked++;
      const r = rateByDate.get(d.date);
      if (r?.applied_rate) revenue += r.applied_rate;
      const rec = recByDate.get(d.date);
      if (rec?.urgency === "act_now") actNow++;
    }
    const occ = monthDates.length > 0 ? Math.round((booked / monthDates.length) * 100) : 0;
    return { occ, revenue: Math.round(revenue), actNow };
  }, [weeks, bookings, rateByDate, recByDate]);

  return (
    <section style={{ marginTop: index === 0 ? 0 : isMobile ? 20 : 32 }}>
      <header
        style={{
          display: "flex",
          alignItems: isMobile ? "center" : "flex-end",
          justifyContent: "space-between",
          marginBottom: isMobile ? 8 : 12,
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--tideline)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {year}
          </div>
          <h2
            style={{
              fontSize: isMobile ? 22 : 32,
              fontWeight: 600,
              color: "var(--coastal)",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {MONTH_NAMES[month]}
          </h2>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 10 : 20, alignItems: "baseline" }}>
          {!isMobile && <StatInline label="Occupancy" value={`${stats.occ}%`} />}
          {!isMobile && <StatInline label="Revenue" value={`$${stats.revenue.toLocaleString()}`} />}
          <StatInline
            label={isMobile ? "Act now" : "Act now"}
            value={isMobile ? `${stats.actNow} · ${stats.occ}%` : String(stats.actNow)}
            emphasis={stats.actNow > 0}
          />
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(7, minmax(${isMobile ? CELL_MIN_WIDTH_MOBILE : CELL_MIN_WIDTH_DESKTOP}px, 1fr))`,
          borderBottom: "1px solid #E5E2DC",
          paddingBottom: isMobile ? 4 : 8,
          marginBottom: isMobile ? 4 : 8,
          textAlign: "center",
        }}
      >
        {(isMobile ? DAY_LABELS_SHORT : DAY_LABELS).map((d, i) => (
          <div
            key={`${d}-${i}`}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--tideline)",
              letterSpacing: isMobile ? "0" : "0.1em",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {weeks.map((week, wIdx) => {
          const rowSegs = segments.filter((s) => s.weekIdx === wIdx);
          return (
            <WeekRow
              key={wIdx}
              week={week}
              rowSegments={rowSegs}
              rateByDate={rateByDate}
              recByDate={recByDate}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              isMobile={isMobile}
            />
          );
        })}
      </div>
    </section>
  );
}

function StatInline({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "right" }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--tideline)",
          letterSpacing: "0.1em",
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

function WeekRow({
  week,
  rowSegments,
  rateByDate,
  recByDate,
  selectedDate,
  onSelectDate,
  isMobile,
}: {
  week: WeekGrid;
  rowSegments: BarSegment[];
  rateByDate: Map<string, Rate>;
  recByDate: Map<string, PricingRecommendation>;
  selectedDate: string;
  onSelectDate: (d: string) => void;
  isMobile: boolean;
}) {
  const cellMinHeight = isMobile ? CELL_MIN_HEIGHT_MOBILE : CELL_MIN_HEIGHT_DESKTOP;
  const cellMinWidth = isMobile ? CELL_MIN_WIDTH_MOBILE : CELL_MIN_WIDTH_DESKTOP;
  const barTop = isMobile ? 28 : 44;
  const barHeight = isMobile ? 28 : 42;
  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of rowSegments) {
      for (let i = 0; i < s.span; i++) {
        set.add(week.days[s.startCol + i].date);
      }
    }
    return set;
  }, [rowSegments, week]);
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(7, minmax(${cellMinWidth}px, 1fr))`,
        }}
      >
        {week.days.map((d) => {
          const rate = rateByDate.get(d.date);
          const rec = recByDate.get(d.date);
          const selected = selectedDate === d.date;
          return (
            <KoastSelectedCell
              key={d.date}
              selected={selected}
              onClick={() => onSelectDate(d.date)}
              ariaLabel={`Select ${d.date}`}
              style={{
                minHeight: cellMinHeight,
                padding: isMobile ? "4px 4px" : "10px 12px",
                opacity: d.inMonth ? 1 : 0.35,
              }}
            >
              <DayCellContents
                day={d}
                rate={rate}
                rec={rec}
                isMobile={isMobile}
                booked={bookedDates.has(d.date)}
              />
            </KoastSelectedCell>
          );
        })}
      </div>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {rowSegments.map((s) => {
          const platform = platformKeyFrom(s.booking.platform);
          if (!platform) return null;
          const leftPct = (s.startCol / 7) * 100;
          const widthPct = (s.span / 7) * 100;
          return (
            <div
              key={`bar-${s.booking.id}-${s.weekIdx}-${s.startCol}`}
              style={{
                position: "absolute",
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`,
                top: barTop,
                height: barHeight,
                pointerEvents: "auto",
              }}
            >
              <KoastBookingBar
                platform={platform}
                guest={s.booking.guest_name}
                checkIn={s.booking.check_in}
                checkOut={s.booking.check_out}
                position={s.position}
                style={{ height: barHeight, fontSize: isMobile ? 11 : 13, padding: isMobile ? "0 8px" : undefined }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayCellContents({
  day,
  rate,
  rec,
  isMobile,
  booked,
}: {
  day: { date: string; dayNum: number; inMonth: boolean; isToday: boolean; isPast: boolean };
  rate: Rate | undefined;
  rec: PricingRecommendation | undefined;
  isMobile: boolean;
  booked: boolean;
}) {
  const showRate = rate && rate.is_available !== false;
  const rateValue = rate?.applied_rate ?? rate?.suggested_rate ?? rate?.base_rate ?? null;
  const closed = rate && rate.is_available === false;
  const renderRate = !isMobile && !booked;
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: isMobile ? 12 : 14,
            fontWeight: day.isToday ? 700 : 500,
            color: day.isToday ? "var(--coastal)" : day.inMonth ? "var(--coastal)" : "var(--tideline)",
            letterSpacing: "-0.005em",
          }}
        >
          {day.dayNum}
        </span>
        {rec?.urgency === "act_now" && (
          <span
            title={rec.reason_text ?? "Act now"}
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: "var(--coral-reef)",
              flexShrink: 0,
            }}
          />
        )}
      </div>
      {renderRate && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {closed ? (
            <KoastRate variant="struck" value={rateValue} />
          ) : showRate ? (
            <KoastRate variant="quiet" value={rateValue} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------------- Rail ----------------

function RailBody({
  selectedDate,
  rate,
  rec,
  rules,
  onApply,
  onDismiss,
  busy,
  lastSyncedText,
}: {
  selectedDate: string;
  rate: Rate | null;
  rec: PricingRecommendation | null;
  rules: ReturnType<typeof usePricingTab>["rules"];
  onApply: () => void;
  onDismiss: () => void;
  busy: string | null;
  lastSyncedText: string;
}) {
  const dateObj = new Date(selectedDate + "T00:00:00");
  const currentRate = rate?.applied_rate ?? rate?.base_rate ?? null;
  const suggestedRate = rec?.suggested_rate ?? rate?.suggested_rate ?? null;
  const delta =
    currentRate != null && suggestedRate != null ? suggestedRate - currentRate : null;

  const urgencyChip = rec?.urgency
    ? rec.urgency === "act_now"
      ? <KoastChip variant="danger">Act now</KoastChip>
      : rec.urgency === "coming_up"
      ? <KoastChip variant="warning">Coming up</KoastChip>
      : <KoastChip variant="neutral">Review</KoastChip>
    : null;

  const signalRows = useMemo(() => {
    if (!rec?.reason_signals) return [];
    const raw = rec.reason_signals as Record<string, unknown>;
    const entries = Object.entries(raw).filter(([k]) => k !== "clamps");
    const parsed = entries.map(([id, val]) => {
      const v = val as { score?: number; weight?: number; confidence?: number; reason?: string };
      return {
        id,
        score: typeof v.score === "number" ? v.score : 0,
        weight: typeof v.weight === "number" ? v.weight : 0,
        confidence: typeof v.confidence === "number" ? v.confidence : 1,
      };
    });
    const total = parsed.reduce((s, p) => s + p.weight * p.confidence, 0);
    return parsed
      .map((p) => ({
        ...p,
        effective: total > 0 ? (p.weight * p.confidence) / total : 0,
      }))
      .sort((a, b) => b.effective - a.effective)
      .slice(0, 5);
  }, [rec]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: "var(--coastal)",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {dateObj.toLocaleDateString("en-US", { weekday: "long" })}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--tideline)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {lastSyncedText}
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--tideline)", letterSpacing: "-0.005em" }}>
        {dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>

      <KoastCard variant="quiet">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tideline)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Current rate
          </div>
        </div>
        <KoastRate variant="selected" value={currentRate} />
      </KoastCard>

      {rec ? (
        <KoastCard variant="dark">
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 180,
              height: 180,
              background: "radial-gradient(circle, rgba(196,154,90,0.28), rgba(196,154,90,0) 70%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={14} color="var(--golden)" />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--golden)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Koast suggests
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <KoastRate variant="hero" value={suggestedRate} style={{ color: "var(--shore)" }} />
              {delta != null && delta !== 0 && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: delta > 0 ? "var(--golden)" : "var(--shore)",
                    opacity: delta > 0 ? 1 : 0.75,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}
                </span>
              )}
              {urgencyChip}
            </div>
            {rec.reason_text && (
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(247,243,236,0.82)", margin: 0 }}>
                {rec.reason_text}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <KoastButton size="md" variant="primary" onClick={onApply} loading={busy === "apply"}>
                Apply
              </KoastButton>
              <KoastButton size="md" variant="ghost" onClick={onDismiss} loading={busy === "dismiss"} style={{ color: "var(--shore)" }}>
                Dismiss
              </KoastButton>
            </div>
          </div>
        </KoastCard>
      ) : (
        <KoastEmptyState
          icon={<CalendarIcon size={36} strokeWidth={1.3} />}
          title="No recommendation for this date"
          body="The engine hasn't surfaced a change for this night. Your current rate is the right call."
        />
      )}

      {signalRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--tideline)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Top signals
          </div>
          {signalRows.map((s) => (
            <KoastSignalBar
              key={s.id}
              label={s.id}
              score={s.score}
              weight={s.effective}
              confidence={s.confidence}
            />
          ))}
        </div>
      )}

      {rules && (
        <KoastCard variant="quiet">
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--tideline)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Rules · {rules.source}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--coastal)", fontVariantNumeric: "tabular-nums" }}>
            <span>min ${rules.min_rate}</span>
            <span style={{ color: "var(--tideline)" }}>·</span>
            <span>base ${rules.base_rate}</span>
            <span style={{ color: "var(--tideline)" }}>·</span>
            <span>max ${rules.max_rate}</span>
          </div>
        </KoastCard>
      )}
    </div>
  );
}
