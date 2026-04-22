"use client";

/**
 * CalendarSidebar — the two-tab (Pricing / Availability) editor that
 * replaces the inline RailBody on /calendar.
 *
 * Session 5b.3: accepts a `selectedDates: string[]` array instead of
 * a single date. Single selection (length 1) keeps the current UX.
 * Multi-date selection drives the per-card bulk edit flow in the
 * Pricing tab. Availability tab stays single-date for this session
 * (multi-date availability edits land in a follow-up).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import KoastSegmentedControl from "../KoastSegmentedControl";
import PricingTab, { type RateBundle } from "./PricingTab";
import AvailabilityTab from "./AvailabilityTab";

const TAB_OPTIONS = [
  { value: "pricing", label: "Pricing" },
  { value: "availability", label: "Availability" },
];

interface Props {
  propertyId: string;
  date: string;                      // single-click anchor date (used by Availability tab + date header when selectedDates has 1)
  selectedDates: string[];           // Session 5b.3: authoritative selection
  bookedDates: Set<string>;          // dates covered by an existing booking
  isBooked: boolean;                 // shorthand for selectedDates[0]? (legacy Availability tab prop)
  rulesSummary?: { min_rate: number | null; base_rate: number | null; max_rate: number | null; source: string | null } | null;
  onToast?: (text: string, tone: "ok" | "err") => void;
}

function newIdemKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `calrate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CalendarSidebar({ propertyId, date, selectedDates, bookedDates, isBooked, rulesSummary, onToast }: Props) {
  const [tab, setTab] = useState<string>("pricing");
  const [bundleByDate, setBundleByDate] = useState<Map<string, RateBundle>>(new Map());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState({
    isBlocked: false,
    bookingWindowDays: 365,
    notes: "",
  });

  // Serialize selection so effect doesn't re-fire on every parent
  // render when the array identity changes but the contents don't.
  const selectedKey = useMemo(() => selectedDates.slice().sort().join("|"), [selectedDates]);

  const load = useCallback(async () => {
    if (selectedDates.length === 0) {
      setBundleByDate(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // N parallel GETs (one per selected date). /api/calendar/rates is
      // per-date today; bulk-fetch shape TBD in a follow-up. For the
      // common single-date case N=1 and this is identical to the
      // previous single-fetch.
      const results = await Promise.all(
        selectedDates.map(async (d) => {
          const res = await fetch(`/api/calendar/rates?property_id=${propertyId}&date=${d}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
          return [d, body as RateBundle] as const;
        })
      );
      const next = new Map<string, RateBundle>();
      for (const [d, bundle] of results) next.set(d, bundle);
      setBundleByDate(next);
      // Sync Availability tab's blocked state from the anchor date only
      // (multi-date availability edits are out of 5b.3 scope).
      const anchor = next.get(date) ?? results[0]?.[1];
      if (anchor) {
        setAvailability((a) => ({ ...a, isBlocked: anchor.master.is_available === false }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // The serialized selectedKey is the true dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, selectedKey, date]);

  useEffect(() => {
    void load();
  }, [load]);

  // Bulk-capable rate write. Used by both single and multi-date saves;
  // when dates.length === 1 it round-trips via the same per-channel
  // rates route as the pre-5b.3 single-date path.
  const applyPlatformBulk = useCallback(
    async (channelCode: string, rate: number, dates: string[]): Promise<{ ok: boolean; perDate?: Array<{ date: string; status: "ok" | "failed"; error?: string }>; error?: string }> => {
      try {
        const res = await fetch(`/api/channels/rates/${propertyId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dates,
            channel_code: channelCode,
            rate,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
        }
        return { ok: true, perDate: body.per_date };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [propertyId]
  );

  const applyBaseBulk = useCallback(
    async (rate: number, dates: string[], masterPush?: boolean): Promise<{
      ok: boolean;
      error?: string;
      channels?: Record<string, { pushed: number; failed: Array<{ date: string; error: string }> }>;
    }> => {
      try {
        const res = await fetch(`/api/calendar/base-rate/${propertyId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dates, rate, masterPush: masterPush === true }),
        });
        const body = await res.json();
        if (!res.ok) {
          return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
        }
        return { ok: true, channels: body.channels };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [propertyId]
  );

  // Single-date legacy flow for AvailabilityTab (mode master — push
  // through /api/calendar/rates/apply for parity with the prior
  // single-date availability toggle). Retained without multi-date
  // support on purpose: availability edits stay single-date in 5b.3.
  const applySingleDate = useCallback(
    async (payload: { mode: "master" | "platform"; rate: number; channel_code?: string; wipe_overrides?: boolean }) => {
      try {
        const res = await fetch("/api/calendar/rates/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            property_id: propertyId,
            date,
            idempotency_key: newIdemKey(),
            ...payload,
          }),
        });
        const body = await res.json();
        if (!res.ok && res.status !== 207) {
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        if (body?.failed_channels?.length) {
          onToast?.(`${body.failed_channels.length} channel(s) failed`, "err");
        } else {
          onToast?.("Rate updated", "ok");
        }
        await load();
      } catch (e) {
        onToast?.(e instanceof Error ? e.message : "Update failed", "err");
      }
    },
    [propertyId, date, onToast, load]
  );

  const handleStatusChange = useCallback(
    async (status: "available" | "blocked") => {
      const anchor = bundleByDate.get(date);
      await applySingleDate({
        mode: "master",
        rate: anchor?.master?.applied_rate ?? anchor?.master?.base_rate ?? 0,
        wipe_overrides: status === "blocked",
      });
      setAvailability((a) => ({ ...a, isBlocked: status === "blocked" }));
    },
    [applySingleDate, bundleByDate, date]
  );

  const handleBookingWindow = useCallback(async (days: number) => {
    setAvailability((a) => ({ ...a, bookingWindowDays: days }));
    onToast?.("Booking window stored locally — push lands in Session 5d", "ok");
  }, [onToast]);

  const handleNotes = useCallback(async (notes: string) => {
    setAvailability((a) => ({ ...a, notes }));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 16px 0" }}>
        <div
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 22,
            fontWeight: 400,
            color: "var(--coastal)",
            letterSpacing: "-0.02em",
          }}
        >
          {renderHeader(selectedDates, date)}
        </div>
        <div style={{ marginTop: 8, display: "inline-flex" }}>
          <KoastSegmentedControl
            size="sm"
            options={TAB_OPTIONS}
            value={tab}
            onChange={setTab}
            ariaLabel="Sidebar mode"
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 8 }}>
        {error && (
          <div style={{ padding: 16, fontSize: 13, color: "var(--coral-reef)" }}>
            Couldn&apos;t load rates: {error}
          </div>
        )}
        {tab === "pricing" ? (
          <PricingTab
            propertyId={propertyId}
            selectedDates={selectedDates}
            bookedDates={bookedDates}
            bundleByDate={bundleByDate}
            loading={loading}
            onToast={onToast}
            onApplyPlatformBulk={applyPlatformBulk}
            onApplyBaseBulk={applyBaseBulk}
            onRefresh={load}
          />
        ) : (
          <AvailabilityTab
            isBooked={isBooked}
            isBlocked={availability.isBlocked}
            bookingWindowDays={availability.bookingWindowDays}
            notes={availability.notes}
            onChangeStatus={handleStatusChange}
            onChangeBookingWindow={handleBookingWindow}
            onChangeNotes={handleNotes}
          />
        )}
      </div>
      {rulesSummary && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--dry-sand)",
            fontSize: 11,
            color: "var(--tideline)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>
            min ${rulesSummary.min_rate ?? "—"} · base ${rulesSummary.base_rate ?? "—"} · max ${rulesSummary.max_rate ?? "—"}
          </span>
          {rulesSummary.source && (
            <span style={{ color: "var(--tideline)" }}>source: {rulesSummary.source}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Header renderer: single / contiguous-range / non-contiguous.
function renderHeader(selectedDates: string[], anchor: string): string {
  if (selectedDates.length === 0) return "No date selected";
  if (selectedDates.length === 1) {
    return new Date(selectedDates[0] + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  const sorted = selectedDates.slice().sort();
  const start = new Date(sorted[0] + "T00:00:00");
  const end = new Date(sorted[sorted.length - 1] + "T00:00:00");
  const expected = (end.getTime() - start.getTime()) / 86_400_000;
  const contiguous = expected === sorted.length - 1;
  if (!contiguous) {
    void anchor;
    return `${sorted.length} dates selected`;
  }
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)} · ${sorted.length} dates`;
}
