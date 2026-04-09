"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Home, Plus, X, Loader2, ChevronRight, Check, ChevronDown } from "lucide-react";

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
}

/* ---------- Constants ---------- */
const PLATFORMS = [
  { code: "ABB", name: "Airbnb", color: "bg-red-500", letter: "A", desc: "Import your Airbnb listing" },
  { code: "BDC", name: "Booking.com", color: "bg-blue-600", letter: "B", desc: "Import from Booking.com" },
  { code: "VRBO", name: "VRBO", color: "bg-purple-600", letter: "V", desc: "Import from VRBO" },
];
type Platform = (typeof PLATFORMS)[0];

const BADGE: Record<string, { label: string; bg: string; text: string }> = {
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
        <div key={s} className={`w-2 h-2 rounded-full transition-colors ${current >= s ? "bg-emerald-500" : "bg-neutral-200"}`} />
      ))}
    </div>
  );
}

/* ---------- Platform Badge ---------- */
import PlatformLogoIcon, { PlatformBadge as PlatformBadgeUI } from "@/components/ui/PlatformLogo";
function PlatformBadge({ code }: { code: string }) {
  return <PlatformBadgeUI platform={code} />;
}

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
        <div className="h-44 bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center"><Home size={36} className="text-emerald-300" strokeWidth={1.5} /></div>
      )}
      <div className="p-4 space-y-3">
        {b && <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${b.bg} ${b.text}`}>{b.label}</span>}
        {onNameChange ? (
          <input type="text" value={name} onChange={(e) => onNameChange(e.target.value)}
            className="w-full px-3 py-2 text-sm text-neutral-800 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
        ) : (
          <p className="text-sm font-semibold text-neutral-800">{name}</p>
        )}
        {bookingCount != null && bookingCount > 0 && (
          <p className="text-xs text-neutral-500">{bookingCount} booking{bookingCount !== 1 ? "s" : ""} imported</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Property Card (list view) ---------- */
function PropertyCard({ property: p, connectedChannels, bookingCount, occupancy, nextCheckin }: {
  property: PropertyData; connectedChannels: ChannelRecord[];
  bookingCount: number; occupancy: number; nextCheckin: { date: string; guest: string | null } | null;
}) {
  return (
    <Link href={`/properties/${p.id}`} className="bg-neutral-0 rounded-xl border border-[var(--border)] shadow-sm hover:shadow-md transition-all group">
      {p.cover_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="h-40 rounded-t-xl overflow-hidden"><img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /></div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-t-xl flex items-center justify-center"><Home size={32} className="text-emerald-300" strokeWidth={1.5} /></div>
      )}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-neutral-800">{p.name}</h3>
        {(p.city || p.state) && <p className="text-sm text-neutral-500 mt-0.5">{[p.city, p.state].filter(Boolean).join(", ")}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {connectedChannels.length > 0 ? connectedChannels.map((ch) => (
            <PlatformBadge key={ch.channel_code} code={ch.channel_code} />
          )) : <span className="text-xs text-neutral-400">No channels</span>}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
          <div><p className="text-xs text-neutral-400">Bookings</p><p className="text-sm font-semibold font-mono text-neutral-800">{bookingCount}</p></div>
          <div><p className="text-xs text-neutral-400">Occupancy</p><p className="text-sm font-semibold font-mono text-neutral-800">{occupancy}%</p></div>
          <div className="text-right"><p className="text-xs text-neutral-400">Next check-in</p>
            <p className="text-sm font-medium text-neutral-700">{nextCheckin ? new Date(nextCheckin.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014"}</p>
          </div>
        </div>
      </div>
    </Link>
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
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 transition-colors">
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        How to find your calendar URL
      </button>
      {open && (
        <ol className="mt-2 ml-5 text-xs text-neutral-600 space-y-1 list-decimal">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}

/* ---------- Full-Screen Add Property Modal (4 steps) ---------- */
function AddPropertyModal({ onClose }: { onClose: (didImport: boolean) => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [platform, setPlatform] = useState<Platform | null>(null);
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
  const selectPlatform = (p: Platform) => {
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
          <button onClick={() => onClose(didImport.current)} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"><X size={20} /></button>
          <h1 className="text-lg font-bold text-neutral-800">Add a Property</h1>
        </div>
        <StepDots current={step} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">

          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Choose a platform</h2>
              <p className="text-sm text-neutral-500 mb-6">Select where your property is listed</p>
              <div className="space-y-3">
                {PLATFORMS.map((p) => (
                  <button key={p.code} onClick={() => selectPlatform(p)}
                    className="w-full flex items-center gap-4 p-5 rounded-xl border border-[var(--border)] bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-all group text-left">
                    <PlatformLogoIcon platform={p.code} size="xl" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-800">{p.name}</p>
                      <p className="text-xs text-neutral-500">{p.desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-neutral-400 group-hover:text-neutral-600 shrink-0" />
                  </button>
                ))}
                <button disabled className="w-full flex items-center gap-4 p-5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-left opacity-50 cursor-not-allowed">
                  <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 font-bold text-lg shrink-0">+</div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-neutral-400">Add manually</p><p className="text-xs text-neutral-400">Coming soon</p></div>
                </button>
              </div>
            </div>
          )}

          {step === 2 && platform && (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Paste your {platform.name} listing URL</h2>
              <p className="text-sm text-neutral-500 mb-6">We&apos;ll pull in your listing details automatically</p>
              <input
                type="url" autoFocus value={listingUrl}
                onChange={(e) => { setListingUrl(e.target.value); setUrlError(null); setListingId(null); }}
                onBlur={validateUrl} onKeyDown={handleUrlKeyDown}
                placeholder="e.g., airbnb.com/rooms/1234567890"
                className="w-full px-4 py-3 text-sm text-neutral-800 border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-neutral-300"
              />
              {urlError && <p className="mt-2 text-sm text-red-500">{urlError}</p>}

              {loading && (
                <div className="flex items-center gap-2 mt-6 justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-emerald-500" />
                  <p className="text-sm text-neutral-500">{loadMsg}</p>
                </div>
              )}

              {!loading && listingId && listingName && (
                <div className="mt-6">
                  <PreviewCard photo={listingPhoto} name={editedName} platformCode={platform.code} onNameChange={setEditedName} />
                </div>
              )}

              <div className="mt-8 flex justify-between items-center">
                <button onClick={() => setStep(1)} className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors">&larr; Back</button>
                <button onClick={() => setStep(3)} disabled={!canAdvanceToStep3}
                  className="px-6 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 3 && platform && (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Import existing bookings</h2>
              <p className="text-sm text-neutral-500 mb-6">Paste your calendar export URL to import past and upcoming bookings</p>
              <input
                type="url" value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder={`e.g., airbnb.com/calendar/ical/${listingId ?? "1234567890"}.ics`}
                className="w-full px-4 py-3 text-sm text-neutral-800 border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-neutral-300"
              />
              <IcalHelp platform={platform.code} />

              {importing && (
                <div className="flex items-center gap-2 mt-6 justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-emerald-500" />
                  <p className="text-sm text-neutral-500">Importing property and syncing bookings...</p>
                </div>
              )}

              <div className="mt-8 flex justify-between items-center">
                <button onClick={() => setStep(2)} className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors">&larr; Back</button>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleImport(true)} disabled={importing}
                    className="px-5 py-3 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50">
                    Skip for now
                  </button>
                  <button onClick={() => handleImport(false)} disabled={importing || !icalUrl.trim()}
                    className="px-5 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
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
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6"><Check size={32} className="text-emerald-500" strokeWidth={2.5} /></div>
                <h2 className="text-xl font-bold text-neutral-800 mb-2">Property added!</h2>
                {bookingCount > 0 && <p className="text-sm text-neutral-500 mb-4">{bookingCount} booking{bookingCount !== 1 ? "s" : ""} imported</p>}
                <div className="mt-4 mb-8">
                  <PreviewCard
                    photo={importedProperty?.photo_url ?? listingPhoto}
                    name={importedProperty?.name ?? editedName ?? listingName}
                    platformCode={platform?.code ?? "ABB"}
                    bookingCount={bookingCount}
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button onClick={handleAddAnother} className="px-5 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">Add Another Property</button>
                  <button onClick={() => onClose(true)} className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors">Go to Dashboard</button>
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
export default function PropertiesPage({ properties, channels, bookingCounts, occupancy, nextCheckins }: PropertiesPageProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const chMap = new Map<string, ChannelRecord[]>();
  for (const ch of channels) {
    if (ch.status !== "active") continue;
    if (!chMap.has(ch.property_id)) chMap.set(ch.property_id, []);
    chMap.get(ch.property_id)!.push(ch);
  }

  const closeModal = useCallback((didImport: boolean) => {
    setShowModal(false);
    if (didImport) router.refresh();
  }, [router]);

  if (properties.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6"><Home size={32} className="text-emerald-500" strokeWidth={1.5} /></div>
            <h1 className="text-2xl font-bold text-neutral-800 mb-2">Add your first property</h1>
            <p className="text-neutral-500 mb-8">Import from Airbnb, Booking.com, or VRBO to get started</p>
            <button onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2 mx-auto">
              <Plus size={16} />Add Property
            </button>
          </div>
        </div>
        {showModal && <AddPropertyModal onClose={closeModal} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-neutral-800">Properties</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors"><Plus size={16} />Add Property</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {properties.map((prop) => (
          <PropertyCard key={prop.id} property={prop} connectedChannels={chMap.get(prop.id) ?? []}
            bookingCount={bookingCounts[prop.id] ?? 0} occupancy={occupancy[prop.id] ?? 0}
            nextCheckin={nextCheckins[prop.id] ?? null} />
        ))}
      </div>
      {showModal && <AddPropertyModal onClose={closeModal} />}
    </div>
  );
}
