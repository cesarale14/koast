"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChannelLogo } from "./ChannelLogo";
import { useChannelRates, type ChannelBlock } from "@/lib/hooks/useChannelRates";

type Props = {
  propertyId: string;
  dates: string[];
  baseRate: number | null;
};

/**
 * Per-channel rate editing block that lives in the calendar right-side
 * settings panel. Renders one card per connected channel (Airbnb, BDC, VRBO)
 * with an editable rate, markup %, and sync indicator. Rates come live from
 * Channex via useChannelRates so what's shown is ground truth, not stale DB.
 */
export function PerChannelRateEditor({ propertyId, dates, baseRate }: Props) {
  const dateFrom = dates[0] ?? null;
  const dateTo = dates[dates.length - 1] ?? null;

  const { data, loading, error, refresh, patchChannelRate } = useChannelRates(
    propertyId,
    dateFrom,
    dateTo
  );

  if (!dateFrom || !dateTo) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#c9a96e]">
          Channel rates
        </h3>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-[#3d6b52] hover:text-[#1a3a2a] disabled:opacity-50"
          title="Re-fetch live rates from Channex"
        >
          <svg
            className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {baseRate != null && (
        <div className="mb-3 rounded-lg bg-[#efe9dd]/50 border border-[#efe9dd] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#3d6b52]">
            Base rate (engine)
          </div>
          <div className="text-lg font-bold text-[#1a3a2a] tabular-nums" style={{ letterSpacing: "-0.03em" }}>
            ${baseRate}
          </div>
        </div>
      )}

      {loading && !data && <LoadingSkeleton />}

      {error && !data && (
        <div className="rounded-lg border border-[#c44040]/30 bg-[#c44040]/5 px-3 py-2 text-xs text-[#c44040]">
          Failed to load: {error}
          <button
            onClick={refresh}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {data && data.channels.length === 0 && (
        <div className="rounded-lg border border-[#efe9dd] bg-[#f8f6f1] px-3 py-4 text-xs text-[#3d6b52]">
          No channels connected yet. Connect Booking.com, Vrbo, or Airbnb from
          the property&apos;s channel settings.
        </div>
      )}

      {data && data.channex_error && (
        <div className="mb-3 rounded-lg border border-[#b8860b]/30 bg-[#b8860b]/5 px-3 py-2 text-[11px] text-[#b8860b]">
          Live rates unavailable — showing stored values. ({data.channex_error})
        </div>
      )}

      {data && data.channels.length > 0 && (
        <div className="space-y-2">
          {data.channels.map((ch) => (
            <ChannelCard
              // Key includes propertyId + date range so the card remounts
              // (and resets its local rate/markup state) whenever the user
              // switches property or selects a different date range.
              key={`${propertyId}:${ch.channel_code}:${dateFrom}:${dateTo}`}
              propertyId={propertyId}
              channel={ch}
              dates={dates}
              baseRate={baseRate}
              onSaved={(rate) => {
                for (const d of dates) patchChannelRate(ch.channel_code, d, rate);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[86px] rounded-lg bg-[#efe9dd]/40 animate-pulse"
        />
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------

type CardProps = {
  propertyId: string;
  channel: ChannelBlock;
  dates: string[];
  baseRate: number | null;
  onSaved: (rate: number) => void;
};

function ChannelCard({ propertyId, channel, dates, baseRate, onSaved }: CardProps) {
  // For range selection, show the average of the current live rates. For a
  // single date it's just that date's rate.
  const currentRate = useMemo(() => {
    const vals: number[] = [];
    for (const d of dates) {
      const entry = channel.dates[d];
      if (entry?.rate != null) vals.push(entry.rate);
    }
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [channel.dates, dates]);

  // Mismatch if any date in the range is flagged
  const anyMismatch = useMemo(
    () => dates.some((d) => channel.dates[d]?.mismatch === true),
    [channel.dates, dates]
  );

  const initialRate = currentRate ?? (baseRate ?? 0);
  const [rate, setRate] = useState<number>(initialRate);
  const [markup, setMarkup] = useState<number>(() => {
    if (baseRate && baseRate > 0 && currentRate != null) {
      return Math.round(((currentRate / baseRate) - 1) * 100);
    }
    return 0;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // If the fetched rate changes (e.g. refresh), reset local state to it
  useEffect(() => {
    setRate(currentRate ?? (baseRate ?? 0));
    if (baseRate && baseRate > 0 && currentRate != null) {
      setMarkup(Math.round(((currentRate / baseRate) - 1) * 100));
    }
  }, [currentRate, baseRate]);

  const dirty = rate !== initialRate && rate > 0;

  const applyMarkup = useCallback(
    (pct: number) => {
      setMarkup(pct);
      if (baseRate != null && baseRate > 0) {
        setRate(Math.round(baseRate * (1 + pct / 100)));
      }
    },
    [baseRate]
  );

  const applyRate = useCallback(
    (r: number) => {
      setRate(r);
      if (baseRate != null && baseRate > 0) {
        setMarkup(Math.round(((r / baseRate) - 1) * 100));
      }
    },
    [baseRate]
  );

  const handleSave = useCallback(async () => {
    if (!dirty || !channel.editable) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/channels/rates/${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_from: dates[0],
          date_to: dates[dates.length - 1],
          channel_code: channel.channel_code,
          rate,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      if (body.push_error) {
        setSaveError(`Saved locally but push failed: ${body.push_error}`);
      } else {
        onSaved(rate);
        setSavedAt(Date.now());
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [channel.channel_code, channel.editable, dates, dirty, onSaved, propertyId, rate]);

  // ---- status pill ----
  let statusPillClass = "bg-[#eef5f0] text-[#1a3a2a]";
  let statusLabel = channel.status;
  if (channel.status === "pending_authorization") {
    statusPillClass = "bg-[#fff4d6] text-[#b8860b]";
    statusLabel = "Pending auth";
  } else if (channel.status === "active") {
    statusLabel = "Active";
  } else if (channel.status !== "active") {
    statusPillClass = "bg-[#efe9dd] text-[#3d6b52]";
  }

  // ---- setup needed state (e.g. VRBO without a rate plan linked) ----
  if (channel.needs_setup) {
    return (
      <div className="rounded-lg border border-[#efe9dd] bg-[#f8f6f1] px-3 py-3 opacity-80">
        <div className="flex items-center gap-2 mb-2">
          <ChannelLogo code={channel.channel_code} />
          <span className="text-sm font-semibold text-[#1a3a2a]">{channel.channel_name}</span>
          <span className={`ml-auto text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusPillClass}`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-[11px] text-[#3d6b52] mb-2">
          {channel.setup_hint ?? "Finish channel setup to push rates."}
        </p>
        <a
          href="/settings"
          className="inline-flex items-center justify-center text-[11px] font-semibold text-[#1a3a2a] bg-[#c9a96e] hover:bg-[#d4bc8a] rounded px-3 py-1.5"
        >
          Connect rate plan
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#efe9dd] bg-white px-3 py-3">
      <div className="flex items-center gap-2 mb-2">
        <ChannelLogo code={channel.channel_code} />
        <span className="text-sm font-semibold text-[#1a3a2a]">{channel.channel_name}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusPillClass}`}>
          {statusLabel}
        </span>
        <SyncIndicator mismatch={anyMismatch} editable={channel.editable} savedAt={savedAt} />
      </div>

      {!channel.editable && channel.read_only_reason && (
        <p className="text-[10px] text-[#3d6b52] mb-2">{channel.read_only_reason}</p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#3d6b52]">$</span>
          <input
            type="number"
            value={rate || ""}
            disabled={!channel.editable}
            onChange={(e) => applyRate(Number(e.target.value) || 0)}
            className="w-full pl-5 pr-2 py-1.5 text-sm border border-[#efe9dd] rounded focus:outline-none focus:ring-2 focus:ring-[#3d6b52]/30 disabled:bg-[#f8f6f1] disabled:text-[#3d6b52]"
            placeholder="—"
            min={0}
            step={1}
          />
        </div>
        {baseRate != null && baseRate > 0 && (
          <div className="flex-1 relative">
            <input
              type="number"
              value={Number.isFinite(markup) ? markup : 0}
              disabled={!channel.editable}
              onChange={(e) => applyMarkup(Number(e.target.value) || 0)}
              className="w-full pl-2 pr-6 py-1.5 text-sm border border-[#efe9dd] rounded focus:outline-none focus:ring-2 focus:ring-[#3d6b52]/30 disabled:bg-[#f8f6f1] disabled:text-[#3d6b52] tabular-nums"
              placeholder="markup"
              step={1}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#3d6b52]">%</span>
          </div>
        )}
      </div>

      {saveError && (
        <p className="text-[11px] text-[#c44040] mt-2">{saveError}</p>
      )}

      {dirty && channel.editable && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-2 w-full bg-[#1a3a2a] hover:bg-[#264d38] disabled:opacity-60 text-white text-[11px] font-semibold uppercase tracking-wide py-1.5 rounded"
        >
          {saving ? "Saving…" : `Save & push${dates.length > 1 ? ` (${dates.length} days)` : ""}`}
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function SyncIndicator({
  mismatch,
  editable,
  savedAt,
}: {
  mismatch: boolean;
  editable: boolean;
  savedAt: number | null;
}) {
  // Recent save → briefly show "Saved"
  if (savedAt && Date.now() - savedAt < 3000) {
    return (
      <span className="ml-auto text-[10px] font-semibold text-[#1a3a2a] flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Saved
      </span>
    );
  }
  if (!editable) {
    return (
      <span className="ml-auto text-[10px] text-[#3d6b52]">Read-only</span>
    );
  }
  if (mismatch) {
    return (
      <span
        className="ml-auto text-[10px] font-semibold text-[#b8860b] flex items-center gap-1"
        title="Rate differs from Koast's stored value"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.515 2.625H3.72c-1.345 0-2.188-1.458-1.515-2.625L8.485 2.495zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
        Out of sync
      </span>
    );
  }
  return (
    <span className="ml-auto text-[10px] text-[#3d6b52] flex items-center gap-1">
      <svg className="w-3 h-3 text-[#1a3a2a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      In sync
    </span>
  );
}
