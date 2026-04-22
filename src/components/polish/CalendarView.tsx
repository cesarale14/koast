"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowLeftRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import { usePricingTab, type PricingRecommendation } from "@/hooks/usePricingTab";
import { PLATFORMS, platformKeyFrom, type PlatformKey } from "@/lib/platforms";
import KoastButton from "./KoastButton";
import KoastChip from "./KoastChip";
import KoastRate from "./KoastRate";
import KoastBookingBar from "./KoastBookingBar";
import KoastRail from "./KoastRail";
import CalendarSidebar from "./calendar/CalendarSidebar";
import KoastSelectedCell from "./KoastSelectedCell";

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
  // Session 5a.4: the grid-effective rate after the per-channel
  // divergence policy in page.tsx. Equals applied_rate (base row)
  // except when all override rows agree on a value different from
  // base — then it carries the override. Falls back to
  // applied_rate / suggested_rate / base_rate in the cell renderer
  // when not provided (back-compat for callers that haven't been
  // migrated yet).
  display_rate?: number | null;
  min_stay: number;
  is_available: boolean;
  rate_source: string;
}

interface Props {
  properties: Property[];
  bookings: Booking[];
  rates: Rate[];
  // Dates (ISO strings) that have at least one per-channel rate
  // override — the grid renders a golden hairline indicator on those
  // cells. Server-prefetched in page.tsx via a parallel query.
  overrideDatesByProperty?: Record<string, string[]>;
  // When embedded inside PropertyDetail we already know the property;
  // hide the top-chrome Switch affordance so there's no redundant UI.
  showSwitcher?: boolean;
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

// Bar segment shape — matches Airbnb's multicalendar mechanic
// (Apr 21 rewrite). One segment per booking per week row.
//
//   borderRadius: 'both'   = fully rounded, free both ends
//                 'left'   = round left cap, flat right (continues right)
//                 'right'  = flat left, round right cap (continues from left)
//                 'none'   = flat both (middle week of a multi-week stay)
//   hasOverhang:  true when this segment's right edge is a same-day
//                 turnover — the pill extends +16px past its cell
//                 boundary to visually bleed into the next pill's start.
//   hasSeam:      true when this segment's left edge is a same-day
//                 turnover — the pill shifts −4px left and paints a
//                 1.33px solid white left border, creating the crisp
//                 seam where it sits on the previous booking's tail.
interface BarSegment {
  booking: Booking;
  weekIdx: number;
  startCol: number;
  span: number;
  borderRadius: "both" | "left" | "right" | "none";
  hasOverhang: boolean;
  hasSeam: boolean;
  /** Segment was clipped at a month boundary on the left side — the
   * bar continues in the PREVIOUS month's block. Renderer applies a
   * soft fade-in on the left edge. */
  fadeLeft: boolean;
  /** Segment was clipped at a month boundary on the right side — the
   * bar continues in the NEXT month's block. Renderer applies a soft
   * fade-out on the right edge. */
  fadeRight: boolean;
}

function computeBarSegments(bookings: Booking[], weeks: WeekGrid[]): BarSegment[] {
  const segs: BarSegment[] = [];
  if (weeks.length === 0) return segs;
  const firstDate = weeks[0].days[0].date;
  const lastDate = weeks[weeks.length - 1].days[6].date;

  // Session 5b.4 — clip bar rendering to the in-month range so
  // bookings that cross month boundaries don't bleed into the grey
  // leading/trailing cells of adjacent months. Bars get a fade flag
  // when their edge was cut at a boundary.
  let monthFirstIdx = -1;
  let monthLastIdx = -1;
  const flatDays = weeks.flatMap((w) => w.days);
  for (let i = 0; i < flatDays.length; i++) {
    if (flatDays[i].inMonth) {
      if (monthFirstIdx === -1) monthFirstIdx = i;
      monthLastIdx = i;
    }
  }

  // Build the set of turnover dates — dates that have both a
  // check-out (from one booking) and a check-in (from a DIFFERENT
  // booking).
  const inDates = new Map<string, string[]>();
  const outDates = new Map<string, string[]>();
  for (const b of bookings) {
    if (b.check_in >= firstDate && b.check_in <= lastDate) {
      if (!inDates.has(b.check_in)) inDates.set(b.check_in, []);
      inDates.get(b.check_in)!.push(b.id);
    }
    if (b.check_out >= firstDate && b.check_out <= lastDate) {
      if (!outDates.has(b.check_out)) outDates.set(b.check_out, []);
      outDates.get(b.check_out)!.push(b.id);
    }
  }
  const turnoverDates = new Set<string>();
  const outDateList = Array.from(outDates.keys());
  for (const date of outDateList) {
    const outs = outDates.get(date) ?? [];
    const ins = inDates.get(date) ?? [];
    if (ins.some((iid) => !outs.includes(iid))) turnoverDates.add(date);
  }

  // DOM-order layering: later check-in paints on top of earlier ones.
  // computeBarSegments emits segments in the booking iteration order,
  // so sort bookings ASC by check_in first.
  const sorted = [...bookings].sort((a, b) => a.check_in.localeCompare(b.check_in));

  for (const b of sorted) {
    if (b.check_out <= firstDate || b.check_in > lastDate) continue;
    const start = b.check_in < firstDate ? firstDate : b.check_in;
    const endExclusive = b.check_out > lastDate
      ? new Date(parseISO(lastDate).getTime() + 86_400_000).toISOString().slice(0, 10)
      : b.check_out;
    const rawStartIdx = daysBetween(firstDate, start);
    const rawEndIdx = daysBetween(firstDate, endExclusive) - 1; // inclusive last night
    if (rawEndIdx < rawStartIdx) continue;

    // Clip to in-month range. Any clipping implies the bar crosses a
    // month boundary; the adjacent-month MonthBlock renders the rest.
    const startIdx = monthFirstIdx >= 0 ? Math.max(rawStartIdx, monthFirstIdx) : rawStartIdx;
    const endIdx = monthLastIdx >= 0 ? Math.min(rawEndIdx, monthLastIdx) : rawEndIdx;
    if (endIdx < startIdx) continue;
    const clippedLeft = startIdx > rawStartIdx;
    const clippedRight = endIdx < rawEndIdx;

    const checkInIsTurnover = turnoverDates.has(b.check_in) && b.check_in === start;
    const checkOutIsTurnover = turnoverDates.has(b.check_out) && b.check_out <= lastDate;

    let cur = startIdx;
    while (cur <= endIdx) {
      const weekIdx = Math.floor(cur / 7);
      const colInWeek = cur % 7;
      const lastInWeek = Math.min(endIdx, (weekIdx + 1) * 7 - 1);
      const span = lastInWeek - cur + 1;
      const startsHere = b.check_in >= firstDate && cur === startIdx && !clippedLeft;
      const endsHere = b.check_out <= lastDate && lastInWeek === endIdx && !clippedRight;

      const borderRadius: BarSegment["borderRadius"] =
        startsHere && endsHere ? "both" : startsHere ? "left" : endsHere ? "right" : "none";

      const isFirstSegment = cur === startIdx;
      const isLastSegment = lastInWeek === endIdx;

      // Overhang only makes visual sense when the check-out cell is
      // in the SAME week as the segment's last night — the 20% tail
      // extends into that cell to overlap with the incoming pill's
      // seam. If the check-out lands in the next week (e.g. last
      // night is a Saturday), the overhang would bleed past the row
      // edge, which is the bug Cesar flagged on Apr 24→26.
      const checkoutInSameWeek = (endIdx + 1) < (weekIdx + 1) * 7;

      segs.push({
        booking: b,
        weekIdx,
        startCol: colInWeek,
        span,
        borderRadius,
        hasOverhang: endsHere && checkOutIsTurnover && checkoutInSameWeek,
        hasSeam: startsHere && checkInIsTurnover,
        fadeLeft: clippedLeft && isFirstSegment,
        fadeRight: clippedRight && isLastSegment,
      });
      cur = lastInWeek + 1;
    }
  }
  return segs;
}

export default function CalendarView({
  properties,
  bookings: allBookings,
  rates: allRates,
  overrideDatesByProperty,
  showSwitcher = true,
}: Props) {
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
  const router = useRouter();

  // Session 5b.3 — multi-date selection.
  // Single-date (click) path keeps `selectedDate` as the anchor. When a
  // user drags across cells, `dragAnchor` + `dragCurrent` define a live
  // range that's visualized mid-drag; on mouseup, if the range has >1
  // date it's committed into `selectedRange`. Single click clears the
  // range. Escape resets to the single anchor.
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragCurrent, setDragCurrent] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string } | null>(null);

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

  const overrideDates = useMemo(() => {
    const arr = overrideDatesByProperty?.[activePropertyId] ?? [];
    return new Set(arr);
  }, [overrideDatesByProperty, activePropertyId]);

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
  void selectedRec;

  // Expand a [start, end] inclusive date range into an array of ISO
  // dates. Handles both directions (start > end swaps).
  const expandRange = useCallback((a: string, b: string): string[] => {
    const startStr = a <= b ? a : b;
    const endStr = a <= b ? b : a;
    const out: string[] = [];
    const cur = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    while (cur <= end) {
      out.push(cur.toISOString().split("T")[0]);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }, []);

  // Canonical selection: what rows the sidebar acts on. During a
  // drag, the live anchor→current range drives the preview; on
  // mouseup it's either committed to selectedRange (>1 date) or
  // collapsed back to a single-date click.
  const selectedDates = useMemo<string[]>(() => {
    if (dragAnchor && dragCurrent) return expandRange(dragAnchor, dragCurrent);
    if (selectedRange) return expandRange(selectedRange.start, selectedRange.end);
    return [selectedDate];
  }, [dragAnchor, dragCurrent, selectedRange, selectedDate, expandRange]);

  const selectedDatesSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const handleCellMouseDown = useCallback((d: string) => {
    setDragAnchor(d);
    setDragCurrent(d);
    // Collapse any committed range while a fresh drag starts.
    setSelectedRange(null);
    setSelectedDate(d);
  }, []);

  const handleCellMouseEnterDrag = useCallback((d: string) => {
    setDragCurrent((prev) => (prev == null ? prev : d));
  }, []);

  // Global mouseup commits the drag into a selectedRange when >1 date.
  useEffect(() => {
    function finish() {
      setDragAnchor((anchor) => {
        if (anchor == null) return anchor;
        let nextCurrent: string | null = null;
        setDragCurrent((cur) => {
          nextCurrent = cur;
          return null;
        });
        const endDate = nextCurrent ?? anchor;
        if (endDate !== anchor) {
          const a = anchor <= endDate ? anchor : endDate;
          const b = anchor <= endDate ? endDate : anchor;
          setSelectedRange({ start: a, end: b });
        }
        return null;
      });
    }
    window.addEventListener("mouseup", finish);
    return () => window.removeEventListener("mouseup", finish);
  }, []);

  // Escape clears the committed range and returns to single-date.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedRange(null);
        setDragAnchor(null);
        setDragCurrent(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Apply / Dismiss from the pricing sidebar was replaced by the
  // CalendarSidebar editor (Session 5a). Recommendation-driven apply
  // still exists on PropertyDetail; the Calendar sidebar writes ad-hoc
  // per-platform rates via /api/calendar/rates/apply.
  void refetch;

  // Session 5b.3 — handlePushAll removed. The global "Push to channels"
  // header button was ambiguous about what it pushed; per-card Save
  // in the sidebar (single or bulk via modal) now covers all push
  // workflows.

  // Channex → Koast pull. Hits the existing /api/channex/sync route with
  // the active property_id in the body; that route upserts both bookings
  // and calendar_rates (base rows, channel_code NULL). On success we
  // router.refresh() so the server-component calendar page re-queries
  // Supabase and the grid re-renders with the newly pulled rates —
  // without a full page reload.
  const handleSyncNow = useCallback(async () => {
    if (!activePropertyId) return;
    setBusy("sync");
    try {
      const res = await fetch(`/api/channex/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: activePropertyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const rateCount = data.rates ?? 0;
      const bookingDelta = (data.bookings_new ?? 0) + (data.bookings_updated ?? 0);
      setToast({ text: `Synced ${rateCount} rates, ${bookingDelta} bookings`, tone: "ok" });
      router.refresh();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Sync failed", tone: "err" });
    } finally {
      setBusy(null);
    }
  }, [activePropertyId, router]);

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
        onSyncNow={handleSyncNow}
        busy={busy}
        isMobile={isMobile}
        onOpenRail={() => setRailOpen(true)}
        showSwitcher={showSwitcher}
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
                overrideDates={overrideDates}
                selectedDate={selectedDate}
                selectedDatesSet={selectedDatesSet}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  setSelectedRange(null);
                  if (isMobile) setRailOpen(true);
                }}
                onCellMouseDown={handleCellMouseDown}
                onCellMouseEnterDrag={handleCellMouseEnterDrag}
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
            <CalendarSidebar
              propertyId={activePropertyId}
              date={selectedDate}
              selectedDates={selectedDates}
              bookedDates={new Set(bookings.flatMap((b) => expandRange(b.check_in, b.check_out).slice(0, -1)))}
              isBooked={Boolean(selectedRec) === false && bookings.some((b) => b.check_in <= selectedDate && b.check_out > selectedDate)}
              rulesSummary={
                rules
                  ? {
                      min_rate: rules.min_rate != null ? Number(rules.min_rate) : null,
                      base_rate: rules.base_rate != null ? Number(rules.base_rate) : null,
                      max_rate: rules.max_rate != null ? Number(rules.max_rate) : null,
                      source: rules.source ?? null,
                    }
                  : null
              }
              onToast={(text, tone) => setToast({ text, tone })}
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
  busy,
  isMobile,
  onOpenRail,
  showSwitcher,
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
  busy: string | null;
  isMobile: boolean;
  onOpenRail: () => void;
  showSwitcher: boolean;
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
            onClick={showSwitcher ? onMenuToggle : undefined}
            aria-label={showSwitcher ? "Switch property" : propertyName}
            disabled={!showSwitcher}
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
              cursor: showSwitcher ? "pointer" : "default",
              width: "100%",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{propertyName}</span>
            {showSwitcher && <ArrowLeftRight size={14} color="var(--tideline)" style={{ flexShrink: 0 }} />}
          </button>
          {menuOpen && showSwitcher && (
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

        {!isMobile && showSwitcher && <div style={{ width: 1, height: 24, background: "#E5E2DC" }} />}

        {!isMobile && showSwitcher && (
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
            <button onClick={onOpenRail} aria-label="Open details" style={iconBtnStyle}>
              <CalendarIcon size={16} />
            </button>
          </>
        ) : (
          <KoastButton size="sm" variant="ghost" iconLeft={<RefreshCw size={14} />} onClick={onSyncNow} loading={busy === "sync"}>
            Sync
          </KoastButton>
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
  overrideDates,
  selectedDate,
  selectedDatesSet,
  onSelectDate,
  onCellMouseDown,
  onCellMouseEnterDrag,
  index,
  isMobile,
}: {
  year: number;
  month: number;
  weeks: WeekGrid[];
  bookings: Booking[];
  rateByDate: Map<string, Rate>;
  recByDate: Map<string, PricingRecommendation>;
  overrideDates: Set<string>;
  selectedDate: string;
  selectedDatesSet: Set<string>;
  onSelectDate: (d: string) => void;
  onCellMouseDown: (d: string) => void;
  onCellMouseEnterDrag: (d: string) => void;
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
              overrideDates={overrideDates}
              rateByDate={rateByDate}
              recByDate={recByDate}
              selectedDate={selectedDate}
              selectedDatesSet={selectedDatesSet}
              onSelectDate={onSelectDate}
              onCellMouseDown={onCellMouseDown}
              onCellMouseEnterDrag={onCellMouseEnterDrag}
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
  overrideDates,
  selectedDate,
  selectedDatesSet,
  onSelectDate,
  onCellMouseDown,
  onCellMouseEnterDrag,
  isMobile,
}: {
  week: WeekGrid;
  rowSegments: BarSegment[];
  rateByDate: Map<string, Rate>;
  recByDate: Map<string, PricingRecommendation>;
  overrideDates: Set<string>;
  selectedDate: string;
  selectedDatesSet: Set<string>;
  onSelectDate: (d: string) => void;
  onCellMouseDown: (d: string) => void;
  onCellMouseEnterDrag: (d: string) => void;
  isMobile: boolean;
}) {
  // `selectedDate` is the single-click anchor; kept in the signature
  // for back-compat with any future caller that reads it, but the
  // cell's "selected" visual now derives from selectedDatesSet so
  // multi-date drag selections render correctly.
  void selectedDate;
  const cellMinHeight = isMobile ? CELL_MIN_HEIGHT_MOBILE : CELL_MIN_HEIGHT_DESKTOP;
  const cellMinWidth = isMobile ? CELL_MIN_WIDTH_MOBILE : CELL_MIN_WIDTH_DESKTOP;
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
        {week.days.map((d, colIdx) => {
          // Session 5b.4 — out-of-month cells are fully skipped: no
          // empty div, no layout space. In-month cells position
          // themselves in the correct day-of-week column via
          // gridColumnStart so the grid's 7-col geometry still aligns
          // with the bar-overlay positioning math (left/width as %
          // of 7 equal columns).
          if (!d.inMonth) return null;
          const rate = rateByDate.get(d.date);
          const rec = recByDate.get(d.date);
          const selected = selectedDatesSet.has(d.date);
          return (
            <KoastSelectedCell
              key={d.date}
              selected={selected}
              onClick={() => onSelectDate(d.date)}
              onMouseDown={() => onCellMouseDown(d.date)}
              onMouseEnterDrag={() => onCellMouseEnterDrag(d.date)}
              ariaLabel={`Select ${d.date}`}
              style={{
                gridColumnStart: colIdx + 1,
                minHeight: cellMinHeight,
                padding: isMobile ? "4px 4px" : "10px 12px",
                // Two states of emphasis (past-day mute + today+future
                // at full). Out-of-month cells are skipped above and
                // never reach this branch.
                opacity: d.isPast ? 0.5 : 1,
              }}
            >
              <DayCellContents
                day={d}
                rate={rate}
                rec={rec}
                isMobile={isMobile}
                booked={bookedDates.has(d.date)}
                hasOverride={overrideDates.has(d.date)}
              />
            </KoastSelectedCell>
          );
        })}
      </div>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {rowSegments.map((s) => {
          const platform = platformKeyFrom(s.booking.platform);
          if (!platform) return null;
          const cellPct = 100 / 7;
          const leftPct = s.startCol * cellPct;
          const widthPct = s.span * cellPct;
          // Apr 21 turnover tuning: only the TIPS overlap.
          // Check-out pill's tail extends ~20% of one cell width
          // into the turnover cell. Check-in pill starts at its
          // cell's left edge (no offset) and sits on top via DOM
          // order — its 1.33px white seam border marks the
          // boundary; only the check-out's tail tip remains
          // visible beyond the overlap.
          const tipPct = cellPct / 5; // 20% of a single cell in row-%
          const rightShiftPct = s.hasOverhang ? tipPct : 0;
          // Month-boundary cut effect. Instead of a gradient fade the
          // clipped edge gets a small corner-curve via overflow-clip
          // on the wrapper — keeps the pill mostly square but softens
          // the cut so it doesn't look razor-sliced.
          let cutRadius: string | undefined;
          if (s.fadeLeft && s.fadeRight) cutRadius = "6px";
          else if (s.fadeLeft) cutRadius = "6px 0 0 6px";
          else if (s.fadeRight) cutRadius = "0 6px 6px 0";
          const overflow = cutRadius ? "hidden" : "visible";
          // Every pill gets a small right-side gap so it doesn't butt
          // against the neighboring cell's left edge. For same-week
          // turnover overhangs the pill EXTENDS past this gap into
          // the next cell, creating the intended slight overlap with
          // the incoming pill's seam. Value is applied in px so it
          // reads consistently regardless of cell width.
          const PILL_RIGHT_GAP_PX = 4;
          return (
            <div
              key={`bar-${s.booking.id}-${s.weekIdx}-${s.startCol}`}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                width: `calc(${widthPct + rightShiftPct}% - ${PILL_RIGHT_GAP_PX}px)`,
                bottom: 6,
                height: barHeight,
                pointerEvents: "auto",
                overflow,
                borderRadius: cutRadius,
              }}
            >
              <KoastBookingBar
                platform={platform}
                guest={s.booking.guest_name}
                checkIn={s.booking.check_in}
                checkOut={s.booking.check_out}
                borderRadius={s.borderRadius}
                hasSeam={s.hasSeam}
                compact={isMobile}
                style={{ height: barHeight, fontSize: isMobile ? 11 : 13 }}
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
  hasOverride,
}: {
  day: { date: string; dayNum: number; inMonth: boolean; isToday: boolean; isPast: boolean };
  rate: Rate | undefined;
  rec: PricingRecommendation | undefined;
  isMobile: boolean;
  booked: boolean;
  hasOverride: boolean;
}) {
  const showRate = rate && rate.is_available !== false;
  // Grid shows display_rate (computed server-side with the 5a.4
  // divergence policy) when provided; otherwise falls through to
  // the original chain for back-compat.
  const rateValue = rate?.display_rate ?? rate?.applied_rate ?? rate?.suggested_rate ?? rate?.base_rate ?? null;
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          {closed ? (
            <KoastRate variant="struck" value={rateValue} />
          ) : showRate ? (
            <KoastRate variant="quiet" value={rateValue} />
          ) : null}
          {hasOverride && showRate && (
            <span
              aria-hidden
              title="Per-channel rate overrides exist for this date"
              style={{
                width: 8,
                height: 1.5,
                background: "var(--golden)",
                borderRadius: 1,
                display: "block",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

