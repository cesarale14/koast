"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  useFloating,
  offset,
  flip,
  shift,
  arrow,
  autoUpdate,
  useHover,
  useFocus,
  useDismiss,
  useInteractions,
  useRole,
  FloatingArrow,
  FloatingPortal,
} from "@floating-ui/react";
import {
  DollarSign,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  Star,
  X,
} from "lucide-react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { useToast } from "@/components/ui/Toast";

// ============ Types ============

interface ChannelDetails {
  status: "synced" | "degraded" | "disconnected";
  channel_status: string | null;
  stats: { bookings: number; revenue: number; rating: number };
  connection: {
    listing_id: string | null;
    last_synced: string | null;
    last_synced_ago: string;
    sync_method: string;
    channex_property_id: string | null;
    channex_channel_id: string | null;
  };
  listing_url: string | null;
}

interface ChannelPopoverProps {
  platform: PlatformKey;
  propertyId: string;
  children: ReactNode;
}

// ============ Data hook ============

function useChannelDetails(propertyId: string, platform: PlatformKey, enabled: boolean) {
  const [data, setData] = useState<ChannelDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch(`/api/channels/details/${propertyId}/${platform}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [propertyId, platform, enabled]);

  return { data, loading };
}

// ============ Main component ============

export default function ChannelPopover({ platform, propertyId, children }: ChannelPopoverProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isMobile) {
    return (
      <MobileSheet
        platform={platform}
        propertyId={propertyId}
        open={open}
        onOpenChange={setOpen}
      >
        {children}
      </MobileSheet>
    );
  }

  return (
    <DesktopPopover
      platform={platform}
      propertyId={propertyId}
      open={open}
      onOpenChange={setOpen}
    >
      {children}
    </DesktopPopover>
  );
}

// ============ Desktop popover ============

function DesktopPopover({
  platform,
  propertyId,
  open,
  onOpenChange,
  children,
}: {
  platform: PlatformKey;
  propertyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const arrowRef = useRef<SVGSVGElement | null>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: "bottom",
    middleware: [
      offset(10),
      flip({ fallbackPlacements: ["top", "right", "left"] }),
      shift({ padding: 12 }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { delay: { open: 200, close: 100 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const { data, loading } = useChannelDetails(propertyId, platform, open);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
        className="inline-flex"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {children}
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[60]"
          >
            <div
              className="w-[340px] rounded-2xl bg-white overflow-hidden"
              style={{
                boxShadow: "var(--shadow-card-hover)",
                border: "1px solid var(--dry-sand)",
                animation: "koast-pop-in 0.15s ease-out",
              }}
            >
              <PopoverContent
                platform={platform}
                propertyId={propertyId}
                data={data}
                loading={loading}
              />
            </div>
            <FloatingArrow
              ref={arrowRef}
              context={context}
              fill="white"
              strokeWidth={1}
              stroke="var(--dry-sand)"
              width={14}
              height={7}
            />
          </div>
        </FloatingPortal>
      )}

      <style jsx global>{`
        @keyframes koast-pop-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

// ============ Mobile bottom sheet ============

function MobileSheet({
  platform,
  propertyId,
  open,
  onOpenChange,
  children,
}: {
  platform: PlatformKey;
  propertyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const { data, loading } = useChannelDetails(propertyId, platform, open);

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="inline-flex"
        aria-haspopup="dialog"
      >
        {children}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
            onClick={() => onOpenChange(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-hidden"
            style={{
              maxHeight: "70vh",
              animation: "koast-sheet-up 0.3s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--shell)" }} />
            </div>
            {/* Close button */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute top-3 right-4 p-1 rounded-full transition-colors"
              style={{ color: "var(--tideline)" }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 40px)" }}>
              <PopoverContent
                platform={platform}
                propertyId={propertyId}
                data={data}
                loading={loading}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes koast-sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// ============ Shared popover content ============

function PopoverContent({
  platform,
  propertyId,
  data,
  loading,
}: {
  platform: PlatformKey;
  propertyId: string;
  data: ChannelDetails | null;
  loading: boolean;
}) {
  const platformInfo = PLATFORMS[platform];
  const { toast } = useToast();

  const syncStatus = data?.status ?? "disconnected";
  const statusLabel =
    syncStatus === "synced"
      ? "In sync"
      : syncStatus === "degraded"
      ? "Out of sync"
      : "Disconnected";
  const statusColor =
    syncStatus === "synced"
      ? "var(--lagoon)"
      : syncStatus === "degraded"
      ? "var(--amber-tide)"
      : "var(--coral-reef)";

  const [pushing, setPushing] = useState(false);

  const handlePushRates = useCallback(async () => {
    setPushing(true);
    try {
      const res = await fetch(`/api/pricing/push/${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 60 }),
      });
      if (!res.ok) throw new Error("Push failed");
      toast(`Rates pushed to ${platformInfo.name}`);
    } catch {
      toast("Rate push failed", "error");
    }
    setPushing(false);
  }, [propertyId, platformInfo.name, toast]);

  return (
    <div>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: platformInfo.color,
          }}
        >
          <Image src={platformInfo.iconWhite} alt={platformInfo.name} width={20} height={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold" style={{ color: "var(--coastal)" }}>
            {platformInfo.name}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[10px] font-semibold flex-shrink-0"
          style={{
            backgroundColor:
              syncStatus === "synced"
                ? "rgba(26,122,90,0.1)"
                : syncStatus === "degraded"
                ? "rgba(212,150,11,0.1)"
                : "rgba(196,64,64,0.1)",
            color: statusColor,
          }}
        >
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          {statusLabel}
        </span>
      </div>

      {/* Stats */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        <SectionLabel label="Performance" />
        {loading && !data ? (
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex-1 h-12 rounded-lg animate-pulse" style={{ backgroundColor: "var(--dry-sand)" }} />
            ))}
          </div>
        ) : (
          <div className="flex">
            <MiniStat label="Bookings" value={String(data?.stats.bookings ?? 0)} />
            <StatDivider />
            <MiniStat label="Revenue" value={`$${(data?.stats.revenue ?? 0).toLocaleString("en-US")}`} />
            <StatDivider />
            <MiniStat
              label="Rating"
              value={data?.stats.rating ? data.stats.rating.toFixed(1) : "—"}
              icon={data?.stats.rating ? <Star size={10} style={{ color: "var(--golden)" }} fill="var(--golden)" /> : undefined}
            />
          </div>
        )}
      </div>

      {/* Connection details */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        <SectionLabel label="Connection" />
        {loading && !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 rounded animate-pulse" style={{ backgroundColor: "var(--dry-sand)", width: `${70 - i * 15}%` }} />
            ))}
          </div>
        ) : (
          <ConnectionDetails data={data} toast={toast} />
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4">
        <SectionLabel label="Manage" />
        <div className="space-y-1">
          <ActionRow
            icon={<DollarSign size={14} />}
            label="Edit rates"
            href={`/calendar?property=${propertyId}&panel=rates`}
          />
          <ActionButton
            icon={<RefreshCw size={14} className={pushing ? "animate-spin" : ""} />}
            label={pushing ? "Pushing..." : "Push rates now"}
            onClick={handlePushRates}
            disabled={pushing}
          />
          {data?.listing_url && (
            <ActionRow
              icon={<ExternalLink size={14} />}
              label={`View on ${platformInfo.name}`}
              href={data.listing_url}
              external
            />
          )}
          {(syncStatus === "disconnected" || syncStatus === "degraded") && (
            <ActionButton
              icon={<AlertCircle size={14} />}
              label="Reconnect"
              onClick={() => toast("Reconnect flow coming soon")}
              highlight
            />
          )}
        </div>

        <Link
          href={`/properties/${propertyId}`}
          className="block mt-4 text-center text-[11px] font-semibold transition-colors"
          style={{ color: "var(--tideline)" }}
        >
          Advanced settings →
        </Link>
      </div>
    </div>
  );
}

// ============ Sub-components ============

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="mb-3 text-[10px] font-bold tracking-[0.08em] uppercase"
      style={{ color: "var(--golden)" }}
    >
      {label}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex-1 text-center">
      <div
        className="text-[18px] font-bold tabular-nums flex items-center justify-center gap-1"
        style={{ color: "var(--coastal)", letterSpacing: "-0.03em" }}
      >
        {icon}
        {value}
      </div>
      <div
        className="text-[10px] font-bold uppercase mt-0.5"
        style={{ color: "var(--golden)", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
    </div>
  );
}

function StatDivider() {
  return <div className="w-px self-stretch my-1" style={{ backgroundColor: "var(--dry-sand)" }} />;
}

function ConnectionDetails({
  data,
  toast,
}: {
  data: ChannelDetails | null;
  toast: (msg: string, type?: "success" | "error") => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyListingId = useCallback(() => {
    if (!data?.connection.listing_id) return;
    navigator.clipboard.writeText(data.connection.listing_id).then(() => {
      setCopied(true);
      toast("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data, toast]);

  if (!data) return null;
  const c = data.connection;

  return (
    <div className="space-y-2 text-[12px]">
      <DetailRow label="Listing ID">
        <span className="font-mono truncate max-w-[140px] inline-block align-middle" style={{ color: "var(--coastal)" }}>
          {c.listing_id ?? "—"}
        </span>
        {c.listing_id && (
          <button
            type="button"
            onClick={copyListingId}
            className="ml-1 inline-flex items-center justify-center transition-colors"
            style={{ color: "var(--tideline)" }}
            title="Copy"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}
      </DetailRow>
      <DetailRow label="Last synced">
        <span style={{ color: "var(--coastal)" }}>{c.last_synced_ago}</span>
      </DetailRow>
      <DetailRow label="Sync method">
        <span style={{ color: "var(--coastal)" }}>{c.sync_method}</span>
      </DetailRow>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[11px] font-medium transition-colors mt-2"
        style={{ color: "var(--tideline)" }}
      >
        <ChevronDown
          size={12}
          className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
        />
        Advanced
      </button>
      {showAdvanced && (
        <div className="pl-4 space-y-1.5 pt-1">
          <DetailRow label="Channex property">
            <span className="font-mono text-[10px]" style={{ color: "var(--tideline)" }}>
              {c.channex_property_id ?? "—"}
            </span>
          </DetailRow>
          <DetailRow label="Channex channel">
            <span className="font-mono text-[10px]" style={{ color: "var(--tideline)" }}>
              {c.channex_channel_id ?? "—"}
            </span>
          </DetailRow>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--tideline)" }}>{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  href,
  external,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  external?: boolean;
}) {
  const props = external ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};
  return (
    <Link
      href={href}
      {...props}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-colors"
      style={{ color: "var(--coastal)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(237,231,219,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "";
      }}
    >
      <span style={{ color: "var(--tideline)" }}>{icon}</span>
      {label}
      {external && (
        <span className="ml-auto" style={{ color: "var(--tideline)" }}>
          <ExternalLink size={10} />
        </span>
      )}
    </Link>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
      style={{
        color: highlight ? "var(--golden)" : "var(--coastal)",
        backgroundColor: highlight ? "rgba(196,154,90,0.1)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!highlight) e.currentTarget.style.backgroundColor = "rgba(237,231,219,0.4)";
      }}
      onMouseLeave={(e) => {
        if (!highlight) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span style={{ color: highlight ? "var(--golden)" : "var(--tideline)" }}>{icon}</span>
      {label}
    </button>
  );
}
