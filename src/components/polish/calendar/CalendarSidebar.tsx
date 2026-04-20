"use client";

/**
 * CalendarSidebar — the two-tab (Pricing / Availability) editor that
 * replaces the inline RailBody on /calendar. Fetches
 * /api/calendar/rates on mount + date change; writes via
 * /api/calendar/rates/apply.
 */

import { useCallback, useEffect, useState } from "react";
import KoastSegmentedControl from "../KoastSegmentedControl";
import PricingTab, { type RateBundle } from "./PricingTab";
import AvailabilityTab from "./AvailabilityTab";

const TAB_OPTIONS = [
  { value: "pricing", label: "Pricing" },
  { value: "availability", label: "Availability" },
];

interface Props {
  propertyId: string;
  date: string;
  isBooked: boolean;
  rulesSummary?: { min_rate: number | null; base_rate: number | null; max_rate: number | null; source: string | null } | null;
  onToast?: (text: string, tone: "ok" | "err") => void;
}

function newIdemKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `calrate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CalendarSidebar({ propertyId, date, isBooked, rulesSummary, onToast }: Props) {
  const [tab, setTab] = useState<string>("pricing");
  const [bundle, setBundle] = useState<RateBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState({
    isBlocked: false,
    bookingWindowDays: 365,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/rates?property_id=${propertyId}&date=${date}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setBundle(body as RateBundle);
      setAvailability((a) => ({
        ...a,
        isBlocked: body?.master?.is_available === false,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [propertyId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyRate = useCallback(
    async (payload: {
      mode: "master" | "platform";
      rate: number;
      channel_code?: string;
      wipe_overrides?: boolean;
    }) => {
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

  const handleApplyMaster = useCallback(
    async (rate: number, wipeOverrides: boolean) => {
      await applyRate({ mode: "master", rate, wipe_overrides: wipeOverrides });
    },
    [applyRate]
  );

  const handleApplyPlatform = useCallback(
    async (channelCode: string, rate: number) => {
      await applyRate({ mode: "platform", rate, channel_code: channelCode });
    },
    [applyRate]
  );

  const handleResetPlatform = useCallback(
    async (channelCode: string) => {
      const masterRate = bundle?.master?.applied_rate ?? bundle?.master?.base_rate;
      if (masterRate == null) return;
      await applyRate({ mode: "platform", rate: masterRate, channel_code: channelCode });
    },
    [applyRate, bundle]
  );

  const handleUpdateMinStay = useCallback(async (_v: number) => {
    // Min-stay write lands via a follow-up session — no dedicated
    // endpoint yet. The UI state reflects the optimistic value; the
    // caller should refresh after a real push (Session 5d).
    void _v;
    onToast?.("Min stay edit persists in Session 5d", "ok");
  }, [onToast]);

  const handleStatusChange = useCallback(
    async (status: "available" | "blocked") => {
      await applyRate({
        mode: "master",
        rate: bundle?.master?.applied_rate ?? bundle?.master?.base_rate ?? 0,
        wipe_overrides: status === "blocked",
      });
      setAvailability((a) => ({ ...a, isBlocked: status === "blocked" }));
    },
    [applyRate, bundle]
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
          {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
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
            date={date}
            bundle={bundle}
            loading={loading}
            onApplyMaster={handleApplyMaster}
            onApplyPlatform={handleApplyPlatform}
            onResetPlatform={handleResetPlatform}
            onUpdateMinStay={handleUpdateMinStay}
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
