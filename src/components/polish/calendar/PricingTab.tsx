"use client";

/**
 * Pricing tab for the Calendar sidebar. Master rate on top + stacked
 * per-platform rows + WhyThisRate disclosure + min-stay stepper.
 */

import Image from "next/image";
import { useCallback, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import RateCell from "./RateCell";
import WhyThisRate from "./WhyThisRate";

export interface PlatformEntry {
  channel_code: string;
  channel_name: string;
  applied_rate: number | null;
  overrides_master: boolean;
}

export interface RateBundle {
  master: {
    base_rate: number | null;
    suggested_rate: number | null;
    applied_rate: number | null;
    rate_source: string | null;
    factors: Record<string, unknown> | null;
    min_stay: number | null;
    is_available: boolean;
    updated_at: string | null;
  };
  platforms: PlatformEntry[];
}

interface Props {
  propertyId: string;
  date: string;
  bundle: RateBundle | null;
  loading: boolean;
  onApplyMaster: (rate: number, wipeOverrides: boolean) => Promise<void>;
  onApplyPlatform: (channelCode: string, rate: number) => Promise<void>;
  onResetPlatform: (channelCode: string) => Promise<void>;
  onUpdateMinStay: (value: number) => Promise<void>;
}

// Map property_channels channel_code to PlatformKey (for logos).
function toPlatformKey(code: string): PlatformKey | null {
  const c = code.toUpperCase();
  if (c === "ABB" || c === "AIRBNB") return "airbnb";
  if (c === "BDC" || c === "BOOKING" || c === "BOOKING_COM") return "booking_com";
  if (c === "DIRECT") return "direct";
  return null;
}

export default function PricingTab({
  propertyId: _propertyId,
  date: _date,
  bundle,
  loading,
  onApplyMaster,
  onApplyPlatform,
  onResetPlatform,
  onUpdateMinStay,
}: Props) {
  void _propertyId;
  void _date;
  const [wipeChoice, setWipeChoice] = useState<"all" | "base" | null>(null);
  const [masterEditPending, setMasterEditPending] = useState<number | null>(null);

  const master = bundle?.master;
  const platforms = bundle?.platforms ?? [];
  const overrideCount = platforms.filter((p) => p.overrides_master).length;
  const minStay = master?.min_stay ?? 1;

  const handleMasterCommit = useCallback(
    async (rate: number) => {
      if (overrideCount === 0) {
        await onApplyMaster(rate, false);
        return;
      }
      // Overrides exist — surface the radio prompt.
      setMasterEditPending(rate);
      setWipeChoice(null);
    },
    [overrideCount, onApplyMaster]
  );

  const handleMasterConfirm = useCallback(
    async (choice: "all" | "base") => {
      if (masterEditPending == null) return;
      await onApplyMaster(masterEditPending, choice === "all");
      setMasterEditPending(null);
      setWipeChoice(null);
    },
    [masterEditPending, onApplyMaster]
  );

  if (loading && !bundle) {
    return <div style={{ padding: 16, fontSize: 13, color: "var(--tideline)" }}>Loading rates…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      {/* Master rate */}
      <section>
        <div style={eyebrowStyle}>Master rate</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <RateCell
            value={master?.applied_rate ?? master?.base_rate ?? null}
            placeholder="Set rate"
            ariaLabel="Master rate"
            onCommit={handleMasterCommit}
          />
          {master?.suggested_rate != null && master.suggested_rate !== (master.applied_rate ?? master.base_rate) && (
            <span style={{ fontSize: 12, color: "var(--tideline)" }}>
              Koast suggests ${Math.round(master.suggested_rate)}
            </span>
          )}
        </div>
        {masterEditPending != null && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--dry-sand)",
              background: "#FAFAF7",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--coastal)", lineHeight: 1.45 }}>
              This date has {overrideCount} platform override{overrideCount === 1 ? "" : "s"}. How should ${masterEditPending} apply?
            </div>
            <label style={radioRowStyle}>
              <input
                type="radio"
                name="master-wipe"
                checked={wipeChoice === "all"}
                onChange={() => setWipeChoice("all")}
              />
              <span>
                <strong>Apply to all platforms</strong> (clears {overrideCount} override{overrideCount === 1 ? "" : "s"})
              </span>
            </label>
            <label style={radioRowStyle}>
              <input
                type="radio"
                name="master-wipe"
                checked={wipeChoice === "base"}
                onChange={() => setWipeChoice("base")}
              />
              <span>
                <strong>Update base only</strong> (keep overrides)
              </span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setMasterEditPending(null)}
                style={{ ...btnStyle, background: "transparent", border: "1px solid var(--dry-sand)", color: "var(--tideline)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!wipeChoice}
                onClick={() => void handleMasterConfirm(wipeChoice!)}
                style={{ ...btnStyle, background: "var(--coastal)", color: "var(--shore)", opacity: wipeChoice ? 1 : 0.5 }}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Per-platform rows */}
      <section>
        <div style={eyebrowStyle}>Per platform</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {platforms.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--tideline)" }}>No channels connected.</div>
          )}
          {platforms.map((p) => (
            <PlatformRow
              key={p.channel_code}
              entry={p}
              masterRate={master?.applied_rate ?? master?.base_rate ?? null}
              onApply={(rate) => onApplyPlatform(p.channel_code, rate)}
              onReset={() => onResetPlatform(p.channel_code)}
            />
          ))}
        </div>
      </section>

      {/* Min stay */}
      <section>
        <div style={eyebrowStyle}>Min stay</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => void onUpdateMinStay(Math.max(1, minStay - 1))}
            style={stepBtn}
            aria-label="Decrease min stay"
          >
            <Minus size={14} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--coastal)", minWidth: 30, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {minStay}
          </span>
          <button
            type="button"
            onClick={() => void onUpdateMinStay(minStay + 1)}
            style={stepBtn}
            aria-label="Increase min stay"
          >
            <Plus size={14} />
          </button>
          <span style={{ fontSize: 12, color: "var(--tideline)" }}>night{minStay === 1 ? "" : "s"}</span>
        </div>
      </section>

      {/* Why this rate */}
      <WhyThisRate factors={master?.factors ?? null} />
    </div>
  );
}

function PlatformRow({
  entry,
  masterRate,
  onApply,
  onReset,
}: {
  entry: PlatformEntry;
  masterRate: number | null;
  onApply: (rate: number) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const key = toPlatformKey(entry.channel_code);
  const platform = key ? PLATFORMS[key] : null;
  const tileColor = platform?.tileColor ?? "#3d6b52";
  const bg = `${tileColor}bf`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid var(--dry-sand)",
        background: "#fff",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.2)",
          background: bg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {platform && <Image src={platform.iconWhite} alt="" width={12} height={12} />}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)" }}>{entry.channel_name}</div>
        {entry.overrides_master && masterRate != null && (
          <button
            type="button"
            onClick={() => void onReset()}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 11,
              color: "var(--tideline)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Reset to master (${Math.round(masterRate)})
          </button>
        )}
      </div>
      <RateCell
        value={entry.applied_rate}
        ariaLabel={`${entry.channel_name} rate`}
        onCommit={(r) => onApply(r)}
        size="sm"
      />
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--tideline)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const radioRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "var(--coastal)",
  cursor: "pointer",
};

const btnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const stepBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "1px solid var(--dry-sand)",
  background: "#fff",
  color: "var(--coastal)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
