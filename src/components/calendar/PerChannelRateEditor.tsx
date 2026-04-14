"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useChannelRates, type ChannelBlock } from "@/lib/hooks/useChannelRates";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

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
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--golden)" }}>
          Channel rates
        </h3>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] transition-colors disabled:opacity-50"
          style={{ color: "var(--tideline)" }}
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

      {loading && !data && <LoadingSkeleton />}

      {error && !data && (
        <div
          className="rounded-[10px] px-3 py-2 text-xs"
          style={{
            border: "1px solid rgba(196,64,64,0.2)",
            backgroundColor: "rgba(196,64,64,0.04)",
            color: "var(--coral-reef)",
          }}
        >
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
        <div
          className="rounded-[10px] px-3 py-3 text-xs"
          style={{
            border: "1px solid var(--dry-sand)",
            backgroundColor: "var(--shore)",
            color: "var(--tideline)",
          }}
        >
          No channels connected yet. Connect Booking.com, Vrbo, or Airbnb from the property&apos;s
          channel settings.
        </div>
      )}

      {data && data.channex_error && (
        <div
          className="mb-3 rounded-[10px] px-3 py-2 text-[11px]"
          style={{
            border: "1px solid rgba(212,150,11,0.25)",
            backgroundColor: "rgba(212,150,11,0.05)",
            color: "var(--amber-tide)",
          }}
        >
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
          className="h-[116px] rounded-[14px] animate-pulse"
          style={{ backgroundColor: "var(--dry-sand)" }}
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

  const platformKey = platformKeyFrom(channel.channel_code);
  const platform = platformKey ? PLATFORMS[platformKey] : null;

  // ---- setup needed state ----
  if (channel.needs_setup) {
    return (
      <GlossyWrapper dim>
        <div className="flex items-center gap-2 mb-2 relative z-[1]">
          {platform && (
            <div
              className="flex items-center justify-center rounded-md"
              style={{ width: 22, height: 22, backgroundColor: platform.color }}
            >
              <Image src={platform.iconWhite} alt={platform.name} width={14} height={14} />
            </div>
          )}
          <span className="text-[13px] font-semibold" style={{ color: "var(--coastal)" }}>
            {channel.channel_name}
          </span>
        </div>
        <p className="text-[11px] mb-2 relative z-[1]" style={{ color: "var(--tideline)" }}>
          {channel.setup_hint ?? "Finish channel setup to push rates."}
        </p>
        <a
          href="/settings"
          className="inline-flex items-center justify-center text-[11px] font-semibold rounded-[8px] px-3 py-1.5 relative z-[1] transition-colors"
          style={{ backgroundColor: "var(--golden)", color: "var(--deep-sea)" }}
        >
          Connect rate plan
        </a>
      </GlossyWrapper>
    );
  }

  const markupLabel =
    baseRate == null || baseRate === 0
      ? null
      : markup === 0
      ? "Base"
      : `${markup > 0 ? "+" : ""}${markup}%`;

  return (
    <GlossyWrapper>
      <div className="flex items-center justify-between mb-[10px] relative z-[1]">
        <div className="flex items-center gap-2">
          {platform && (
            <div
              className="flex items-center justify-center rounded-md"
              style={{ width: 22, height: 22, backgroundColor: platform.color }}
            >
              <Image src={platform.iconWhite} alt={platform.name} width={14} height={14} />
            </div>
          )}
          <div className="text-[13px] font-semibold" style={{ color: "var(--coastal)" }}>
            {channel.channel_name}
          </div>
        </div>
        <SyncIndicator mismatch={anyMismatch} editable={channel.editable} savedAt={savedAt} />
      </div>

      {!channel.editable && channel.read_only_reason && (
        <p className="text-[10px] mb-2 relative z-[1]" style={{ color: "var(--tideline)" }}>
          {channel.read_only_reason}
        </p>
      )}

      <div className="flex items-center gap-[10px] relative z-[1]">
        <div className="flex-1 relative">
          <span
            className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[14px] font-semibold"
            style={{ color: "var(--tideline)" }}
          >
            $
          </span>
          <input
            type="number"
            value={rate || ""}
            disabled={!channel.editable}
            onChange={(e) => applyRate(Number(e.target.value) || 0)}
            className="w-full outline-none transition-all tabular-nums"
            style={{
              padding: "9px 10px 9px 24px",
              border: "1.5px solid var(--dry-sand)",
              borderRadius: 10,
              fontSize: 17,
              fontWeight: 700,
              color: "var(--coastal)",
              backgroundColor: "rgba(255,255,255,0.7)",
              letterSpacing: "-0.02em",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--golden)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--dry-sand)";
              e.currentTarget.style.boxShadow = "";
            }}
            placeholder="—"
            min={0}
            step={1}
          />
        </div>
        {markupLabel && (
          <div
            className="text-[11px] font-semibold px-2 py-[5px] rounded-[8px] whitespace-nowrap"
            style={{ backgroundColor: "var(--shore)", color: "var(--tideline)" }}
          >
            {markupLabel}
          </div>
        )}
      </div>

      {saveError && (
        <p className="text-[11px] mt-2 relative z-[1]" style={{ color: "var(--coral-reef)" }}>
          {saveError}
        </p>
      )}

      {dirty && channel.editable && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="relative z-[1] mt-2 w-full text-[12px] font-semibold transition-colors disabled:opacity-60"
          style={{
            padding: 9,
            borderRadius: 10,
            backgroundColor: "var(--coastal)",
            color: "var(--shore)",
          }}
        >
          {saving ? "Saving…" : `Save & push${dates.length > 1 ? ` (${dates.length} days)` : ""}`}
        </button>
      )}
    </GlossyWrapper>
  );
}

// Glossy card shell matching DESIGN_SYSTEM.md Section 7.5 — gradient bg,
// reflection overlay on top half, warm dry-sand border.
function GlossyWrapper({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div
      className="relative overflow-hidden mb-2 transition-all"
      style={{
        borderRadius: 14,
        padding: "14px 16px",
        background: "linear-gradient(165deg, rgba(255,255,255,0.95) 0%, rgba(247,243,236,0.8) 100%)",
        border: "1px solid rgba(237,231,219,0.8)",
        boxShadow:
          "0 1px 3px rgba(19,46,32,0.04), 0 4px 16px rgba(19,46,32,0.03), inset 0 1px 0 rgba(255,255,255,1)",
        opacity: dim ? 0.75 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow =
          "0 2px 6px rgba(19,46,32,0.06), 0 8px 28px rgba(19,46,32,0.07), inset 0 1px 0 rgba(255,255,255,1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow =
          "0 1px 3px rgba(19,46,32,0.04), 0 4px 16px rgba(19,46,32,0.03), inset 0 1px 0 rgba(255,255,255,1)";
      }}
    >
      {/* Reflection overlay on the top half */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: "50%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)",
          borderRadius: "14px 14px 0 0",
        }}
      />
      {children}
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
  if (savedAt && Date.now() - savedAt < 3000) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-semibold"
        style={{ color: "var(--lagoon)" }}
      >
        <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "var(--lagoon)" }} />
        Saved
      </span>
    );
  }
  if (!editable) {
    return (
      <span className="text-[10px] font-semibold" style={{ color: "var(--tideline)" }}>
        Read-only
      </span>
    );
  }
  if (mismatch) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-semibold"
        style={{ color: "var(--amber-tide)" }}
        title="Rate differs from Koast's stored value"
      >
        <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "var(--amber-tide)" }} />
        Out of sync
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-semibold"
      style={{ color: "var(--lagoon)" }}
    >
      <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "var(--lagoon)" }} />
      In sync
    </span>
  );
}
