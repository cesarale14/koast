"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Home, Plus, X, Loader2, ChevronRight, Check, ChevronDown } from "lucide-react";
import { PLATFORMS, platformKeyFrom, type PlatformKey } from "@/lib/platforms";
import ChannelPopover from "@/components/channels/ChannelPopover";

/* ---------- Types (keep compatible with server page.tsx) ---------- */
interface PropertyData {
  id: string; name: string; address: string | null; city: string | null;
  state: string | null; property_type: string | null; bedrooms: number | null;
  bathrooms: number | null; max_guests: number | null;
  channex_property_id: string | null; cover_photo_url: string | null;
}
interface ChannelRecord { property_id: string; channel_code: string; channel_name: string; status: string; }
export interface PropertiesPageProps {
  properties: PropertyData[]; channels: ChannelRecord[];
  bookingCounts: Record<string, number>; occupancy: Record<string, number>;
  nextCheckins: Record<string, { date: string; guest: string | null }>;
  monthlyRevenue?: Record<string, number>;
  rating?: Record<string, number>;
  adr?: Record<string, number>;
  currentBooking?: Record<string, { guest: string | null; check_out: string } | null>;
  nextBookingGuest?: Record<string, string | null>;
  cleaningToday?: Record<string, { status: string; cleaner: string | null } | null>;
  tonightRate?: Record<string, number>;
}

/* ---------- Constants ---------- */
const IMPORT_PLATFORMS = [
  { code: "ABB", name: "Airbnb", color: "bg-red-500", letter: "A", desc: "Import your Airbnb listing" },
  { code: "BDC", name: "Booking.com", color: "bg-blue-600", letter: "B", desc: "Import from Booking.com" },
  { code: "VRBO", name: "VRBO", color: "bg-purple-600", letter: "V", desc: "Import from VRBO" },
];
type ImportPlatform = (typeof IMPORT_PLATFORMS)[0];

const BADGE: Record<string, { label: string; bg: string; text: string } | undefined> = {
  ABB: { label: "Airbnb", bg: "bg-red-50", text: "text-red-700" },
  BDC: { label: "Booking.com", bg: "bg-blue-50", text: "text-blue-700" },
  VRBO: { label: "VRBO", bg: "bg-purple-50", text: "text-purple-700" },
  EXP: { label: "Expedia", bg: "bg-yellow-50", text: "text-yellow-700" },
  AGO: { label: "Agoda", bg: "bg-red-50", text: "text-red-700" },
  CTP: { label: "Trip.com", bg: "bg-blue-50", text: "text-blue-700" },
};

/* ---------- Helpers ---------- */
function parseListingUrl(url: string): { platform: string; listingId: string } | null {
  const cleaned = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const airbnbMatch = cleaned.match(/airbnb\.[a-z.]+\/rooms\/(\d+)/);
  if (airbnbMatch) return { platform: "airbnb", listingId: airbnbMatch[1] };
  const bdcMatch = cleaned.match(/booking\.com\/hotel\/[a-z]+\/([^/?]+)/);
  if (bdcMatch) return { platform: "booking_com", listingId: bdcMatch[1] };
  const vrboMatch = cleaned.match(/vrbo\.com\/(\d+)/);
  if (vrboMatch) return { platform: "vrbo", listingId: vrboMatch[1] };
  return null;
}

/* ---------- Step Indicator ---------- */
function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className={`w-2 h-2 rounded-full transition-colors ${current >= s ? "bg-coastal" : "bg-shell"}`} />
      ))}
    </div>
  );
}

/* ---------- Platform Badge (used inside the import modal only) ---------- */
import PlatformLogoIcon from "@/components/ui/PlatformLogo";

/* ---------- Preview Card ---------- */
function PreviewCard({ photo, name, platformCode, bookingCount, onNameChange }: {
  photo: string | null; name: string; platformCode: string; bookingCount?: number; onNameChange?: (v: string) => void;
}) {
  const b = BADGE[platformCode];
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden max-w-md mx-auto">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="h-44 overflow-hidden"><img src={photo} alt={name} className="w-full h-full object-cover" /></div>
      ) : (
        <div className="h-44 bg-gradient-to-br from-[#eef5f0] to-[#d5e8da] flex items-center justify-center"><Home size={36} className="text-[#a8d1b4]" strokeWidth={1.5} /></div>
      )}
      <div className="p-4 space-y-3">
        {b && <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${b.bg} ${b.text}`}>{b.label}</span>}
        {onNameChange ? (
          <input type="text" value={name} onChange={(e) => onNameChange(e.target.value)}
            className="w-full px-3 py-2 text-sm text-coastal border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-coastal/30 focus:border-coastal" />
        ) : (
          <p className="text-sm font-semibold text-coastal">{name}</p>
        )}
        {bookingCount != null && bookingCount > 0 && (
          <p className="text-xs text-tideline">{bookingCount} booking{bookingCount !== 1 ? "s" : ""} imported</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Property Card (Koast grid card) ---------- */
interface PropertyCardData {
  property: PropertyData;
  connectedChannels: ChannelRecord[];
  monthlyRevenue: number;
  occupancy: number;
  rating: number;
  adr: number;
  tonightRate: number;
  currentBooking: { guest: string | null; check_out: string } | null;
  nextCheckin: { date: string; guest: string | null } | null;
  cleaningToday: { status: string; cleaner: string | null } | null;
  index: number;
}

function firstNameLastInitial(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw || /guest$/i.test(raw)) return raw || "Guest";
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const lastInitial = parts[1]?.[0];
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PropertyCard({
  property: p,
  connectedChannels,
  monthlyRevenue,
  occupancy,
  rating,
  adr,
  tonightRate,
  currentBooking,
  nextCheckin,
  cleaningToday,
  index,
}: PropertyCardData) {
  // Derive status from the live data we have. Turnover = cleaning task
  // scheduled for today. Occupied = current active booking. Vacant =
  // neither.
  const isTurnover = !!cleaningToday && cleaningToday.status !== "completed";
  const isOccupied = !!currentBooking && !isTurnover;

  let statusTone: "lagoon" | "golden" | "amber-tide" = "golden";
  let statusText = "Vacant";
  let statusRight: string | null = null;

  if (isTurnover && cleaningToday) {
    statusTone = "amber-tide";
    const label =
      cleaningToday.status === "completed"
        ? "cleaned"
        : cleaningToday.status === "in_progress"
        ? "in progress"
        : cleaningToday.status === "assigned"
        ? "confirmed"
        : "pending";
    statusText = `Turnover today — ${cleaningToday.cleaner ?? "no cleaner"}${cleaningToday.cleaner ? ` ${label}` : ""}`;
  } else if (isOccupied && currentBooking) {
    statusTone = "lagoon";
    const first = firstNameLastInitial(currentBooking.guest);
    statusText = `${first} — checkout ${shortDate(currentBooking.check_out)}`;
    if (nextCheckin) {
      statusRight = `Next: ${firstNameLastInitial(nextCheckin.guest)}`;
    }
  } else if (nextCheckin) {
    statusTone = "golden";
    statusText = `Vacant — next: ${shortDate(nextCheckin.date)}`;
    if (tonightRate > 0) {
      statusRight = `$${tonightRate}/night`;
    }
  } else if (tonightRate > 0) {
    statusTone = "golden";
    statusText = `Open tonight — $${tonightRate}/night`;
  } else {
    statusText = "Vacant";
  }

  const statusColor = `var(--${statusTone})`;
  const revDisplay = monthlyRevenue >= 1000 ? `$${(monthlyRevenue / 1000).toFixed(1)}k` : `$${Math.round(monthlyRevenue)}`;
  const locationLabel = [p.city, p.state].filter(Boolean).join(", ");

  return (
    <Link
      href={`/properties/${p.id}`}
      className="block rounded-2xl overflow-hidden bg-white koast-prop-card"
      style={{
        boxShadow: "var(--shadow-card)",
        animation: `koast-card-reveal 0.55s ease-out ${200 + index * 100}ms both`,
        transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s cubic-bezier(0.4,0,0.2,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-6px) scale(1.01)";
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "translateY(-2px) scale(0.995)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "translateY(-6px) scale(1.01)";
      }}
    >
      {/* Photo */}
      <div className="relative" style={{ height: 180, backgroundColor: "var(--dry-sand)" }}>
        {p.cover_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-shell">
            <Home size={36} strokeWidth={1.5} />
          </div>
        )}
        {/* Bottom gradient overlay */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{ height: 80, background: "linear-gradient(transparent, rgba(0,0,0,0.5))" }}
        />
        {/* Channel badges — top right (wrapped in ChannelPopover) */}
        <div className="absolute top-3 right-3 flex gap-1 z-[2]" onClick={(e) => e.preventDefault()}>
          {connectedChannels.map((ch) => {
            const key: PlatformKey | null = platformKeyFrom(ch.channel_code);
            if (!key) return null;
            const plat = PLATFORMS[key];
            return (
              <ChannelPopover key={ch.channel_code} platform={key} propertyId={p.id}>
                <div
                  className="flex items-center justify-center cursor-pointer"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    backgroundColor: `${plat.color}bf`,
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                  title={plat.name}
                >
                  <Image src={plat.iconWhite} alt={plat.name} width={12} height={12} />
                </div>
              </ChannelPopover>
            );
          })}
        </div>
        {/* Name + location overlaid bottom-left */}
        <div className="absolute left-3 bottom-3 right-3 z-[2]">
          <div
            className="font-bold text-white truncate"
            style={{ fontSize: 17, textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}
          >
            {p.name}
          </div>
          {locationLabel && (
            <div className="text-[12px] text-white/80 truncate" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
              {locationLabel}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-2 px-[14px] py-2 text-[12px] font-semibold"
        style={{ borderBottom: "1px solid var(--dry-sand)", color: statusColor }}
      >
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: 6, height: 6, backgroundColor: statusColor }}
        />
        <span className="truncate">{statusText}</span>
        {statusRight && (
          <span
            className="ml-auto text-[11px] font-medium flex-shrink-0"
            style={{ color: "var(--tideline)" }}
          >
            {statusRight}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex py-3 px-[14px]">
        <Metric label="Revenue" value={revDisplay} />
        <MetricDivider />
        <Metric label="Occupancy" value={`${occupancy}%`} />
        <MetricDivider />
        <Metric label="Rating" value={rating > 0 ? rating.toFixed(1) : "—"} />
        <MetricDivider />
        <Metric label="ADR" value={adr > 0 ? `$${adr}` : "—"} />
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center px-1">
      <div className="text-[17px] font-bold" style={{ color: "var(--coastal)", letterSpacing: "-0.03em" }}>
        {value}
      </div>
      <div
        className="text-[9px] font-bold uppercase mt-0.5"
        style={{ color: "var(--golden)", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
    </div>
  );
}

function MetricDivider() {
  return <div className="w-px self-stretch my-1" style={{ backgroundColor: "var(--dry-sand)" }} />;
}

function AddPropertyTile({ onClick, index }: { onClick: () => void; index: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl flex flex-col items-center justify-center text-center transition-all"
      style={{
        border: "2px dashed var(--dry-sand)",
        minHeight: 340,
        backgroundColor: "rgba(255,255,255,0.5)",
        padding: 24,
        animation: `koast-card-reveal 0.55s ease-out ${200 + index * 100}ms both`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--golden)";
        e.currentTarget.style.backgroundColor = "rgba(196,154,90,0.04)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--dry-sand)";
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.5)";
        e.currentTarget.style.transform = "";
      }}
    >
      <div
        className="flex items-center justify-center mb-[14px]"
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(196,154,90,0.12), rgba(196,154,90,0.04))",
          color: "var(--golden)",
          border: "1px solid rgba(196,154,90,0.15)",
        }}
      >
        <Plus size={24} strokeWidth={2} />
      </div>
      <div className="text-[15px] font-bold mb-1" style={{ color: "var(--coastal)" }}>
        Add property
      </div>
      <div className="text-[12px] max-w-[220px] leading-[1.5]" style={{ color: "var(--tideline)" }}>
        Connect Airbnb, Booking.com, or import via iCal
      </div>
    </button>
  );
}

/* ---------- iCal Help Section ---------- */
function IcalHelp({ platform }: { platform: string }) {
  const [open, setOpen] = useState(false);
  const instructions: Record<string, string[]> = {
    ABB: [
      "Go to your Airbnb listing",
      "Click Calendar \u2192 Availability settings",
      "Scroll to \"Connect calendars\"",
      "Copy the \"Export Calendar\" link",
    ],
    BDC: [
      "Go to your Booking.com Extranet",
      "Click Rates & Availability \u2192 Sync calendars",
      "Copy the iCal export URL",
    ],
    VRBO: [
      "Go to your VRBO listing dashboard",
      "Click Calendar \u2192 Import/Export",
      "Copy the export URL",
    ],
  };
  const steps = instructions[platform] ?? instructions.ABB;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-tideline hover:text-coastal transition-colors">
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        How to find your calendar URL
      </button>
      {open && (
        <ol className="mt-2 ml-5 text-xs text-tideline space-y-1 list-decimal">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}

/* ---------- Full-Screen Add Property Modal (4 steps) ---------- */
function AddPropertyModal({ onClose }: { onClose: (didImport: boolean) => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [platform, setPlatform] = useState<ImportPlatform | null>(null);
  const [listingUrl, setListingUrl] = useState("");
  const [listingId, setListingId] = useState<string | null>(null);
  const [listingName, setListingName] = useState("");
  const [editedName, setEditedName] = useState("");
  const [listingPhoto, setListingPhoto] = useState<string | null>(null);
  const [icalUrl, setIcalUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedProperty, setImportedProperty] = useState<{ id: string; name: string; photo_url: string | null } | null>(null);
  const [bookingCount, setBookingCount] = useState(0);
  const didImport = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(didImport.current); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  /* Step 1: Choose platform */
  const selectPlatform = (p: ImportPlatform) => {
    setPlatform(p); setStep(2); setUrlError(null);
  };

  /* Step 2: Validate URL + fetch preview */
  const validateUrl = useCallback(async () => {
    if (!listingUrl.trim()) return;
    setUrlError(null);
    const parsed = parseListingUrl(listingUrl);
    if (!parsed) {
      setUrlError("Couldn\u2019t find a listing in this URL. Make sure it includes the listing page.");
      return;
    }
    setListingId(parsed.listingId);
    setLoading(true); setLoadMsg("Fetching listing details...");
    try {
      const res = await fetch(`/api/airbnb/listing-details?listingId=${parsed.listingId}`);
      if (res.ok) {
        const d = await res.json();
        const name = d.short_name || d.name || `Listing ${parsed.listingId}`;
        setListingName(name); setEditedName(name);
        setListingPhoto(d.photo_url || null);
      } else {
        setListingName(`Listing ${parsed.listingId}`);
        setEditedName(`Listing ${parsed.listingId}`);
      }
    } catch {
      setListingName(`Listing ${parsed.listingId}`);
      setEditedName(`Listing ${parsed.listingId}`);
    } finally { setLoading(false); }
  }, [listingUrl]);

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") validateUrl();
  };

  /* Step 3 -> 4: Import */
  const handleImport = async (skipIcal: boolean) => {
    setImporting(true);
    try {
      const res = await fetch("/api/properties/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_url: listingUrl,
          custom_name: editedName.trim() || undefined,
          ical_url: skipIcal ? undefined : icalUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      if (data.imported) {
        didImport.current = true;
        setImportedProperty(data.property);
        setBookingCount(data.booking_count ?? 0);
        setStep(4);
      } else {
        throw new Error("Import did not complete.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally { setImporting(false); }
  };

  /* Reset for Add Another */
  const handleAddAnother = () => {
    setPlatform(null); setListingUrl(""); setListingId(null);
    setListingName(""); setEditedName(""); setListingPhoto(null);
    setIcalUrl(""); setUrlError(null); setImportedProperty(null);
    setBookingCount(0); setStep(1);
  };

  const canAdvanceToStep3 = !!listingId && !!listingName && !loading;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button onClick={() => onClose(didImport.current)} className="p-1 rounded-lg text-shell hover:text-tideline hover:bg-shore transition-colors"><X size={20} /></button>
          <h1 className="text-lg font-bold text-coastal">Add a Property</h1>
        </div>
        <StepDots current={step} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">

          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-coastal mb-2">Choose a platform</h2>
              <p className="text-sm text-tideline mb-6">Select where your property is listed</p>
              <div className="space-y-3">
                {IMPORT_PLATFORMS.map((p) => (
                  <button key={p.code} onClick={() => selectPlatform(p)}
                    className="w-full flex items-center gap-4 p-5 rounded-xl border border-[var(--border)] bg-white hover:bg-shore hover:border-shell transition-all group text-left">
                    <PlatformLogoIcon platform={p.code} size="xl" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-coastal">{p.name}</p>
                      <p className="text-xs text-tideline">{p.desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-shell group-hover:text-tideline shrink-0" />
                  </button>
                ))}
                <button disabled className="w-full flex items-center gap-4 p-5 rounded-xl border border-dashed border-shell bg-shore text-left opacity-50 cursor-not-allowed">
                  <div className="w-12 h-12 rounded-full bg-shell flex items-center justify-center text-shell font-bold text-lg shrink-0">+</div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-shell">Add manually</p><p className="text-xs text-shell">Coming soon</p></div>
                </button>
              </div>
            </div>
          )}

          {step === 2 && platform && (
            <div>
              <h2 className="text-xl font-bold text-coastal mb-2">Paste your {platform.name} listing URL</h2>
              <p className="text-sm text-tideline mb-6">We&apos;ll pull in your listing details automatically</p>
              <input
                type="url" autoFocus value={listingUrl}
                onChange={(e) => { setListingUrl(e.target.value); setUrlError(null); setListingId(null); }}
                onBlur={validateUrl} onKeyDown={handleUrlKeyDown}
                placeholder="e.g., airbnb.com/rooms/1234567890"
                className="w-full px-4 py-3 text-sm text-coastal border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-coastal/30 focus:border-coastal placeholder:text-shell"
              />
              {urlError && <p className="mt-2 text-sm text-red-500">{urlError}</p>}

              {loading && (
                <div className="flex items-center gap-2 mt-6 justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-[#3d6b52]" />
                  <p className="text-sm text-tideline">{loadMsg}</p>
                </div>
              )}

              {!loading && listingId && listingName && (
                <div className="mt-6">
                  <PreviewCard photo={listingPhoto} name={editedName} platformCode={platform.code} onNameChange={setEditedName} />
                </div>
              )}

              <div className="mt-8 flex justify-between items-center">
                <button onClick={() => setStep(1)} className="text-sm text-tideline hover:text-coastal transition-colors">&larr; Back</button>
                <button onClick={() => setStep(3)} disabled={!canAdvanceToStep3}
                  className="px-6 py-3 bg-coastal text-white text-sm font-semibold rounded-lg hover:bg-mangrove transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 3 && platform && (
            <div>
              <h2 className="text-xl font-bold text-coastal mb-2">Import existing bookings</h2>
              <p className="text-sm text-tideline mb-6">Paste your calendar export URL to import past and upcoming bookings</p>
              <input
                type="url" value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder={`e.g., airbnb.com/calendar/ical/${listingId ?? "1234567890"}.ics`}
                className="w-full px-4 py-3 text-sm text-coastal border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-coastal/30 focus:border-coastal placeholder:text-shell"
              />
              <IcalHelp platform={platform.code} />

              {importing && (
                <div className="flex items-center gap-2 mt-6 justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-[#3d6b52]" />
                  <p className="text-sm text-tideline">Importing property and syncing bookings...</p>
                </div>
              )}

              <div className="mt-8 flex justify-between items-center">
                <button onClick={() => setStep(2)} className="text-sm text-tideline hover:text-coastal transition-colors">&larr; Back</button>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleImport(true)} disabled={importing}
                    className="px-5 py-3 text-sm font-medium text-tideline bg-shore rounded-lg hover:bg-shell transition-colors disabled:opacity-50">
                    Skip for now
                  </button>
                  <button onClick={() => handleImport(false)} disabled={importing || !icalUrl.trim()}
                    className="px-5 py-3 bg-coastal text-white text-sm font-semibold rounded-lg hover:bg-mangrove transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                    {importing && <Loader2 size={16} className="animate-spin" />}
                    Import &amp; Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-[#eef5f0] rounded-full flex items-center justify-center mx-auto mb-6"><Check size={32} className="text-[#3d6b52]" strokeWidth={2.5} /></div>
                <h2 className="text-xl font-bold text-coastal mb-2">Property added!</h2>
                {bookingCount > 0 && <p className="text-sm text-tideline mb-4">{bookingCount} booking{bookingCount !== 1 ? "s" : ""} imported</p>}
                <div className="mt-4 mb-8">
                  <PreviewCard
                    photo={importedProperty?.photo_url ?? listingPhoto}
                    name={importedProperty?.name ?? editedName ?? listingName}
                    platformCode={platform?.code ?? "ABB"}
                    bookingCount={bookingCount}
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button onClick={handleAddAnother} className="px-5 py-2.5 text-sm font-medium text-tideline bg-shore rounded-lg hover:bg-shell transition-colors">Add Another Property</button>
                  <button onClick={() => onClose(true)} className="px-5 py-2.5 bg-coastal text-white text-sm font-semibold rounded-lg hover:bg-mangrove transition-colors">Go to Dashboard</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function PropertiesPage({
  properties,
  channels,
  nextCheckins,
  occupancy,
  monthlyRevenue,
  rating,
  adr,
  currentBooking,
  cleaningToday,
  tonightRate,
}: PropertiesPageProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const chMap = new Map<string, ChannelRecord[]>();
  const activeChannelTotal = new Set<string>();
  for (const ch of channels) {
    if (ch.status !== "active") continue;
    if (!chMap.has(ch.property_id)) chMap.set(ch.property_id, []);
    chMap.get(ch.property_id)!.push(ch);
    activeChannelTotal.add(`${ch.property_id}:${ch.channel_code}`);
  }

  const closeModal = useCallback((didImport: boolean) => {
    setShowModal(false);
    if (didImport) router.refresh();
  }, [router]);

  if (properties.length === 0) {
    return (
      <div>
        <GlobalAnim />
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--coastal)" }}>
              Properties
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--tideline)" }}>
              0 properties · 0 active channels
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-[10px] text-[13px] font-semibold transition-colors"
            style={{ borderRadius: 10, backgroundColor: "var(--coastal)", color: "var(--shore)" }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Add property
          </button>
        </div>
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
        >
          <AddPropertyTile onClick={() => setShowModal(true)} index={0} />
        </div>
        {showModal && <AddPropertyModal onClose={closeModal} />}
      </div>
    );
  }

  return (
    <div>
      <GlobalAnim />
      <div
        className="flex items-center justify-between mb-8"
        style={{ animation: "koast-fade-up 0.5s ease-out 200ms both" }}
      >
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--coastal)" }}>
            Properties
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--tideline)" }}>
            {properties.length} {properties.length === 1 ? "property" : "properties"} ·{" "}
            {activeChannelTotal.size} active{" "}
            {activeChannelTotal.size === 1 ? "channel" : "channels"}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-[10px] text-[13px] font-semibold transition-all"
          style={{ borderRadius: 10, backgroundColor: "var(--coastal)", color: "var(--shore)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--mangrove)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--coastal)";
            e.currentTarget.style.transform = "";
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add property
        </button>
      </div>
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
      >
        {properties.map((prop, i) => (
          <PropertyCard
            key={prop.id}
            property={prop}
            connectedChannels={chMap.get(prop.id) ?? []}
            monthlyRevenue={monthlyRevenue?.[prop.id] ?? 0}
            occupancy={occupancy[prop.id] ?? 0}
            rating={rating?.[prop.id] ?? 0}
            adr={adr?.[prop.id] ?? 0}
            tonightRate={tonightRate?.[prop.id] ?? 0}
            currentBooking={currentBooking?.[prop.id] ?? null}
            nextCheckin={nextCheckins[prop.id] ?? null}
            cleaningToday={cleaningToday?.[prop.id] ?? null}
            index={i}
          />
        ))}
        <AddPropertyTile onClick={() => setShowModal(true)} index={properties.length} />
      </div>
      {showModal && <AddPropertyModal onClose={closeModal} />}
    </div>
  );
}

function GlobalAnim() {
  return (
    <style jsx global>{`
      @keyframes koast-fade-up {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes koast-card-reveal {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}
