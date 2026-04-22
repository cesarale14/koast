"use client";

/**
 * Pricing tab for the Calendar sidebar — Session 5b.3 multi-date
 * edition. Three independent rate cards (Base / Airbnb / Booking.com)
 * each display the currently-saved value for the selected date set
 * (single value when uniform, "$min–$max" when divergent), accept
 * inline edits, and fire a Save that either pushes immediately
 * (single date) or opens a BulkRateConfirmModal (multi date).
 *
 * Data input: `bundleByDate` — a Map<date, RateBundle> fetched by
 * the parent CalendarSidebar. Each card derives its display value
 * by reducing across the selected dates.
 */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import WhyThisRate from "./WhyThisRate";
import BulkRateConfirmModal, { type DateDiff, type BulkModalMode } from "./BulkRateConfirmModal";

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

type PerDateStatus = { date: string; status: "ok" | "failed"; error?: string };

interface Props {
  propertyId: string;
  selectedDates: string[];
  bookedDates: Set<string>;
  bundleByDate: Map<string, RateBundle>;
  loading: boolean;
  onToast?: (text: string, tone: "ok" | "err") => void;
  onApplyPlatformBulk: (channelCode: string, rate: number, dates: string[]) => Promise<{ ok: boolean; perDate?: PerDateStatus[]; error?: string }>;
  onApplyBaseBulk: (rate: number, dates: string[], masterPush?: boolean) => Promise<{
    ok: boolean;
    error?: string;
    channels?: Record<string, { pushed: number; failed: Array<{ date: string; error: string }> }>;
  }>;
  onRefresh: () => Promise<void>;
}

type CardKey = "base" | "ABB" | "BDC";

// Map channel_code → PlatformKey for logo lookup.
function toPlatformKey(code: string): PlatformKey | null {
  const c = code.toUpperCase();
  if (c === "ABB" || c === "AIRBNB") return "airbnb";
  if (c === "BDC" || c === "BOOKING" || c === "BOOKING_COM") return "booking_com";
  if (c === "DIRECT") return "direct";
  return null;
}

// Reduce a list of numeric values to { min, max, uniform? }.
// Returns null when the list is empty.
function summarize(values: Array<number | null>): { min: number; max: number; uniform: boolean } | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  let min = nums[0];
  let max = nums[0];
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { min, max, uniform: min === max };
}

function fmtMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded.toLocaleString("en-US")}`;
  return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtSummary(summary: { min: number; max: number; uniform: boolean } | null): string {
  if (!summary) return "";
  if (summary.uniform) return fmtMoney(summary.min);
  return `${fmtMoney(summary.min)}–${fmtMoney(summary.max)}`;
}

// Per-card effective rate for a single date:
//   base  → bundle.master.applied_rate (falls back to base_rate)
//   ABB/BDC → platform override's applied_rate (falls back to master's rate if no override)
function perDateRate(bundle: RateBundle, card: CardKey): number | null {
  const master = bundle.master;
  const masterVal = master.applied_rate ?? master.base_rate ?? null;
  if (card === "base") return masterVal;
  const p = bundle.platforms.find((x) => x.channel_code.toUpperCase() === card);
  return p?.applied_rate ?? masterVal;
}

export default function PricingTab({
  propertyId,
  selectedDates,
  bookedDates,
  bundleByDate,
  loading,
  onToast,
  onApplyPlatformBulk,
  onApplyBaseBulk,
  onRefresh,
}: Props) {
  void propertyId;

  // Per-card input state. Each card independently tracks whether the
  // user has typed a value that diverges from the card's display value.
  const [draftByCard, setDraftByCard] = useState<Record<CardKey, string>>({
    base: "",
    ABB: "",
    BDC: "",
  });

  // Session 5b.4 — ephemeral master-push toggle on the Base card.
  // Resets on mount, selection change, commit, and cancel. Never
  // persisted; master-push should always be an in-the-moment choice.
  const [masterPush, setMasterPush] = useState(false);

  // Modal state — which card triggered the modal, and its precomputed
  // DateDiff[] so the user sees a stable snapshot while the server call
  // is in flight.
  const [modalFor, setModalFor] = useState<null | { card: CardKey; newRate: number; diffs: DateDiff[]; mode: BulkModalMode }>(null);

  // Available channel codes based on whichever bundle happens to be
  // loaded (they all share the same connected channels for a property).
  const channels = useMemo<string[]>(() => {
    for (const bundle of Array.from(bundleByDate.values())) {
      return bundle.platforms.map((p) => p.channel_code.toUpperCase());
    }
    return [];
  }, [bundleByDate]);

  // Session 5b.4 — active-channel list with display names for the
  // master-push toggle label and the modal's per-platform columns.
  // Currently scoped to channels the base master-push path knows how
  // to handle (ABB / BDC). Extend when new channels come online.
  const activeChannelsList = useMemo<Array<{ code: string; name: string }>>(() => {
    const supported: Record<string, string> = { ABB: "Airbnb", BDC: "Booking.com" };
    return channels.filter((c) => supported[c]).map((c) => ({ code: c, name: supported[c] }));
  }, [channels]);

  const masterPushLabel = useMemo(() => {
    if (activeChannelsList.length === 0) return null;
    const names = activeChannelsList.map((c) => c.name).join(" + ");
    return `Also push to ${names}`;
  }, [activeChannelsList]);

  // Selected dates present in the loaded bundle map (ignoring dates
  // that failed to load). These drive all per-card computations.
  const loadedDates = useMemo(
    () => selectedDates.filter((d) => bundleByDate.has(d)).sort(),
    [selectedDates, bundleByDate]
  );

  // Per-card summary: min/max/uniform across loadedDates.
  const summaryByCard = useMemo<Record<CardKey, ReturnType<typeof summarize>>>(() => {
    const fn = (card: CardKey) =>
      summarize(loadedDates.map((d) => perDateRate(bundleByDate.get(d)!, card)));
    return { base: fn("base"), ABB: fn("ABB"), BDC: fn("BDC") };
  }, [bundleByDate, loadedDates]);

  // Factors from the anchor date (first selected) drive WhyThisRate.
  const anchorBundle = loadedDates[0] ? bundleByDate.get(loadedDates[0])! : null;
  const minStay = anchorBundle?.master?.min_stay ?? 1;

  // Reset draft when selection changes — otherwise a stale draft from
  // a previous selection would bleed into the new card display.
  // Session 5b.4 — the master-push toggle also resets here so it
  // never bleeds across selections.
  const loadedKey = useMemo(() => loadedDates.join("|"), [loadedDates]);
  useEffect(() => {
    setDraftByCard({ base: "", ABB: "", BDC: "" });
    setModalFor(null);
    setMasterPush(false);
    // Intentionally keyed on the serialized loadedDates so identity
    // churn doesn't thrash.
  }, [loadedKey]);

  const draftParsed = useCallback((card: CardKey): number | null => {
    const s = draftByCard[card].trim();
    if (s === "") return null;
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [draftByCard]);

  const isDirty = useCallback((card: CardKey): boolean => {
    const draft = draftParsed(card);
    if (draft == null) return false;
    const summary = summaryByCard[card];
    if (!summary) return true;
    if (!summary.uniform) return true; // any concrete uniform value is a change vs a range
    return draft !== summary.min;
  }, [draftParsed, summaryByCard]);

  const handleCardSave = useCallback(async (card: CardKey) => {
    const rate = draftParsed(card);
    if (rate == null) {
      onToast?.("Enter a valid rate first", "err");
      return;
    }
    if (loadedDates.length === 0) {
      onToast?.("No dates loaded", "err");
      return;
    }
    const doingMasterPush = card === "base" && masterPush && activeChannelsList.length > 0;
    // Multi-date → open modal. Single-date → fire immediately.
    if (loadedDates.length > 1) {
      const diffs: DateDiff[] = loadedDates.map((d) => {
        const bundle = bundleByDate.get(d)!;
        const perChannelOld: Record<string, number | null> = {};
        if (doingMasterPush) {
          for (const c of activeChannelsList) {
            const p = bundle.platforms.find((x) => x.channel_code.toUpperCase() === c.code);
            perChannelOld[c.code] = p?.overrides_master ? p.applied_rate : null;
          }
        }
        return {
          date: d,
          oldRate: perDateRate(bundle, card),
          newRate: rate,
          hasBooking: bookedDates.has(d),
          perChannelOld: doingMasterPush ? perChannelOld : undefined,
        };
      });
      const mode: BulkModalMode = card === "base"
        ? {
            kind: "base",
            masterPush: doingMasterPush,
            activeChannels: doingMasterPush ? activeChannelsList : undefined,
            overridesAffected: loadedDates.filter((d) => {
              const b = bundleByDate.get(d)!;
              return b.platforms.some((p) => p.overrides_master);
            }).length,
          }
        : { kind: "platform", platform: card === "ABB" ? "Airbnb" : "Booking.com" };
      setModalFor({ card, newRate: rate, diffs, mode });
      return;
    }
    // Single-date — direct push, no modal.
    const onlyDate = loadedDates[0];
    if (card === "base") {
      const r = await onApplyBaseBulk(rate, [onlyDate], doingMasterPush);
      if (!r.ok) {
        onToast?.(r.error ?? "Base rate update failed", "err");
        return;
      }
      if (doingMasterPush) {
        const names = activeChannelsList.map((c) => c.name).join(" + ");
        onToast?.(`Base rate saved, pushed to ${names}`, "ok");
      } else {
        onToast?.("Base rate updated", "ok");
      }
    } else {
      const r = await onApplyPlatformBulk(card, rate, [onlyDate]);
      if (!r.ok) {
        onToast?.(r.error ?? "Push failed", "err");
        return;
      }
      const pushed = r.perDate?.filter((p) => p.status === "ok").length ?? 1;
      const platformName = card === "ABB" ? "Airbnb" : "Booking.com";
      onToast?.(`${platformName} rate updated${pushed === 0 ? " (no push)" : ""}`, "ok");
    }
    setDraftByCard((d) => ({ ...d, [card]: "" }));
    if (card === "base") setMasterPush(false);
    await onRefresh();
  }, [draftParsed, loadedDates, bundleByDate, bookedDates, onApplyBaseBulk, onApplyPlatformBulk, onToast, onRefresh, masterPush, activeChannelsList]);

  // Modal commit — calls the bulk helper and returns null on total
  // success or a partial-failure shape. Throws on total failure (the
  // modal treats thrown errors as total failure via onDone).
  const handleModalCommit = useCallback(async (): Promise<{ diffs: DateDiff[] } | null> => {
    if (!modalFor) return null;
    const { card, newRate, diffs, mode } = modalFor;
    const dates = diffs.map((d) => d.date);
    if (card === "base") {
      const wantsMasterPush = mode.kind === "base" && mode.masterPush === true;
      const r = await onApplyBaseBulk(newRate, dates, wantsMasterPush);
      if (!r.ok) throw new Error(r.error ?? "Base rate update failed");
      if (!wantsMasterPush) return null;
      // Master-push: inspect per-channel failures for partial-failure UX.
      const ch = r.channels ?? {};
      const failedByChannel = new Map<string, Map<string, string>>();
      let anyFailed = false;
      for (const code of Object.keys(ch)) {
        const fails = ch[code].failed;
        if (fails.length === 0) continue;
        anyFailed = true;
        const m = new Map<string, string>();
        for (const f of fails) m.set(f.date, f.error);
        failedByChannel.set(code, m);
      }
      if (!anyFailed) return null;
      const annotated = diffs.map((d) => {
        const perChannelStatus: Record<string, "ok" | "failed"> = {};
        const perChannelErrors: Record<string, string> = {};
        for (const code of Object.keys(ch)) {
          const fail = failedByChannel.get(code)?.get(d.date);
          if (fail) {
            perChannelStatus[code] = "failed";
            perChannelErrors[code] = fail;
          } else {
            perChannelStatus[code] = "ok";
          }
        }
        return { ...d, perChannelStatus, perChannelErrors };
      });
      return { diffs: annotated };
    }
    const r = await onApplyPlatformBulk(card, newRate, dates);
    if (!r.ok) throw new Error(r.error ?? "Push failed");
    // Inspect per-date outcomes; if any failed, surface partial failure.
    const per = r.perDate ?? [];
    const statusByDate = new Map(per.map((p) => [p.date, p] as const));
    const anyFailed = per.some((p) => p.status === "failed");
    if (!anyFailed) return null;
    const annotated = diffs.map((d) => {
      const s = statusByDate.get(d.date);
      return { ...d, status: s?.status ?? "ok" as const, error: s?.error };
    });
    return { diffs: annotated };
  }, [modalFor, onApplyBaseBulk, onApplyPlatformBulk]);

  const handleModalDone = useCallback((msg: string) => {
    // For base + master-push total success, synthesize a richer toast
    // that names the channels we pushed to — the modal's own message
    // doesn't have master-push context.
    let toastMsg = msg;
    if (
      modalFor?.card === "base" &&
      modalFor.mode.kind === "base" &&
      modalFor.mode.masterPush
    ) {
      const names = activeChannelsList.map((c) => c.name).join(" + ");
      const n = modalFor.diffs.length;
      toastMsg = `${n} base rate${n === 1 ? "" : "s"} updated, pushed to ${names}`;
    }
    onToast?.(toastMsg, "ok");
    setDraftByCard((d) => ({ ...d, ...(modalFor ? { [modalFor.card]: "" } : {}) }));
    if (modalFor?.card === "base") setMasterPush(false);
    setModalFor(null);
    void onRefresh();
  }, [onToast, onRefresh, modalFor, activeChannelsList]);

  const handleModalCancel = useCallback(() => {
    // Reset toggle on cancel too — master-push should always be a
    // fresh active decision.
    if (modalFor?.card === "base") setMasterPush(false);
    setModalFor(null);
  }, [modalFor]);

  const handleMinStay = useCallback((v: number) => {
    void v;
    onToast?.("Min stay edit persists in Session 5d", "ok");
  }, [onToast]);

  if (loading && bundleByDate.size === 0) {
    return <div style={{ padding: 16, fontSize: 13, color: "var(--tideline)" }}>Loading rates…</div>;
  }

  const baseSummary = summaryByCard.base;
  const basePlaceholder = baseSummary ? fmtSummary(baseSummary) : "Set rate";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <section>
        <div style={eyebrowStyle}>Base rate across all channels</div>
        <div
          title="Applies to every channel unless a per-channel override is set."
          style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}
        >
          <RateInput
            display={basePlaceholder}
            value={draftByCard.base}
            onChange={(v) => setDraftByCard((d) => ({ ...d, base: v }))}
            onEscape={() => setDraftByCard((d) => ({ ...d, base: "" }))}
            onEnter={() => void handleCardSave("base")}
            ariaLabel="Base rate across all dates"
          />
          {isDirty("base") && (
            <SaveButton onClick={() => void handleCardSave("base")} />
          )}
        </div>
        {anchorBundle?.master?.suggested_rate != null &&
          baseSummary?.uniform &&
          anchorBundle.master.suggested_rate !== baseSummary.min && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--tideline)" }}>
              Koast suggests ${Math.round(anchorBundle.master.suggested_rate)}
            </div>
          )}
        {masterPushLabel && (
          <label
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--coastal)",
              fontWeight: 400,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={masterPush}
              onChange={(e) => setMasterPush(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "var(--coastal)" }}
            />
            <span>{masterPushLabel}</span>
          </label>
        )}
      </section>

      <section>
        <div style={eyebrowStyle}>Per platform</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {channels.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--tideline)" }}>No channels connected.</div>
          )}
          {channels.map((code) => {
            const cardKey = (code.toUpperCase() === "ABB" ? "ABB" : code.toUpperCase() === "BDC" ? "BDC" : null) as CardKey | null;
            if (!cardKey) return null; // unsupported channel in this session
            const summary = summaryByCard[cardKey];
            const placeholder = summary ? fmtSummary(summary) : "Set rate";
            const baseSummaryMatch =
              summary && summaryByCard.base && summary.uniform && summaryByCard.base.uniform && summary.min === summaryByCard.base.min;
            const inherits = summary == null ? false : baseSummaryMatch ?? false;
            const platformKey = toPlatformKey(code);
            const platform = platformKey ? PLATFORMS[platformKey] : null;
            const tileColor = platform?.tileColor ?? "#3d6b52";
            const platformName = platformKey === "airbnb" ? "Airbnb" : platformKey === "booking_com" ? "Booking.com" : code;
            return (
              <div
                key={code}
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
                  aria-label={platformName}
                  title={platformName}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: `${tileColor}bf`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {platform && <Image src={platform.iconWhite} alt="" width={12} height={12} />}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  {inherits && (
                    <span style={{ fontSize: 11, color: "var(--tideline)", fontStyle: "italic" }} title="No per-platform override exists; this card falls back to the base rate.">
                      inherits base
                    </span>
                  )}
                  <RateInput
                    display={placeholder}
                    value={draftByCard[cardKey]}
                    onChange={(v) => setDraftByCard((d) => ({ ...d, [cardKey]: v }))}
                    onEscape={() => setDraftByCard((d) => ({ ...d, [cardKey]: "" }))}
                    onEnter={() => void handleCardSave(cardKey)}
                    ariaLabel={`${platformName} rate`}
                    size="sm"
                  />
                  {isDirty(cardKey) && (
                    <SaveButton onClick={() => void handleCardSave(cardKey)} size="sm" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div style={eyebrowStyle}>Min stay</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => handleMinStay(Math.max(1, minStay - 1))} style={stepBtn} aria-label="Decrease min stay">
            <Minus size={14} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--coastal)", minWidth: 30, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {minStay}
          </span>
          <button type="button" onClick={() => handleMinStay(minStay + 1)} style={stepBtn} aria-label="Increase min stay">
            <Plus size={14} />
          </button>
          <span style={{ fontSize: 12, color: "var(--tideline)" }}>night{minStay === 1 ? "" : "s"}</span>
        </div>
      </section>

      <WhyThisRate factors={anchorBundle?.master?.factors ?? null} />

      {modalFor && (
        <BulkRateConfirmModal
          mode={modalFor.mode}
          diffs={modalFor.diffs}
          onCancel={handleModalCancel}
          onCommit={handleModalCommit}
          onDone={handleModalDone}
        />
      )}
    </div>
  );
}

// Inline text input that renders the currently-saved display value as
// placeholder text (range "$100–$150" or single "$185") and accepts
// pure-number typing. Escape clears; Enter commits via the parent's
// onEnter callback.
function RateInput({
  display,
  value,
  onChange,
  onEscape,
  onEnter,
  ariaLabel,
  size = "md",
}: {
  display: string;
  value: string;
  onChange: (v: string) => void;
  onEscape: () => void;
  onEnter: () => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={value}
      placeholder={display}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onEscape();
        } else if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      style={{
        width: size === "sm" ? 90 : 120,
        height: size === "sm" ? 30 : 36,
        padding: "0 10px",
        fontSize: size === "sm" ? 13 : 15,
        fontWeight: 600,
        color: "var(--coastal)",
        background: "#fff",
        border: "1px solid var(--dry-sand)",
        borderRadius: 8,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        outline: "none",
      }}
    />
  );
}

function SaveButton({ onClick, size = "md" }: { onClick: () => void; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: size === "sm" ? 30 : 36,
        padding: size === "sm" ? "0 12px" : "0 14px",
        borderRadius: 8,
        border: "none",
        background: "var(--coastal)",
        color: "var(--shore)",
        fontSize: size === "sm" ? 12 : 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      Save
    </button>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--tideline)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
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
